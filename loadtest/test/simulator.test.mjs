import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, resolveConfig, isLocalUrl, passwordWarning, DEFAULTS } from '../lib/config.mjs'
import { percentile, summarize, errorKind, Recorder } from '../lib/metrics.mjs'
import { HttpError } from '../lib/http.mjs'
import { pickOptions, answerPlan, questionFor, QUESTION_BANK } from '../lib/questions.mjs'
import { analyzeGenerator } from '../lib/monitor.mjs'
import { verdict, resultFileName, pollSummary, printSummary } from '../lib/report.mjs'
import { Session } from '../lib/session.mjs'

describe('config', () => {
  test('safe defaults: 50 students against local backend', () => {
    const c = resolveConfig({}, {})
    assert.equal(c.students, 50)
    assert.equal(DEFAULTS.students, 50)
    assert.equal(c.api, 'http://localhost:3001/api')
    assert.equal(c.socketPath, '/socket.io')
    assert.equal(c.maxPolls, 3)
  })

  test('CLI flags, aliases and env are applied; CLI wins over env', () => {
    const cli = parseArgs(['--students', '20', '--ramp=5', '--answer-time', '12', '--gap', '2', '--api-prefix', 'spandan/'])
    const c = resolveConfig(cli, { LOADTEST_STUDENTS: '99', LOADTEST_POLLS: '4' })
    assert.equal(c.students, 20)
    assert.equal(c.rampSeconds, 5)
    assert.equal(c.answerSeconds, 12)
    assert.equal(c.gapSeconds, 2)
    assert.equal(c.polls, 4)
    assert.equal(c.api, 'http://localhost:3001/spandan/api')
    assert.equal(c.socketPath, '/spandan/socket.io')
  })

  test('--duration without --polls keeps cycling; with --polls it is capped', () => {
    assert.equal(resolveConfig(parseArgs(['--duration', '120']), {}).maxPolls, 100)
    assert.equal(resolveConfig(parseArgs(['--duration', '120', '--polls', '2']), {}).maxPolls, 2)
  })

  test('refuses non-local targets unless --allow-remote', () => {
    assert.throws(() => resolveConfig(parseArgs(['--base-url', 'https://spandan.example.com']), {}), /only localhost/)
    assert.doesNotThrow(() => resolveConfig(parseArgs(['--base-url', 'https://staging.example.com', '--allow-remote']), {}))
    assert.equal(isLocalUrl('http://127.0.0.1:3001'), true)
    assert.equal(isLocalUrl('http://localhost.evil.com'), false)
    assert.equal(isLocalUrl('not a url'), false)
  })

  test('large runs need --confirm-large', () => {
    assert.throws(() => resolveConfig(parseArgs(['--students', '201']), {}), /confirm-large/)
    assert.equal(resolveConfig(parseArgs(['--students', '201', '--confirm-large']), {}).students, 201)
    assert.equal(resolveConfig(parseArgs(['--students', '200']), {}).students, 200)
  })

  test('rejects invalid values and unknown flags', () => {
    for (const argv of [['--students', '0'], ['--students', '2.5'], ['--answer-time', '3'], ['--answer-rate', '1.5'], ['--polls', 'x']]) {
      assert.throws(() => resolveConfig(parseArgs(argv), {}), undefined, argv.join(' '))
    }
    assert.throws(() => parseArgs(['--nope', '1']), /Unknown option/)
    assert.throws(() => parseArgs(['--students']), /needs a value/)
    assert.throws(() => parseArgs(['students']), /Unexpected argument/)
  })

  test('--late-ms defaults to 2000, reads CLI and env, and is validated', () => {
    assert.equal(resolveConfig({}, {}).lateMs, 2000)
    assert.equal(DEFAULTS.lateMs, 2000)
    assert.equal(resolveConfig(parseArgs(['--late-ms', '750']), {}).lateMs, 750)
    assert.equal(resolveConfig({}, { LOADTEST_LATE_MS: '1500' }).lateMs, 1500)
    for (const v of ['0', '-5', '60001', 'soon']) {
      assert.throws(() => resolveConfig(parseArgs(['--late-ms', v]), {}), /late-ms/, v)
    }
  })

  test('--password still works, but its source is recorded and the command line is warned about', () => {
    const cli = resolveConfig(parseArgs(['--password', 'Cli-Secret-1']), { LOADTEST_PASSWORD: 'Env-Secret-1' })
    assert.equal(cli.password, 'Cli-Secret-1') // CLI wins, exactly as before
    assert.equal(cli.passwordSource, 'cli')
    const w = passwordWarning(cli)
    assert.match(w, /process list[\s\S]*shell history[\s\S]*LOADTEST_PASSWORD/)
    assert.ok(!w.includes('Cli-Secret-1')) // never echoes the password

    const env = resolveConfig({}, { LOADTEST_PASSWORD: 'Env-Secret-1' })
    assert.equal(env.passwordSource, 'env')
    assert.equal(passwordWarning(env), null)
    const dflt = resolveConfig({}, { LOADTEST_PASSWORD: '' })
    assert.equal(dflt.passwordSource, 'default')
    assert.equal(dflt.password, DEFAULTS.password)
    assert.equal(passwordWarning(dflt), null)
    assert.match(parseArgs(['--password=Inline-1']).password, /Inline-1/) // --name=value form unchanged
  })
})

