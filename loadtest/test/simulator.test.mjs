import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, resolveConfig, isLocalUrl, DEFAULTS } from '../lib/config.mjs'
import { percentile, summarize, errorKind, Recorder } from '../lib/metrics.mjs'
import { HttpError } from '../lib/http.mjs'
import { pickOptions, answerPlan, questionFor, QUESTION_BANK } from '../lib/questions.mjs'
import { analyzeGenerator } from '../lib/monitor.mjs'
import { verdict, resultFileName, pollSummary } from '../lib/report.mjs'
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
      { poll: 1, type: 'MCQ', questionId: 'a', deliveredTo: 48, notDelivered: 2, answersAccepted: 47, answersRejected: 1 }
    ])
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
  })
})
