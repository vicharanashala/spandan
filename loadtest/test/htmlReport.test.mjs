// Offline HTML report: rendering of every important state (PASS / FAIL / N/A / INFO, unavailable
// tracing and clocks, late-as-reported-only, outages and poll recovery, v1 files), escaping of
// hostile values, bounded output, and the file-based generator.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { renderHtmlReport, escapeHtml, MAX_TEXT, MAX_ROWS } from '../lib/htmlReport.mjs'
import { DeliveryTracker } from '../lib/delivery.mjs'
import { deliverySection, outageSection, verdict } from '../lib/report.mjs'
import { buildReport, newestResult, htmlPathFor } from '../lib/reportFile.mjs'
import { execFileSync } from 'node:child_process'
import { symlinkSync, rmSync, rmdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const T0 = 1_700_000_000_000
function student(index, seqs, { lastSeq = Math.max(0, ...seqs), lateBy = 10, clockComparable = true, hello = true } = {}) {
  const tr = new DeliveryTracker({ clockComparable })
  if (hello) tr.hello({ s: 'A', n: 0 })
  for (const n of seqs) tr.receive('counts:updated', { s: 'A', n, t: T0 }, T0 + lateBy)
  return { student: index, traced: hello, delivery: tr.summary({ A: { lastSeq } }), outages: [] }
}
const outage = (o = {}) => ({ student: 2, atSec: 12.5, reason: 'transport close', outageMs: 1400, rejoinMs: 60, resyncMs: 110, missedSeqs: 3, missedQuestions: [{ questionId: 'q2', poll: 2, recovered: true }], recovered: true, stuck: false, ...o })

/** A schemaVersion 2 result shaped exactly like run.mjs writes it. */
function makeResult({ finished = [student(1, [1, 2, 3]), student(2, [1, 2, 3])], outages = [], polls, unavailableReason = 'backend event tracing is off' } = {}) {
  const operations = {
    login: { n: 3, min: 50, mean: 70, p50: 70, p95: 90, p99: 90, max: 95, ok: 3, errorCount: 0, errorRate: 0, errors: {} },
    answer: { n: 6, min: 20, mean: 30, p50: 30, p95: 1800, p99: 1900, max: 2000, ok: 5, errorCount: 1, errorRate: 16.7, errors: { 'http_409:poll_closed': 1 } }
  }
  polls = polls || [
    { poll: 1, type: 'MCQ', questionId: 'q1', deliveredTo: 3, recoveredByResync: 0, notDelivered: 0, answersAccepted: 3, answersRejected: 0 },
    { poll: 2, type: 'TF', questionId: 'q2', deliveredTo: 2, recoveredByResync: 1, notDelivered: 0, answersAccepted: 2, answersRejected: 0 }
  ]
  const delivery = deliverySection(finished, { ledgerAvailable: true, lateMs: 2000, unavailableReason })
  const out = outageSection(outages, { traced: delivery.status === 'traced' })
  const events = { studentsJoined: 3 }
  return {
    schemaVersion: 2, tool: 'spandan-loadtest', startedAt: '2026-11-06T10:00:00.000Z', endedAt: '2026-11-06T10:02:00.000Z', aborted: false,
    config: { api: 'http://localhost:3001/api', students: 3, rampSeconds: 2, answerSeconds: 10, lateMs: 2000 },
    summary: { durationSeconds: 120, operations, connections: { studentsJoined: 3, studentsFailed: 0, connectFailures: 0, connectErrors: 0, disconnects: outages.length, disconnectReasons: {}, reconnects: outages.length }, roomEndedReceived: 3 },
    polls,
    generator: { processCpuAvg: 10, processCpuPeak: 20, machineCpuAvg: 30, machineCpuPeak: 40, cores: 8, loopLagP99PeakMs: 35, warnings: [], possibleBottleneck: false },
    server: { available: false, reason: 'backend metrics are disabled' },
    delivery, outages: out,
    errorSamples: [{ op: 'answer', kind: 'http_409:poll_closed', message: 'HTTP 409 poll_closed on /responses', atSec: 30.2 }],
    timeline: [],
    verdict: verdict({ operations, events, polls, roomEndedReceived: 3, delivery, outages: out }, { students: 3 })
  }
}
const between = (html, from, to) => { const a = html.indexOf(from); return html.slice(a, html.indexOf(to, a + from.length)) }

describe('escapeHtml', () => {
  test('escapes markup and quotes and caps length', () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
    assert.equal(escapeHtml(null), '')
    assert.equal(escapeHtml('x'.repeat(MAX_TEXT + 50)).length, MAX_TEXT + 1)
  })
})

