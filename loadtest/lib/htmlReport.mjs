// Offline HTML report for one saved run (results/<timestamp>.json). Pure: result object in, one
// self-contained HTML string out.
//
// Safety: every value taken from the result is HTML-escaped and length-capped; the page has no
// JavaScript and loads nothing (a strict Content-Security-Policy blocks scripts and any remote
// resource even if a value slipped through). Size: every table has a row cap.
import { THRESHOLDS, RESULT_SCHEMA_VERSION } from './report.mjs'

export const MAX_TEXT = 300          // characters kept from any single value
export const MAX_ROWS = 200          // rows per table (outage records are already capped at 200)
export const UNAVAILABLE = 'unavailable'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Escape any value for HTML text or a quoted attribute, capped at MAX_TEXT characters. */
export function escapeHtml(v) {
  let s = String(v ?? '')
  if (s.length > MAX_TEXT) s = s.slice(0, MAX_TEXT) + '…'
  return s.replace(/[&<>"']/g, c => ESC[c])
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const na = (why = UNAVAILABLE) => `<span class="na">${escapeHtml(why)}</span>`
/** A number (rounded) or an explicit "unavailable"; never a silent 0 or blank. */
const num = (v, { unit = '', digits = 0 } = {}) =>
  isNum(v) ? `${escapeHtml(digits ? v.toFixed(digits) : Math.round(v))}${unit}` : na()
const txt = (v) => (v == null || v === '' ? na() : escapeHtml(v))
const list = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

const STATUS_CLASS = { PASS: 'pass', FAIL: 'fail', 'N/A': 'na-pill', INFO: 'info', REPORTED: 'info' }
const pill = (status) => `<span class="pill ${STATUS_CLASS[status] || 'na-pill'}">${escapeHtml(status)}</span>`
// v1 checks have only `pass`; v2 checks have `status` PASS | FAIL | N/A.
const statusOf = (c) => (['PASS', 'FAIL', 'N/A'].includes(c?.status) ? c.status : c?.pass === true ? 'PASS' : c?.pass === false ? 'FAIL' : 'N/A')

function table(headers, rows, { empty = 'none', cap = MAX_ROWS, cls = '' } = {}) {
  if (!rows.length) return `<p class="muted">${escapeHtml(empty)}</p>`
  const shown = rows.slice(0, cap)
  const more = rows.length > cap ? `<p class="muted">${rows.length - cap} more rows not shown (see the JSON file)</p>` : ''
  return `<div class="scroll"><table class="${cls}"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${shown.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${more}`
}

const stat = (label, value, { tone = '', note = '' } = {}) =>
  `<div class="stat ${tone}"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${value}</div>${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ''}</div>`
// A count that fails the run when non-zero.
const failCount = (label, v) => stat(label, num(v), { tone: isNum(v) ? (v > 0 ? 'bad' : 'good') : '', note: 'fails the run if > 0' })
// A count that is reported only (never fails).
const reported = (label, v, note = 'reported only') => stat(label, v === null ? na() : num(v), { tone: 'neutral', note })

const section = (id, title, body) => `<section id="${id}"><h2>${escapeHtml(title)}</h2>${body}</section>`

function verdictSection(r) {
  const v = obj(r.verdict)
  const checks = list(v.checks)
  const counts = { PASS: 0, FAIL: 0, 'N/A': 0 }
  for (const c of checks) counts[statusOf(c)]++
  const rows = checks.map(c => {
    const s = statusOf(c)
    return [pill(s), escapeHtml(c.check), s === 'N/A' ? na(c.value ?? UNAVAILABLE) : txt(c.value)]
  })
  const info = list(v.info).map(i => [pill('INFO'), escapeHtml(i.item), i.value == null ? na() : escapeHtml(i.value)])
  return section('verdict', 'Checks',
    `<p class="muted">${counts.PASS} passed, ${counts.FAIL} failed, ${counts['N/A']} not measurable (N/A never counts as a pass and never fails the run).</p>` +
    table(['Status', 'Check', 'Value'], rows, { empty: 'no checks recorded', cls: 'checks' }) +
    '<h3>Reported only (INFO)</h3><p class="muted">These never fail the run, for example late broadcasts.</p>' +
    table(['', 'Item', 'Value'], info, { empty: r.schemaVersion >= 2 ? 'nothing to report' : 'not recorded (schema v1 file)' }))
}

function performanceSection(r) {
  const ops = obj(r.summary?.operations)
  const rows = Object.entries(ops).map(([name, o]) => {
    const limit = THRESHOLDS[name]
    const over = limit != null && isNum(o.p95) && o.p95 > limit
    return [
      escapeHtml(name), num(o.n), num(o.p50), `<span class="${over ? 'bad-text' : ''}">${num(o.p95)}</span>`, num(o.p99), num(o.max),
      limit != null ? `${escapeHtml(limit)}` : '<span class="muted">not judged</span>',
      isNum(o.errorCount) && o.errorCount > 0 ? `<span class="bad-text">${num(o.errorCount)} (${num(o.errorRate, { digits: 1 })}%)</span>` : num(o.errorCount),
      escapeHtml(Object.entries(obj(o.errors)).map(([k, n]) => `${k} ×${n}`).join(', '))
    ]
  })
  return section('performance', 'Performance (ms)', table(['Operation', 'n', 'p50', 'p95', 'p99', 'max', 'p95 limit', 'errors', 'error kinds'], rows, { empty: 'no operations recorded' }))
}

function connectionsSection(r) {
  const c = obj(r.summary?.connections)
  const reasons = Object.entries(obj(c.disconnectReasons)).map(([k, n]) => `${k} ×${n}`).join(', ')
  return section('connections', 'Connections',
    '<div class="grid">' +
    stat('Students joined', `${num(c.studentsJoined)} / ${num(r.config?.students)}`) +
    stat('Connect failures', num(c.connectFailures)) +
    stat('Disconnects', num(c.disconnects), { note: reasons || 'none' }) +
    stat('Reconnects', num(c.reconnects)) +
    stat('room:ended received', num(r.summary?.roomEndedReceived)) +
    '</div>')
}

function pollsSection(r) {
  const v2 = r.schemaVersion >= 2
  const rows = list(r.polls).map(p => [
    num(p.poll), txt(p.type), num(p.deliveredTo),
    v2 ? num(p.recoveredByResync) : na('not recorded (v1)'),
    `<span class="${isNum(p.notDelivered) && p.notDelivered > 0 ? 'bad-text' : ''}">${num(p.notDelivered)}</span>`,
    num(p.answersAccepted), num(p.answersRejected)
  ])
  return section('polls', 'Polls',
    '<p class="muted">Recovered by resync: the student missed the socket push while disconnected and got the poll from the past-answers re-fetch after reconnecting. It counts as reached.</p>' +
    table(['Poll', 'Type', 'Delivered (socket)', 'Recovered by resync', 'Not delivered', 'Answers accepted', 'Answers rejected'], rows, { empty: 'no polls ran' }))
}

function deliverySection(r) {
  const d = r.delivery
  if (!d) return section('delivery', 'Broadcast delivery', `<div class="banner neutral">Delivery tracking: ${na('not recorded in this result file (schema v' + escapeHtml(r.schemaVersion ?? '?') + ')')}</div>`)
  if (d.status !== 'traced') {
    return section('delivery', 'Broadcast delivery',
      `<div class="banner neutral"><strong>Unavailable.</strong> ${escapeHtml(d.reason || 'tracing was not active')}. The tracing checks are N/A, not passed.</div>`)
  }
  const clockLocal = d.clock === 'local'
  const tailNote = d.tail === 'verified' ? 'a lost final broadcast would be detected' : 'a lost final broadcast may go unnoticed'
  const events = Object.entries(obj(d.byEvent)).map(([name, e]) => [
    escapeHtml(name), num(e.received), num(e.outOfOrder), num(e.duplicates), clockLocal && e.late != null ? num(e.late) : na(),
    clockLocal && e.meanMs != null ? num(e.meanMs) : na(), clockLocal && e.maxMs != null ? num(e.maxMs) : na()
  ])
  const worst = list(d.worstStudents).map(w => [num(w.student), num(w.droppedConnected), num(w.tailMissing), num(w.outOfOrder), num(w.duplicates), num(w.missedOutage)])
  return section('delivery', 'Broadcast delivery',
    `<p class="muted">Traced for ${num(d.students)} students. Clock: <strong>${clockLocal ? 'local' : na('unavailable (remote target)')}</strong>. ` +
    `Tail: <strong>${escapeHtml(d.tail || UNAVAILABLE)}</strong> (${escapeHtml(tailNote)}).</p>` +
    '<h3>Failures</h3><div class="grid">' +
    failCount('Lost while connected', d.droppedConnected) +
    stat('of which at the tail', d.tail === 'verified' ? num(d.tailMissing) : na(`tail ${d.tail}`)) +
    failCount('Out of order', d.outOfOrder) +
    failCount('Duplicates', d.duplicates) +
    (d.studentsUntraced ? failCount('Students without a baseline', d.studentsUntraced) : '') +
    '</div><h3>Reported only</h3><div class="grid">' +
    reported('Received', d.received, 'delivered broadcasts') +
    reported('Missed while disconnected', d.missedOutage, 'expected; judged via outages') +
    reported(`Late (> ${isNum(d.lateMs) ? d.lateMs : '?'} ms)`, clockLocal ? d.late : null, clockLocal ? 'reported only, never fails' : 'unavailable: clocks not comparable') +
    stat('Delivery latency', clockLocal && d.latencyMs ? `${num(d.latencyMs.meanMs)} mean / ${num(d.latencyMs.maxMs)} max` : na(), { tone: 'neutral', note: 'ms, server stamp to receipt' }) +
    reported('Students with losses', d.studentsWithDrops, '') +
    '</div>' +
    (d.unclassified || d.beforeBaseline || d.invalid || d.baselineInferred
      ? `<p class="muted">Diagnostics: unclassified ${num(d.unclassified)}, before baseline ${num(d.beforeBaseline)}, invalid ${num(d.invalid)}, baseline inferred ${num(d.baselineInferred)}.</p>` : '') +
    '<h3>By event type</h3><p class="muted">A missing broadcast has no event type (the student never saw it), so losses are counted only in the totals above.</p>' +
    table(['Event', 'Received', 'Out of order', 'Duplicates', 'Late', 'Mean ms', 'Max ms'], events, { empty: 'no traced broadcasts received' }) +
    '<h3>Students with the most issues</h3>' +
    table(['Student', 'Lost', 'At tail', 'Out of order', 'Duplicates', 'Missed while down'], worst, { empty: 'none: no student lost, reordered or duplicated a broadcast' }))
}

function outagesSection(r) {
  const o = r.outages
  if (!o) return section('outages', 'Outages and reconnects', `<div class="banner neutral">Outage records: ${na('not recorded in this result file (schema v' + escapeHtml(r.schemaVersion ?? '?') + ')')}</div>`)
  if (!o.total) return section('outages', 'Outages and reconnects', '<p>No student disconnected during the run.</p>')
  const s3 = (s) => (s && s.n ? `${num(s.p50)} / ${num(s.p95)} / ${num(s.max)}` : na('none measured'))
  const records = list(o.records).map(x => [
    num(x.student), num(x.atSec, { digits: 1 }), txt(x.reason), num(x.outageMs), num(x.rejoinMs), num(x.resyncMs), num(x.missedSeqs),
    escapeHtml(list(x.missedQuestions).map(q => `poll ${q.poll}${q.recovered ? ' ✓' : ' ✗'}`).join(', ') || '—'),
    x.recovered === true ? pill('PASS') : x.recovered === false ? pill('FAIL') : na(),
    x.stuck ? pill('FAIL') : pill('PASS')
  ])
  return section('outages', 'Outages and reconnects',
    '<div class="grid">' +
    stat('Outages', num(o.total), { note: Object.entries(obj(o.byReason)).map(([k, n]) => `${k} ×${n}`).join(', ') }) +
    failCount('Stuck', o.stuck) +
    stat('Down (p50 / p95 / max ms)', s3(o.outageMs)) +
    stat('Re-join (p50 / p95 / max ms)', o.rejoinMs ? s3(o.rejoinMs) : na('unavailable (not traced)')) +
    stat('Resync (p50 / p95 / max ms)', s3(o.resyncMs)) +
    stat('Polls missed while down', num(o.missedPolls)) +
    stat('Recovered by resync', num(o.recoveredPolls), { tone: 'good' }) +
    failCount('Not recovered', o.unrecoveredPolls) +
    '</div>' +
    (o.truncated ? `<p class="muted">Showing the first ${list(o.records).length} of ${num(o.total)} outage records.</p>` : '') +
    table(['Student', 'At (s)', 'Reason', 'Down ms', 'Re-join ms', 'Resync ms', 'Missed seqs', 'Missed polls', 'Recovered', 'Not stuck'], records))
}

function machineSection(r) {
  const g = obj(r.generator)
  const sm = r.server?.metrics
  const warnings = list(g.warnings).map(w => `<div class="banner warn">${escapeHtml(w)}</div>`).join('')
  const server = sm
    ? stat('Server CPU (avg / peak % of a core)', `${num(sm.process?.cpuPercent?.avg)} / ${num(sm.process?.cpuPercent?.max)}`) +
      stat('Server RSS / heap (MB)', `${num(sm.process?.memoryMb?.rss)} / ${num(sm.process?.memoryMb?.heapUsed)}`) +
      stat('Server loop delay p99 (ms)', num(sm.process?.eventLoopDelayMs?.p99)) +
      stat('Server HTTP requests (5xx)', `${num(sm.http?.total)} (${num(sm.http?.errors)})`) +
      stat('Server sockets peak', num(sm.sockets?.peak))
    : stat('Server metrics', na(r.server?.reason ? `not collected: ${r.server.reason}` : 'not collected'))
  return section('machine', 'Load generator and server',
    warnings + '<div class="grid">' +
    stat('Generator CPU (avg / peak % of a core)', `${num(g.processCpuAvg)} / ${num(g.processCpuPeak)}`) +
    stat('Machine CPU (avg / peak %)', `${num(g.machineCpuAvg)} / ${num(g.machineCpuPeak)}`) +
    stat('Generator loop lag p99 peak (ms)', num(g.loopLagP99PeakMs)) +
    server + '</div>')
}

function errorsSection(r) {
  const rows = list(r.errorSamples).slice(0, 25).map(e => [num(e.atSec, { digits: 1 }), txt(e.op), txt(e.kind), txt(e.message)])
  return section('errors', 'Error samples', table(['At (s)', 'Operation', 'Kind', 'Message'], rows, { empty: 'no errors' }))
}

const CSS = `
:root{--bg:#f7f7f5;--surface:#fff;--text:#1d1d1b;--muted:#6b6b66;--border:#e3e2dd;--pass:#1f7a3f;--pass-bg:#e5f3ea;--fail:#b3261e;--fail-bg:#fbe9e7;--na:#5f6368;--na-bg:#eceff1;--info:#1a5fa8;--info-bg:#e6effa;--warn-bg:#fff4dc;--warn:#7a5300}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--surface:#1f1f1d;--text:#ecebe6;--muted:#a3a29c;--border:#34332f;--pass:#6fcf8f;--pass-bg:#173322;--fail:#ff8a80;--fail-bg:#3b1a17;--na:#b0b4b8;--na-bg:#2a2d30;--info:#8ab8f0;--info-bg:#172a40;--warn-bg:#3a2e12;--warn:#f0c66e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:19px;margin:0 0 12px}h3{font-size:15px;margin:20px 0 8px}
section{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px;margin:16px 0}
.muted{color:var(--muted)}.na{color:var(--na);font-style:italic}.bad-text{color:var(--fail);font-weight:600}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
.pill{display:inline-block;min-width:44px;text-align:center;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:700}
.pass{color:var(--pass);background:var(--pass-bg)}.fail{color:var(--fail);background:var(--fail-bg)}.na-pill{color:var(--na);background:var(--na-bg)}.info{color:var(--info);background:var(--info-bg)}
.overall{display:inline-block;font-size:20px;font-weight:800;padding:6px 16px;border-radius:8px;margin:10px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.stat{border:1px solid var(--border);border-radius:8px;padding:10px 12px}.stat-label{font-size:13px;color:var(--muted)}.stat-value{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}.stat-note{font-size:12px;color:var(--muted)}
.stat.bad{border-color:var(--fail);background:var(--fail-bg)}.stat.good .stat-value{color:var(--pass)}.stat.bad .stat-value{color:var(--fail)}
.banner{border-radius:8px;padding:10px 12px;margin:8px 0}.banner.neutral{background:var(--na-bg)}.banner.warn{background:var(--warn-bg);color:var(--warn)}
nav a{color:var(--info);margin-right:12px;font-size:14px}dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 16px;margin:8px 0}dt{color:var(--muted)}dd{margin:0}
@media print{section{break-inside:avoid}}
`

/** Render a saved run as one self-contained HTML page. */
export function renderHtmlReport(result) {
  const r = obj(result)
  const v = obj(r.verdict)
  const overall = v.pass === true ? 'PASS' : v.pass === false ? 'FAIL' : 'N/A'
  const cfg = obj(r.config)
  const schemaNote = r.schemaVersion !== RESULT_SCHEMA_VERSION
    ? `<div class="banner neutral">This file uses result schema v${escapeHtml(r.schemaVersion ?? '?')}; this report is built for v${RESULT_SCHEMA_VERSION}. Sections the file does not contain are marked as not recorded.</div>`
    : ''
  const title = `Load test ${escapeHtml(r.startedAt || '')}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Spandan load test report</h1>
<p class="muted">Generated offline from the saved result file. Local or authorized test environments only.</p>
<div class="overall ${overall === 'PASS' ? 'pass' : overall === 'FAIL' ? 'fail' : 'na-pill'}">OVERALL: ${overall}</div>
${r.aborted ? '<div class="banner warn">The run was stopped early (Ctrl+C); some checks were skipped.</div>' : ''}
${r.generator?.possibleBottleneck ? '<div class="banner warn">The load generator may have been the bottleneck; see "Load generator and server".</div>' : ''}
${schemaNote}
<dl>
<dt>Started</dt><dd>${txt(r.startedAt)}</dd><dt>Ended</dt><dd>${txt(r.endedAt)}</dd>
<dt>Target</dt><dd>${txt(cfg.api)}</dd>
<dt>Students</dt><dd>${num(cfg.students)} over ${num(cfg.rampSeconds)} s ramp</dd>
<dt>Polls</dt><dd>${num(list(r.polls).length)} × ${num(cfg.answerSeconds)} s to answer</dd>
<dt>Duration</dt><dd>${num(r.summary?.durationSeconds)} s</dd>
<dt>Late threshold</dt><dd>${cfg.lateMs != null ? `${num(cfg.lateMs)} ms (reported only)` : na('not recorded')}</dd>
</dl>
<nav><a href="#verdict">Checks</a><a href="#performance">Performance</a><a href="#polls">Polls</a><a href="#delivery">Delivery</a><a href="#outages">Outages</a><a href="#machine">Machine</a><a href="#errors">Errors</a></nav>
${verdictSection(r)}
${performanceSection(r)}
${connectionsSection(r)}
${pollsSection(r)}
${deliverySection(r)}
${outagesSection(r)}
${machineSection(r)}
${errorsSection(r)}
</main>
</body>
</html>
`
}