describe('metrics', () => {
  test('nearest-rank percentiles', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    assert.equal(percentile(v, 50), 50)
    assert.equal(percentile(v, 95), 95)
    assert.equal(percentile(v, 99), 99)
    assert.equal(percentile(v, 100), 100)
    assert.equal(percentile([7], 99), 7)
    assert.equal(percentile([], 50), null)
    assert.equal(percentile([30, 10, 20], 50), 20) // unsorted input
  })

  test('summarize', () => {
    assert.deepEqual(summarize([]), { n: 0, min: null, mean: null, p50: null, p95: null, p99: null, max: null })
    const s = summarize([10, 20, 30, 40])
    assert.equal(s.n, 4); assert.equal(s.min, 10); assert.equal(s.max, 40); assert.equal(s.mean, 25); assert.equal(s.p50, 20)
  })

  test('errorKind groups failures', () => {
    assert.equal(errorKind(new HttpError(409, 'poll_closed', '/responses')), 'http_409:poll_closed')
    assert.equal(errorKind(new HttpError(429, null, '/x')), 'http_429')
    assert.equal(errorKind(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'timeout')
    assert.equal(errorKind(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })), 'network:ECONNREFUSED')
    assert.equal(errorKind(null), 'unknown')
  })

  test('Recorder: time() records success and failure, counts and timeline', async () => {
    let t = 0
    const rec = new Recorder({ now: () => t })
    await rec.time('op', async () => { t += 120 })
    await assert.rejects(rec.time('op', async () => { t += 30; throw new HttpError(500, 'boom', '/x') }))
    rec.count('disconnects')
    rec.count('disconnects')
    t = 2500
    rec.gauge({ genCpu: 40 })
    const s = rec.snapshot()
    assert.equal(s.operations.op.ok, 1)
    assert.equal(s.operations.op.n, 1)
    assert.equal(s.operations.op.p50, 120)
    assert.equal(s.operations.op.errorCount, 1)
    assert.equal(s.operations.op.errorRate, 50)
    assert.deepEqual(s.operations.op.errors, { 'http_500:boom': 1 })
    assert.equal(s.events.disconnects, 2)
    assert.equal(s.errorSamples[0].kind, 'http_500:boom')
    assert.deepEqual(s.timeline.find(r => r.t === 2), { t: 2, requests: 0, errors: 0, genCpu: 40 })
  })
})