describe('renderHtmlReport', () => {
  test('is a self-contained page: no scripts, no remote resources, strict CSP', () => {
    const html = renderHtmlReport(makeResult())
    assert.match(html, /^<!doctype html>/)
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'/)
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /\b(src|href)="(https?:)?\/\//i)
    assert.doesNotMatch(html, /<link /i)
    // default-src does not cover these two; both must be locked down explicitly.
    assert.match(html, /base-uri 'none'/)
    assert.match(html, /form-action 'none'/)
  })

  test('a hostile schema version in an old file is escaped exactly once', () => {
    const r = makeResult()
    delete r.delivery
    delete r.outages
    r.schemaVersion = '<img src=x onerror=alert(1)>'
    const html = renderHtmlReport(r)
    assert.ok(!html.includes('<img src=x'))
    assert.match(html, /Delivery tracking: <span class="na">not recorded in this result file \(schema v&lt;img src=x onerror=alert\(1\)&gt;\)/)
    assert.match(html, /Outage records: <span class="na">not recorded in this result file \(schema v&lt;img/)
    assert.doesNotMatch(html, /&amp;lt;/) // no double escaping anywhere
  })

  test('shows the overall verdict and PASS / FAIL checks', () => {
    const html = renderHtmlReport(makeResult())
    assert.match(html, /OVERALL: FAIL/) // answer p95 and error rate are over the limits
    assert.match(html, /<span class="pill fail">FAIL<\/span><\/td><td>answer p95 &lt;= 1500ms/)
    assert.match(html, /<span class="pill pass">PASS<\/span><\/td><td>login p95 &lt;= 2000ms/)
    assert.match(html, /<span class="bad-text">1800<\/span>/) // p95 over its limit is highlighted
    assert.match(html, /http_409:poll_closed ×1/)
  })

  test('clean traced run passes; late events sit under reported-only, not failures', () => {
    const r = makeResult({ finished: [student(1, [1, 2]), student(2, [1, 2], { lateBy: 5000 })] })
    r.summary.operations.answer = { ...r.summary.operations.login }
    r.verdict = verdict({ operations: r.summary.operations, events: { studentsJoined: 2 }, polls: [], roomEndedReceived: 2, delivery: r.delivery, outages: r.outages }, { students: 2 })
    const html = renderHtmlReport(r)
    assert.match(html, /OVERALL: PASS/)
    const failures = between(html, '<h3>Failures</h3>', '<h3>Reported only</h3>')
    const reportedOnly = between(html, '<h3>Reported only</h3>', '<h3>By event type</h3>')
    assert.doesNotMatch(failures, /Late/)
    assert.match(reportedOnly, /Late \(&gt; 2000 ms\)<\/div><div class="stat-value">2<\/div><div class="stat-note">reported only, never fails/)
    assert.match(html, /<span class="pill info">INFO<\/span><\/td><td>late broadcasts \(&gt; 2000ms, reported only\)/)
  })

  test('out-of-order, duplicates and losses show as failures', () => {
    const html = renderHtmlReport(makeResult({ finished: [student(1, [1, 3, 2, 2]), student(2, [1, 2], { lastSeq: 4 })] }))
    const failures = between(html, '<h3>Failures</h3>', '<h3>Reported only</h3>')
    assert.match(failures, /stat bad"><div class="stat-label">Out of order<\/div><div class="stat-value">1</)
    assert.match(failures, /stat bad"><div class="stat-label">Duplicates<\/div><div class="stat-value">1</)
    assert.match(failures, /stat bad"><div class="stat-label">Lost while connected<\/div><div class="stat-value">2</)
    assert.match(failures, /of which at the tail<\/div><div class="stat-value">2</)
    assert.match(html, /FAIL<\/span><\/td><td>no out-of-order broadcasts/)
    assert.match(html, /<h3>Students with the most issues<\/h3>.*<td>2<\/td><td>2<\/td><td>2<\/td>/s)
  })

  test('tracing unavailable is explicit, and its checks are N/A (not passed)', () => {
    const html = renderHtmlReport(makeResult({ finished: [student(1, [], { hello: false })] }))
    assert.match(html, /<strong>Unavailable\.<\/strong> backend event tracing is off\. The tracing checks are N\/A, not passed\./)
    assert.match(html, /<span class="pill na-pill">N\/A<\/span><\/td><td>no broadcasts lost while connected<\/td><td><span class="na">unavailable: backend event tracing is off<\/span>/)
    assert.match(html, /\d+ passed, \d+ failed, 3 not measurable/)
    assert.doesNotMatch(html, /<h3>Failures<\/h3>/)
  })

  test('remote clock: late and latency are unavailable, not 0', () => {
    const html = renderHtmlReport(makeResult({ finished: [student(1, [1, 2], { clockComparable: false })] }))
    const reportedOnly = between(html, '<h3>Reported only</h3>', '<h3>By event type</h3>')
    assert.match(reportedOnly, /Late \(&gt; 2000 ms\)<\/div><div class="stat-value"><span class="na">unavailable<\/span>/)
    assert.match(reportedOnly, /Delivery latency<\/div><div class="stat-value"><span class="na">unavailable<\/span>/)
    assert.match(html, /Clock: <strong><span class="na">unavailable \(remote target\)<\/span>/)
  })

  test('outages: summary, stuck and not-recovered polls, per-record recovery', () => {
    const html = renderHtmlReport(makeResult({
      outages: [outage(), outage({ student: 3, stuck: true, rejoinMs: null, missedQuestions: [{ questionId: 'q2', poll: 2, recovered: false }], recovered: false })]
    }))
    assert.match(html, /Outages<\/div><div class="stat-value">2</)
    assert.match(html, /stat bad"><div class="stat-label">Stuck<\/div><div class="stat-value">1</)
    assert.match(html, /stat bad"><div class="stat-label">Not recovered<\/div><div class="stat-value">1</)
    assert.match(html, /<td>poll 2 ✓<\/td><td><span class="pill pass">PASS/)
    assert.match(html, /<td>poll 2 ✗<\/td><td><span class="pill fail">FAIL<\/span><\/td><td><span class="pill fail">FAIL/)
    assert.match(html, /Re-join \(p50 \/ p95 \/ max ms\)<\/div><div class="stat-value">60 \/ 60 \/ 60/)
  })

  test('no outages, and untraced re-join time', () => {
    assert.match(renderHtmlReport(makeResult()), /No student disconnected during the run\./)
    const html = renderHtmlReport(makeResult({ finished: [student(1, [], { hello: false })], outages: [outage({ rejoinMs: null })] }))
    assert.match(html, /Re-join \(p50 \/ p95 \/ max ms\)<\/div><div class="stat-value"><span class="na">unavailable \(not traced\)/)
  })

  test('poll table shows recovery by resync', () => {
    const html = renderHtmlReport(makeResult())
    assert.match(html, /<th>Recovered by resync<\/th>/)
    assert.match(html, /<td>2<\/td><td>TF<\/td><td>2<\/td><td>1<\/td><td><span class="">0<\/span>/)
  })

  test('a schema v1 file renders, with missing sections marked not recorded', () => {
    const r = makeResult()
    r.schemaVersion = 1
    delete r.delivery; delete r.outages; delete r.verdict.info
    r.verdict.checks = r.verdict.checks.map(({ status, ...c }) => c) // v1 checks have only `pass`
    for (const p of r.polls) delete p.recoveredByResync
    const html = renderHtmlReport(r)
    assert.match(html, /uses result schema v1/)
    assert.match(html, /Delivery tracking: <span class="na">not recorded in this result file \(schema v1\)/)
    assert.match(html, /Outage records: <span class="na">not recorded/)
    assert.match(html, /not recorded \(schema v1 file\)/)
    assert.match(html, /<span class="pill fail">FAIL<\/span><\/td><td>answer p95/)
    assert.match(html, /<span class="na">not recorded \(v1\)<\/span>/)
  })

  test('hostile values are escaped everywhere', () => {
    const evil = '<script>alert(1)</script>'
    const r = makeResult({ outages: [outage({ reason: `"><img src=x onerror=alert(1)>` })] })
    r.errorSamples[0].message = evil
    r.verdict.checks[0].check = evil
    r.verdict.info.push({ item: evil, value: evil })
    r.delivery.byEvent[evil] = { received: 1, duplicates: 0, outOfOrder: 0, late: 0, meanMs: 1, maxMs: 1 }
    r.summary.operations[evil] = { n: 1, p50: 1, p95: 1, p99: 1, max: 1, errorCount: 0, errors: { [evil]: 1 } }
    r.config.api = `javascript:${evil}`
    const html = renderHtmlReport(r)
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /<img/i)
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(html, /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/)
  })

  test('bounded: long values capped, error samples and big tables limited', () => {
    const r = makeResult()
    r.errorSamples = Array.from({ length: 1000 }, (_, i) => ({ op: 'answer', kind: 'timeout', message: 'm'.repeat(5000) + i, atSec: i }))
    for (let i = 0; i < MAX_ROWS + 30; i++) r.delivery.byEvent[`ev${i}`] = { received: 1, duplicates: 0, outOfOrder: 0, late: 0, meanMs: 1, maxMs: 1 }
    const html = renderHtmlReport(r)
    assert.equal(html.match(/<td>timeout<\/td>/g).length, 25)
    assert.ok(!html.includes('m'.repeat(MAX_TEXT + 1)))
    assert.match(html, /\d+ more rows not shown \(see the JSON file\)/)
    assert.ok(html.length < 400_000)
  })

  test('garbage input does not throw and shows unavailable values', () => {
    for (const bad of [null, {}, { verdict: 'x', polls: 'nope', summary: { operations: null } }]) {
      const html = renderHtmlReport(bad)
      assert.match(html, /OVERALL: N\/A/)
      assert.match(html, /<span class="na">unavailable<\/span>/)
    }
  })
})

describe('make-report', () => {
  test('builds the HTML next to the JSON, picks the newest result, rejects other files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'lt-report-'))
    try {
      const older = path.join(dir, '2026-11-06T01-00-00Z.json')
      const newer = path.join(dir, '2026-11-06T02-00-00Z.json')
      await writeFile(older, JSON.stringify(makeResult()))
      await writeFile(newer, JSON.stringify(makeResult()))
      assert.equal(await newestResult(dir), newer)
      assert.equal(htmlPathFor(newer), newer.replace(/\.json$/, '.html'))

      const out = await buildReport(newer)
      assert.equal(out, htmlPathFor(newer))
      assert.match(await readFile(out, 'utf8'), /Spandan load test report/)

      const custom = path.join(dir, 'custom.html')
      assert.equal(await buildReport(older, custom), custom)

      const other = path.join(dir, 'other.json')
      await writeFile(other, '{"hello":1}')
      await assert.rejects(buildReport(other), /not a spandan-loadtest result/)
      await writeFile(other, 'not json')
      await assert.rejects(buildReport(other), /Cannot read/)
      assert.equal(await newestResult(path.join(dir, 'missing')), null)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('the entry point runs however it is launched, including through a symlink / Windows junction', async () => {
    const loadtestDir = fileURLToPath(new URL('..', import.meta.url))
    const run = (script) => execFileSync(process.execPath, [script, '--help'], { cwd: os.tmpdir(), encoding: 'utf8' })
    assert.match(run(path.join(loadtestDir, 'make-report.mjs')), /^Usage: npm run report/)

    // A directory link to loadtest/ ('junction' on Windows needs no admin rights; a plain symlink elsewhere).
    const dir = await mkdtemp(path.join(os.tmpdir(), 'lt-link-'))
    const link = path.join(dir, 'lt')
    try {
      symlinkSync(loadtestDir, link, 'junction')
      assert.match(run(path.join(link, 'make-report.mjs')), /^Usage: npm run report/)
    } finally {
      // Never a recursive delete here: remove only the link itself, then the (now empty) temp dir.
      try { rmSync(link) } catch { /* not created */ }
      try { rmdirSync(dir) } catch { /* leave it rather than risk following the link */ }
    }
    assert.ok(existsSync(path.join(loadtestDir, 'make-report.mjs')), 'removing the link must never touch its target')
    assert.ok(existsSync(path.join(loadtestDir, 'lib', 'reportFile.mjs')))
  })
})
