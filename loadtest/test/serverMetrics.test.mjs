import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startServerMetrics, serverGauges, serverMetricsUrl } from '../lib/serverMetrics.mjs'
import { resolveConfig, parseArgs } from '../lib/config.mjs'
import { Recorder } from '../lib/metrics.mjs'

const SNAP = {
  process: { cpuPercent: { last: 12.5 }, memoryMb: { rss: 180, heapUsed: 90 }, eventLoopDelayMs: { p99: 21 } },
  http: { inFlight: 3 },
  sockets: { active: 50 }
}

// A stand-in backend: mode 'on' serves metrics, 'off' 404s (disabled), 'proxy' 403s.
let mode = 'on'
let resets = 0
const server = http.createServer((req, res) => {
  if (mode === 'off') { res.writeHead(404); return res.end('{}') }
  if (mode === 'proxy') { res.writeHead(403); return res.end('{}') }
  if (req.method === 'POST' && req.url === '/internal/metrics/reset') { resets++; res.writeHead(200); return res.end('{"reset":true}') }
  if (req.url === '/internal/metrics') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(SNAP)) }
  res.writeHead(404); res.end()
})
let base
before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r() })))
after(() => new Promise(r => server.close(r)))

const cfgFor = (serverMetrics) => ({ baseUrl: base, serverMetrics })
const quiet = () => {}

describe('server metrics client', () => {
  test('URL is outside /api and ignores the proxy prefix', () => {
    assert.equal(serverMetricsUrl('http://localhost:3001/'), 'http://localhost:3001/internal/metrics')
  })

  test('gauges pick the per-second numbers', () => {
    assert.deepEqual(serverGauges(SNAP), { serverCpu: 12.5, serverRssMb: 180, serverHeapMb: 90, serverLoopP99Ms: 21, serverSockets: 50, serverInFlight: 3 })
    assert.deepEqual(Object.values(serverGauges({})), [null, null, null, null, null, null])
  })

  test('enabled: resets counters first, samples into the timeline, returns the final snapshot', async () => {
    mode = 'on'; resets = 0
    const rec = new Recorder()
    const sm = await startServerMetrics(cfgFor('auto'), rec, { intervalMs: 20, log: quiet })
    assert.equal(sm.available, true)
    assert.equal(resets, 1)
    await new Promise(r => setTimeout(r, 120))
    assert.deepEqual(await sm.read(), SNAP) // one-off read, e.g. the event-trace ledger
    const out = await sm.stop()
    assert.ok(out.samples >= 1)
    assert.deepEqual(out.final, SNAP)
    assert.ok(rec.snapshot().timeline.some(row => row.serverSockets === 50))
  })

  test('auto mode carries on with a reason when disabled or refused', async () => {
    mode = 'off'
    let sm = await startServerMetrics(cfgFor('auto'), new Recorder(), { log: quiet })
    assert.equal(sm.available, false)
    assert.match(sm.reason, /SERVER_METRICS=on/)
    assert.equal(await sm.stop(), null)
    assert.equal(await sm.read(), null)
    mode = 'proxy'
    sm = await startServerMetrics(cfgFor('auto'), new Recorder(), { log: quiet })
    assert.match(sm.reason, /local-only/)
  })

  test('require mode fails fast; off mode never calls the backend', async () => {
    mode = 'off'
    await assert.rejects(startServerMetrics(cfgFor('require'), new Recorder(), { log: quiet }), /require/)
    mode = 'on'; resets = 0
    const sm = await startServerMetrics(cfgFor('off'), new Recorder(), { log: quiet })
    assert.equal(sm.available, false)
    assert.equal(resets, 0)
  })

  test('config accepts auto/require/off only, default auto', () => {
    assert.equal(resolveConfig({}, {}).serverMetrics, 'auto')
    assert.equal(resolveConfig(parseArgs(['--server-metrics', 'require']), {}).serverMetrics, 'require')
    assert.equal(resolveConfig({}, { LOADTEST_SERVER_METRICS: 'off' }).serverMetrics, 'off')
    assert.throws(() => resolveConfig(parseArgs(['--server-metrics', 'yes']), {}), /auto, require or off/)
  })
})