describe('student behaviour', () => {
  test('answers always land inside the window, with responseTime frozen at click time', () => {
    for (const tta of [5, 10, 15, 30, 300]) {
      for (const r of [0, 0.25, 0.5, 0.999999]) {
        const p = answerPlan(tta, () => r)
        assert.ok(p.sendAtMs <= (tta - 1) * 1000, `tta ${tta} r ${r}: sends at ${p.sendAtMs}`)
        assert.ok(p.thinkMs >= 1000)
        assert.ok(p.jitterMs >= 0 && p.jitterMs < 2000)
        assert.ok(Number.isInteger(p.responseTime) && p.responseTime >= 0 && p.responseTime <= tta)
        assert.equal(p.responseTime, Math.floor(p.thinkMs / 1000))
      }
    }
  })

  test('picks valid option indices per question type', () => {
    for (const q of QUESTION_BANK) {
      for (let i = 0; i < 50; i++) {
        const sel = pickOptions(q)
        assert.ok(sel.length >= 1 && sel.length <= (q.type === 'MSQ' ? 2 : 1))
        assert.ok(sel.every(x => Number.isInteger(x) && x >= 0 && x < q.options.length))
        assert.equal(new Set(sel).size, sel.length)
      }
    }
    assert.deepEqual(pickOptions({ type: 'MCQ', options: [] }), [0])
  })

  test('question bank covers MCQ, TF and MSQ, each with a correct option', () => {
    assert.deepEqual(new Set(QUESTION_BANK.map(q => q.type)), new Set(['MCQ', 'TF', 'MSQ']))
    assert.ok(QUESTION_BANK.every(q => q.options.some(o => o.isCorrect)))
    assert.equal(questionFor(QUESTION_BANK.length), QUESTION_BANK[0])
  })
})

describe('generator bottleneck analysis', () => {
  const s = (processCpu, machineCpu = 30, loopLagP99Ms = 20) => ({ processCpu, machineCpu, loopLagP99Ms, rssMb: 100 })

  test('quiet run: no warnings', () => {
    const g = analyzeGenerator([s(20), s(35), s(40)])
    assert.equal(g.possibleBottleneck, false)
    assert.deepEqual(g.warnings, [])
    assert.equal(g.processCpuPeak, 40)
  })

  test('sustained generator CPU, machine CPU or loop lag each warn', () => {
    assert.match(analyzeGenerator([s(95), s(95), s(10), s(10)]).warnings[0], /load generator used/)
    assert.match(analyzeGenerator([s(10, 97), s(10, 98), s(10), s(10)]).warnings[0], /whole machine/)
    assert.match(analyzeGenerator([s(10, 30, 400), s(10), s(10), s(10)]).warnings[0], /event loop lagged/)
  })

  test('a single brief spike does not warn', () => {
    const samples = [s(99), ...Array.from({ length: 9 }, () => s(10))]
    assert.equal(analyzeGenerator(samples).possibleBottleneck, false)
  })
})

describe('report', () => {
  const op = (p95, errorCount = 0, errorRate = 0) => ({ n: 10, p95, errorCount, errorRate, errors: {} })

  test('passes when thresholds, error rate and join rate are met', () => {
    const v = verdict({ operations: { login: op(300), answer: op(80) }, events: { studentsJoined: 50 } }, { students: 50 })
    assert.equal(v.pass, true)
  })

  test('fails on slow p95, high error rate, low join rate, or a leaked answer key', () => {
    assert.equal(verdict({ operations: { answer: op(5000) }, events: { studentsJoined: 50 } }, { students: 50 }).pass, false)
    assert.equal(verdict({ operations: { answer: op(50, 5, 10) }, events: { studentsJoined: 50 } }, { students: 50 }).pass, false)
    assert.equal(verdict({ operations: {}, events: { studentsJoined: 40 } }, { students: 50 }).pass, false)
    assert.equal(verdict({ operations: {}, events: { studentsJoined: 50, answerKeyLeaked: 1 } }, { students: 50 }).pass, false)
  })

  test('fails when a poll or room:ended did not reach every joined student', () => {
    const base = { operations: {}, events: { studentsJoined: 50 } }
    const full = { deliveredTo: 50 }
    assert.equal(verdict({ ...base, polls: [full, full], roomEndedReceived: 50 }, { students: 50 }).pass, true)
    assert.equal(verdict({ ...base, polls: [full, { deliveredTo: 49 }], roomEndedReceived: 50 }, { students: 50 }).pass, false)
    assert.equal(verdict({ ...base, polls: [full], roomEndedReceived: 0 }, { students: 50 }).pass, false)
  })

  test('result file names are Windows-safe and sortable', () => {
    assert.equal(resultFileName(new Date('2026-11-06T02:15:30.123Z')), '2026-11-06T02-15-30Z.json')
  })

  test('poll summary reports undelivered polls', () => {
    const session = new Session()
    session.polls.set('a', { index: 0, type: 'MCQ', questionId: 'a', received: 48, accepted: 47, rejected: 1 })
    assert.deepEqual(pollSummary(session, 50), [
      { poll: 1, type: 'MCQ', questionId: 'a', deliveredTo: 48, recoveredByResync: 0, notDelivered: 2, answersAccepted: 47, answersRejected: 1 }
    ])
    session.polls.get('a').recovered = 1
    assert.equal(pollSummary(session, 50)[0].recoveredByResync, 1)
    assert.equal(pollSummary(session, 50)[0].notDelivered, 1)
  })

  test('"not delivered" counts joined students only, matching the verdict', () => {
    // 50 configured, 47 joined, all 47 got the poll: nothing was lost.
    const session = new Session()
    session.polls.set('a', { index: 0, type: 'MCQ', questionId: 'a', received: 47, accepted: 47, rejected: 0 })
    const polls = pollSummary(session, 47)
    assert.equal(polls[0].notDelivered, 0)
    const v = verdict({ operations: {}, events: { studentsJoined: 47 }, polls }, { students: 50 })
    assert.equal(v.checks.find(c => /every poll reached/.test(c.check)).status, 'PASS')
    assert.equal(v.checks.find(c => /students joined/.test(c.check)).status, 'FAIL') // the join gap is judged here
    // One joined student missed it: exactly 1 not delivered, and the poll check fails.
    session.polls.get('a').received = 46
    assert.equal(pollSummary(session, 47)[0].notDelivered, 1)
    assert.equal(verdict({ operations: {}, events: { studentsJoined: 47 }, polls: pollSummary(session, 47) }, { students: 50 })
      .checks.find(c => /every poll reached/.test(c.check)).status, 'FAIL')
    // Never negative, e.g. a poll launched before anyone joined.
    assert.equal(pollSummary(session, 0)[0].notDelivered, 0)
  })

  test('printSummary shows delivery against joined students', () => {
    const lines = []
    printSummary({
      config: { api: 'x', students: 50, rampSeconds: 1 },
      summary: { durationSeconds: 1, operations: {}, connections: { studentsJoined: 47, connectFailures: 3, disconnects: 0, reconnects: 0 }, roomEndedReceived: 47 },
      polls: [{ poll: 1, type: 'MCQ', deliveredTo: 46, recoveredByResync: 0, notDelivered: 1, answersAccepted: 46, answersRejected: 0 }],
      generator: null,
      verdict: { pass: false, checks: [], info: [] }
    }, (l) => lines.push(l))
    const out = lines.join('\n')
    assert.match(out, /poll 1 \(MCQ\): delivered 46\/47 joined, not delivered 1,/)
    assert.doesNotMatch(out, /delivered 46\/50/)
  })
})

describe('session leaderboard broadcast grouping', () => {
  test("groups by each student's receipt order, even when two broadcasts land close together", () => {
    const s = new Session()
    // broadcast 0 reaches 3 students at 1000-1040ms; broadcast 1 arrives just 200ms later
    s.noteLeaderboardPush(0, 1000); s.noteLeaderboardPush(0, 1040); s.noteLeaderboardPush(0, 1010)
    s.noteLeaderboardPush(1, 1200); s.noteLeaderboardPush(1, 1205) // one student missed it
    const stats = s.pushStats()
    assert.deepEqual(stats.map(p => [p.receipts, p.spreadMs]), [[3, 40], [2, 5]])
    assert.deepEqual(stats[0].spreads, [0, 40, 10])
    assert.equal(s.firstPushAfter(500), 1000)
    assert.equal(s.firstPushAfter(1100), 1200)
    assert.equal(s.firstPushAfter(5000), null)
    assert.deepEqual(s.pushGrouping(), { mode: 'receipt-order', approximate: false, reason: null })
    assert.deepEqual(stats.map(p => p.seq), [null, null])
  })

  test('untraced grouping is marked approximate after a disconnect', () => {
    const s = new Session()
    s.noteLeaderboardPush(0, 1000)
    s.noteDisconnect()
    const g = s.pushGrouping()
    assert.equal(g.mode, 'receipt-order')
    assert.equal(g.approximate, true)
    assert.match(g.reason, /1 disconnect\(s\)[\s\S]*SERVER_EVENT_TRACE=on/)
  })

  test('traced: grouped by sequence number, so a missed push does not shift later receipts', () => {
    const s = new Session()
    // 3 students; student C misses seq 5 (e.g. while down) and only gets seq 7.
    s.noteTracedLeaderboardPush({ s: 'A', n: 5 }, 1000) // student A
    s.noteTracedLeaderboardPush({ s: 'A', n: 5 }, 1030) // student B
    s.noteTracedLeaderboardPush({ s: 'A', n: 7 }, 2000) // A
    s.noteTracedLeaderboardPush({ s: 'A', n: 7 }, 2010) // B
    s.noteTracedLeaderboardPush({ s: 'A', n: 7 }, 2020) // C: its FIRST push, still broadcast 7
    const stats = s.pushStats()
    assert.deepEqual(stats.map(p => [p.seq, p.receipts, p.spreadMs]), [[5, 2, 30], [7, 3, 20]])
    // Receipt-order grouping would have put C's push into broadcast 5, reading a ~1 s spread.
    assert.deepEqual(s.pushGrouping(), { mode: 'sequence', approximate: false, reason: null })
    s.noteDisconnect()
    assert.equal(s.pushGrouping().approximate, false) // sequence grouping stays exact after outages
  })

  test('traced: a late arrival joins its own broadcast and shows up as spread, not as a new broadcast', () => {
    const s = new Session()
    s.noteTracedLeaderboardPush({ s: 'A', n: 3 }, 1000)
    s.noteTracedLeaderboardPush({ s: 'A', n: 4 }, 1200)
    s.noteTracedLeaderboardPush({ s: 'A', n: 4 }, 1210)
    s.noteTracedLeaderboardPush({ s: 'A', n: 3 }, 1900) // seq 3 reaching a slow student after seq 4
    const stats = s.pushStats()
    assert.deepEqual(stats.map(p => [p.seq, p.receipts, p.spreadMs]), [[3, 2, 900], [4, 2, 10]])
    assert.equal(s.firstPushAfter(1100), 1200) // the late seq-3 receipt is not a "new" push
    assert.equal(s.firstPushAfter(999), 1000)
  })

  test('traced: the same seq on two streams (two server instances) stays two broadcasts', () => {
    const s = new Session()
    s.noteTracedLeaderboardPush({ s: 'A', n: 1 }, 1000)
    s.noteTracedLeaderboardPush({ s: 'B', n: 1 }, 1005)
    assert.equal(s.pushStats().length, 2)
  })

  test('traced and untraced pushes together are reported as approximate', () => {
    const s = new Session()
    s.noteTracedLeaderboardPush({ s: 'A', n: 1 }, 1000)
    s.noteLeaderboardPush(0, 1100)
    const g = s.pushGrouping()
    assert.equal(g.mode, 'mixed')
    assert.equal(g.approximate, true)
    assert.equal(s.pushStats().length, 2)
  })

  test('no pushes: nothing to group, nothing approximate', () => {
    const s = new Session()
    assert.deepEqual(s.pushStats(), [])
    assert.equal(s.firstPushAfter(0), null)
    assert.deepEqual(s.pushGrouping(), { mode: 'none', approximate: false, reason: null })
  })

  test('the verdict reports approximate grouping as info only, never as a failure', () => {
    const base = { operations: {}, events: { studentsJoined: 5 } }
    const approx = { mode: 'receipt-order', approximate: true, reason: 'grouped by receipt order; 2 disconnect(s)' }
    const v = verdict({ ...base, leaderboardGrouping: approx }, { students: 5 })
    assert.equal(v.pass, true)
    assert.ok(v.info.some(i => i.item === 'leaderboard push spread is approximate' && /2 disconnect/.test(i.value)))
    const exact = verdict({ ...base, leaderboardGrouping: { mode: 'sequence', approximate: false, reason: null } }, { students: 5 })
    assert.ok(!exact.info.some(i => /approximate/.test(i.item)))
  })
})
