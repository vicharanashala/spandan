import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Small inline-SVG charts for the results page. No dependency. One palette, validated for both
// themes (see dataviz method): series-1 blue, series-2 orange, series-3 aqua; status colours for
// correct-rate bands. Text always wears the app's text tokens, never the series colour.
export const COLORS = {
  s1: 'var(--viz-s1, #2a78d6)', s2: 'var(--viz-s2, #eb6834)', s3: 'var(--viz-s3, #1baf7a)',
  good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b',
  grid: 'var(--border-color)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', surface: 'var(--bg-card)'
}
// A status colour used as TEXT (e.g. "87%", "✓ correct"): lifted toward white in dark mode (--tone-lift)
export const textTone = (c) => `color-mix(in srgb, ${c}, white var(--tone-lift))`
// correct-rate band → status colour + label (never colour alone)
export const rateBand = (rate) => rate === null || rate === undefined ? { color: COLORS.muted, label: 'n/a' }
  : rate >= 70 ? { color: COLORS.good, label: 'good' } : rate >= 40 ? { color: COLORS.warning, label: 'mixed' } : { color: COLORS.critical, label: 'weak' }

const font = { fontFamily: 'inherit', fontSize: 11, fill: COLORS.muted }

// ---------- Tooltip: ONE shared box for every chart ----------
// Positioned in screen coordinates (position: fixed), flipped/clamped to stay inside the viewport,
// and updated directly in the DOM — a hover never re-renders the chart (a 600-student heatmap has
// ~12k cells). Mouse: follows the pointer. Touch: tap shows it; scrolling or tapping elsewhere hides it.
// Lines are set with textContent (never HTML).
let tipEl = null
function tipNode() {
  if (tipEl || typeof document === 'undefined') return tipEl
  tipEl = document.createElement('div')
  tipEl.setAttribute('role', 'tooltip')
  tipEl.setAttribute('data-chart-tip', '')
  Object.assign(tipEl.style, {
    position: 'fixed', left: '0px', top: '0px', zIndex: '9000', pointerEvents: 'none', display: 'none',
    background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px',
    boxShadow: 'var(--shadow-md)', padding: '6px 10px', fontSize: '12px', lineHeight: '1.4', maxWidth: '320px', boxSizing: 'border-box'
  })
  document.body.appendChild(tipEl)
  window.addEventListener('scroll', hideTip, true)
  window.addEventListener('resize', hideTip)
  // A tap/click anywhere hides it; a tap on a chart mark then re-shows it (its click fires after this).
  document.addEventListener('pointerdown', hideTip, true)
  return tipEl
}

export function showTip(clientX, clientY, lines) {
  const el = tipNode()
  if (!el) return
  el.replaceChildren(...lines.map((l, i) => {
    const d = document.createElement('div')
    d.textContent = l
    if (i === 0) d.style.fontWeight = '600'
    return d
  }))
  el.style.display = 'block'
  const pad = 8, off = 12, vw = window.innerWidth, vh = window.innerHeight
  el.style.maxWidth = Math.max(120, Math.min(320, vw - 2 * pad)) + 'px'
  const { width, height } = el.getBoundingClientRect()
  let x = clientX + off
  if (x + width > vw - pad) x = Math.max(pad, clientX - off - width) // flip to the left of the pointer
  let y = clientY + off
  if (y + height > vh - pad) y = Math.max(pad, clientY - off - height) // flip above
  el.style.left = Math.round(x) + 'px'
  el.style.top = Math.round(y) + 'px'
}

export function hideTip() {
  if (tipEl) tipEl.style.display = 'none'
}

// Spread onto any chart mark (SVG or HTML): {...tip(['Q3', '70% correct'])}
const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen'
export const tip = (lines) => ({
  onPointerMove: (e) => { if (!isTouch(e)) showTip(e.clientX, e.clientY, lines) },
  onPointerLeave: (e) => { if (!isTouch(e)) hideTip() },
  onClick: (e) => showTip(e.clientX, e.clientY, lines)
})

// Hide the tooltip when a chart unmounts (e.g. navigating away while it is showing).
const useHideTipOnUnmount = () => useEffect(() => hideTip, [])

// Width of a chart's box in CSS px. The SVG keeps width="100%" (so it can never widen its grid column)
// and its viewBox is set to this measured width, so it draws 1:1 — text stays 11 px on a phone instead
// of being shrunk with the whole drawing. Falls back to 640 where it can't be measured.
function useWidth(fallback = 640) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { const cw = Math.round(el.clientWidth); if (cw > 0) setW(cw) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// x-axis labels: first label left-aligned, last right-aligned, so neither is clipped at the edges.
const anchorFor = (i, n) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle')

const Frame = ({ title, subtitle, children, height, ariaLabel, boxRef }) => {
  useHideTipOnUnmount()
  return (
    <figure style={{ margin: 0, position: 'relative' }} aria-label={ariaLabel || title}>
      {title && <figcaption style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 2 }}>{title}</figcaption>}
      {subtitle && <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>{subtitle}</div>}
      <div ref={boxRef} style={{ position: 'relative', width: '100%', height }}>{children}</div>
    </figure>
  )
}

// ---------- Horizontal bars: one row per item (HTML, so labels never stretch or crop) ----------
// Many rows (long sessions) scroll inside a capped box instead of stretching the card.
export function BarList({ title, subtitle, items, max = 100, unit = '%', colorFor, labelWidth = 56, maxVisibleRows = 14 }) {
  const rowH = 24
  const capped = items.length > maxVisibleRows
  return (
    <Frame title={title} subtitle={subtitle}>
      <div className="thin-scroll" style={{ maxHeight: capped ? maxVisibleRows * rowH : undefined, overflowY: capped ? 'auto' : 'visible', paddingRight: capped ? 4 : 0 }}>
        {items.map((it, i) => {
          const pct = Math.max(0, Math.min(1, (it.value ?? 0) / max)) * 100
          return (
            <div key={it.key ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, height: rowH }} {...tip([it.label, `${it.value ?? '—'}${unit}${it.extra ? ' · ' + it.extra : ''}`])}>
              <span style={{ width: labelWidth, flexShrink: 0, textAlign: 'right', fontSize: 11, color: COLORS.muted }}>{it.label}</span>
              <span style={{ flex: 1, minWidth: 0, height: 14, background: 'color-mix(in srgb, var(--border-color) 45%, transparent)', borderRadius: 2, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: colorFor ? colorFor(it) : COLORS.s1, borderRadius: '0 4px 4px 0' }} />
              </span>
              <span style={{ width: 44, flexShrink: 0, fontSize: 11, color: COLORS.text }}>{it.value ?? '—'}{it.value !== null && it.value !== undefined ? unit : ''}</span>
            </div>
          )
        })}
      </div>
      {capped && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Scroll for all {items.length} rows.</div>}
    </Frame>
  )
}

// ---------- Bursts of columns on a time axis ----------
// Polls of a segment are launched within a minute or two, so on a time axis their columns land on
// top of each other. clusterLayout groups columns that would overlap and lays each group out side by
// side, centred on the group's mean time (clamped inside [left, right]). It first narrows the bars
// (down to minBar) to keep every group separate; only if that cannot fit does it merge colliding groups.
// cx = column centres in px (any order). Returns { barWidth, lefts (per column), groups: [{ idx, start, end }] }.
export function clusterLayout(cx, { requested = 14, minBar = 4, gap = 2, groupGap = 8, left, right }) {
  const order = cx.map((x, i) => i).sort((a, b) => cx[a] - cx[b])
  const place = (idx, bw) => {
    const width = idx.length * bw + (idx.length - 1) * gap
    const centre = idx.reduce((t, i) => t + cx[i], 0) / idx.length
    const start = Math.min(Math.max(left, centre - width / 2), right - width)
    return { idx, start, end: start + width }
  }
  const groupsFor = (bw) => { // columns closer than one bar (+gap) would overlap → same group
    const groups = []
    for (const i of order) {
      const g = groups.at(-1)
      if (g && cx[i] - cx[g.at(-1)] < bw + gap) g.push(i)
      else groups.push([i])
    }
    return groups.map((g) => place(g, bw))
  }
  const fits = (laid) => laid.every((g, k) => g.start >= left - 0.5 && g.end <= right + 0.5 && (k === 0 || g.start >= laid[k - 1].end + groupGap - 0.5))
  const result = (laid, bw) => {
    const lefts = new Array(cx.length)
    for (const g of laid) g.idx.forEach((i, j) => { lefts[i] = g.start + j * (bw + gap) })
    return { barWidth: bw, lefts, groups: laid }
  }
  // 1) keep every burst as its own group, narrowing the bars if needed
  for (let bw = requested; bw >= minBar; bw--) {
    const laid = groupsFor(bw)
    if (fits(laid)) return result(laid, bw)
  }
  // 2) still too tight: merge colliding groups (narrowest bars first that then fit)
  for (let bw = minBar; bw >= 2; bw--) {
    const laid = groupsFor(bw)
    for (let k = 0; k < laid.length - 1;) {
      if (laid[k + 1].start < laid[k].end + groupGap) {
        laid.splice(k, 2, place([...laid[k].idx, ...laid[k + 1].idx], bw))
        if (k > 0) k-- // the merged group may now reach back into the previous one
      } else k++
    }
    if (fits(laid) || bw === 2) return result(laid, bw)
  }
}

// ---------- Columns over a continuous x (minutes): session timeline / histogram ----------
// xTicks (optional): [{ x, label, anchor? }] replaces the default 0 / mid / max numeric labels — e.g.
// bucket edges in points for a histogram, where the raw x is just the bucket index.
// minBarPx: draw at least this tall, so a 0 value still shows its colour (e.g. you were wrong on a
// question nobody got right — a 0% bar would otherwise be invisible).
// cluster: columns that would overlap (a burst of polls launched together) are drawn side by side,
// centred on their time; groupLabel(points) labels each group under the axis (e.g. "Q1–Q4").
export function Columns({ title, subtitle, points, xLabel, yLabel, height = 180, colorFor, tipFor, xMax, xTicks, minBarPx = 0, cluster = false, groupLabel, barWidth: requested = 14 }) {
  const [boxRef, W] = useWidth()
  const H = height, pl = 36, pr = 12, pt = 12, pb = cluster && groupLabel ? 44 : 28
  const xmax = xMax ?? Math.max(1, ...points.map(p => p.x))
  const ymax = Math.max(1, ...points.map(p => p.y))
  const sx = (x) => pl + (x / xmax) * (W - pl - pr), sy = (y) => pt + (1 - y / ymax) * (H - pt - pb)
  // Non-clustered: keep columns from overlapping when there are many: never wider than 2/3 of a slot.
  const layout = cluster
    ? clusterLayout(points.map(p => sx(p.x)), { requested, left: pl, right: W - pr })
    : { barWidth: Math.max(2, Math.min(requested, ((W - pl - pr) / Math.max(1, points.length)) * 0.66)) }
  const barWidth = layout.barWidth
  const leftOf = (p, i) => (cluster ? layout.lefts[i] : sx(p.x) - barWidth / 2)
  const gapHit = cluster ? 1 : Math.min(4, barWidth / 2) // widen the hover target without reaching the neighbour
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(ymax * f)))]
  const xt = xTicks || [0, 0.5, 1].map(f => ({ x: xmax * f, label: `${Math.round(xmax * f)}${xLabel ? ' ' + xLabel : ''}` }))
  // Group labels under the axis; one is skipped if it would run into the previous one.
  const labels = []
  if (cluster && groupLabel) {
    let lastEnd = -Infinity
    for (const g of layout.groups) {
      const text = groupLabel(g.idx.map(i => points[i]))
      const cx = (g.start + g.end) / 2, half = text.length * 3 + 4
      const x = Math.min(Math.max(cx, pl + half), W - pr - half)
      if (x - half >= lastEnd) { labels.push({ x, text }); lastEnd = x + half }
    }
  }
  return (
    <Frame title={title} subtitle={subtitle} height={H} boxRef={boxRef}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ display: 'block' }}>
        {ticks.map((t, i) => <g key={i}><line x1={pl} x2={W - pr} y1={sy(t)} y2={sy(t)} stroke={COLORS.grid} strokeWidth="1" /><text x={pl - 6} y={sy(t) + 4} textAnchor="end" style={font}>{t}</text></g>)}
        {points.map((p, i) => {
          const h = Math.max(minBarPx, sy(0) - sy(p.y)), x = leftOf(p, i), y = sy(0) - h
          const lines = tipFor ? tipFor(p) : [p.label || `x ${p.x}`, `${p.y}`]
          return (
            <g key={i} {...tip(lines)}>
              {/* full-height transparent hit area: short (or zero) columns are still easy to hover / tap */}
              <rect x={x - gapHit} y={pt} width={barWidth + 2 * gapHit} height={Math.max(0, sy(0) - pt)} fill="transparent" />
              <rect x={x} y={y} width={barWidth} height={Math.max(0, h)} rx={Math.min(4, barWidth / 2)} ry={Math.min(4, barWidth / 2)} fill={colorFor ? colorFor(p) : COLORS.s1} />
            </g>
          )
        })}
        <line x1={pl} x2={W - pr} y1={sy(0)} y2={sy(0)} stroke={COLORS.grid} strokeWidth="1" />
        {labels.map((l, i) => <text key={i} x={l.x} y={sy(0) + 14} textAnchor="middle" style={{ ...font, fontSize: 10, fontWeight: 600 }}>{l.text}</text>)}
        {xt.map((t, i) => <text key={i} x={sx(t.x)} y={H - 8} textAnchor={t.anchor || anchorFor(i, xt.length)} style={font}>{t.label}</text>)}
        {yLabel && <text x={pl} y={10} style={font}>{yLabel}</text>}
      </svg>
    </Frame>
  )
}

// ---------- Step line (cumulative joins) ----------
// tipFor(p) → tooltip lines; default describes cumulative joins (the join curve).
export function StepLine({ title, subtitle, points, height = 160, xLabel = 'min', yLabel, tipFor }) {
  const [boxRef, W] = useWidth()
  const H = height, pl = 36, pr = 12, pt = 12, pb = 28
  const xmax = Math.max(1, ...points.map(p => p.x)), ymax = Math.max(1, ...points.map(p => p.y))
  const sx = (x) => pl + (x / xmax) * (W - pl - pr), sy = (y) => pt + (1 - y / ymax) * (H - pt - pb)
  let d = `M ${sx(0)} ${sy(0)}`
  points.forEach(p => { d += ` H ${sx(p.x)} V ${sy(p.y)}` })
  d += ` H ${W - pr}`
  const r = points.length > 60 ? 2.5 : 4
  return (
    <Frame title={title} subtitle={subtitle} height={H} boxRef={boxRef}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ display: 'block' }}>
        {[...new Set([0, 0.5, 1].map(f => Math.round(ymax * f)))].map((t, i) => <g key={i}><line x1={pl} x2={W - pr} y1={sy(t)} y2={sy(t)} stroke={COLORS.grid} strokeWidth="1" /><text x={pl - 6} y={sy(t) + 4} textAnchor="end" style={font}>{t}</text></g>)}
        <path d={d} fill="none" stroke={COLORS.s1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={r} fill={COLORS.s1} stroke={COLORS.surface} strokeWidth={r > 3 ? 2 : 1} {...tip(tipFor ? tipFor(p) : [`${p.y} joined`, `by minute ${p.x}`])} />)}
        {[0, 0.5, 1].map((f, i) => <text key={i} x={sx(xmax * f)} y={H - 8} textAnchor={anchorFor(i, 3)} style={font}>{Math.round(xmax * f)} {xLabel}</text>)}
        {yLabel && <text x={pl} y={10} style={font}>{yLabel}</text>}
      </svg>
    </Frame>
  )
}

// ---------- Scatter: one dot per question ----------
export function Scatter({ title, subtitle, points, xLabel, yLabel, height = 220, xMax, yMax = 100 }) {
  const [boxRef, W] = useWidth()
  const H = height, pl = 40, pr = 16, pt = 12, pb = 30
  const xmax = xMax ?? Math.max(1, ...points.map(p => p.x))
  const sx = (x) => pl + (x / xmax) * (W - pl - pr), sy = (y) => pt + (1 - y / yMax) * (H - pt - pb)
  const labelled = points.length <= 25 && W >= 420 // numbered dots only where there is room for them
  return (
    <Frame title={title} subtitle={subtitle} height={H} boxRef={boxRef}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ display: 'block' }}>
        {[0, 50, 100].map((t, i) => <g key={i}><line x1={pl} x2={W - pr} y1={sy(t)} y2={sy(t)} stroke={COLORS.grid} strokeWidth="1" /><text x={pl - 6} y={sy(t) + 4} textAnchor="end" style={font}>{t}%</text></g>)}
        {points.map((p, i) => (
          <g key={i} {...tip(p.lines)}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={labelled ? 7 : 5} fill={rateBand(p.y).color} stroke={COLORS.surface} strokeWidth="2" />
            {labelled && <text x={sx(p.x)} y={sy(p.y) + 3.5} textAnchor="middle" style={{ ...font, fontSize: 9, fill: '#fff', fontWeight: 700, pointerEvents: 'none' }}>{p.label}</text>}
          </g>
        ))}
        {[0, 0.5, 1].map((f, i) => <text key={i} x={sx(xmax * f)} y={H - 10} textAnchor={anchorFor(i, 3)} style={font}>{Math.round(xmax * f)} {xLabel}</text>)}
        {yLabel && <text x={pl} y={10} style={font}>{yLabel}</text>}
      </svg>
    </Frame>
  )
}

// ---------- Option distribution: one stacked bar, correct segment(s) in blue, distractors grey ----------
export function OptionBar({ options, total, height = 26 }) {
  useHideTipOnUnmount()
  const letters = 'ABCDEFGH'
  return (
    <figure style={{ margin: 0, position: 'relative' }} aria-label="Answer distribution">
      <div style={{ display: 'flex', gap: 2, height, width: '100%' }}>
        {options.map((o, i) => {
          const w = total ? (o.count / total) * 100 : 0
          if (w <= 0) return null
          return (
            <div key={i} {...tip([`${letters[i]}. ${o.text}`, `${o.count} of ${total} (${o.share}%)${o.isCorrect ? ' · correct' : ''}`])}
              style={{ flex: `0 0 calc(${w}% - 2px)`, minWidth: 2, background: o.isCorrect ? COLORS.s1 : 'color-mix(in srgb, var(--border-color) 80%, transparent)', borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: 11, fontWeight: 600, color: o.isCorrect ? '#fff' : COLORS.text, whiteSpace: 'nowrap' }}>
              {w >= 9 ? `${letters[i]} ${o.share}%` : ''}
            </div>
          )
        })}
      </div>
    </figure>
  )
}

// ---------- Funnel: descending counts (HTML; the value label sits outside the bar and never crops) ----------
export function Funnel({ title, stages }) {
  const max = Math.max(1, ...stages.map(s => s.value))
  return (
    <Frame title={title}>
      <div role="img" aria-label={title || 'Participation funnel'}>
        {stages.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30 }}>
            <span style={{ width: 112, flexShrink: 0, textAlign: 'right', fontSize: 12, color: COLORS.muted }}>{s.label}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: `${(s.value / max) * 100}%`, maxWidth: 'calc(100% - 84px)', minWidth: s.value ? 4 : 0, height: 18, background: COLORS.s1, opacity: 1 - i * 0.18, borderRadius: '0 4px 4px 0' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, whiteSpace: 'nowrap' }}>{s.value}{s.pct !== undefined ? ` (${s.pct}%)` : ''}</span>
            </span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ---------- Heatmap: students × questions (HTML grid). Shows `visibleRows` rows, then scrolls inside the
// card with the same bottom fade the Leaderboard uses; the name column stays pinned while scrolling sideways.
// compact (phones): narrower name and points columns, so more questions fit before scrolling sideways.
export function Heatmap({ rows, questionCount, visibleRows = 10, compact = false }) {
  useHideTipOnUnmount()
  const cell = 16, gap = 2, rowH = cell + gap, nameW = compact ? 92 : 140, ptsW = compact ? 52 : 64
  const fill = { c: COLORS.good, w: COLORS.critical, '-': 'color-mix(in srgb, var(--border-color) 70%, transparent)' }
  const word = { c: 'correct', w: 'wrong', '-': 'no answer' }
  const capped = rows.length > visibleRows
  const gridW = nameW + questionCount * (cell + gap) + ptsW
  const sticky = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-card)' }
  return (
    <figure style={{ margin: 0, position: 'relative' }} aria-label="Student by question heatmap">
      <div className="thin-scroll" style={{ position: 'relative', overflow: 'auto', maxHeight: capped ? (visibleRows + 1) * rowH + 8 : undefined }}>
        <div style={{ width: gridW, minWidth: '100%' }}>
          {/* header row (question numbers), pinned to the top while scrolling down */}
          <div style={{ display: 'flex', alignItems: 'center', height: rowH, position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)' }}>
            <span style={{ ...sticky, zIndex: 3, width: nameW, flexShrink: 0, fontSize: 11, color: COLORS.muted }}>Student</span>
            {Array.from({ length: questionCount }, (_, j) => <span key={j} style={{ width: cell, marginRight: gap, flexShrink: 0, textAlign: 'center', fontSize: 9, color: COLORS.muted }}>{j + 1}</span>)}
            <span style={{ width: ptsW, flexShrink: 0, paddingLeft: 6, fontSize: 11, color: COLORS.muted }}>Points</span>
          </div>
          {rows.map((r) => (
            <div key={r.studentId} style={{ display: 'flex', alignItems: 'center', height: rowH }}>
              <span title={r.name} style={{ ...sticky, width: nameW, flexShrink: 0, paddingRight: 6, fontSize: 12, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>{r.name}</span>
              {r.cells.map((c, j) => (
                <span key={j} {...tip([r.name, `Q${j + 1}: ${word[c]}`])} style={{ width: cell, height: cell, marginRight: gap, flexShrink: 0, borderRadius: 3, background: fill[c] }} />
              ))}
              <span style={{ width: ptsW, flexShrink: 0, paddingLeft: 6, fontSize: 12, color: COLORS.text, whiteSpace: 'nowrap' }}>{r.points} pts</span>
            </div>
          ))}
        </div>
      </div>
      {capped && <div style={{ position: 'absolute', left: 0, right: 8, bottom: 22, height: 32, background: 'linear-gradient(to bottom, rgba(var(--bg-card-rgb), 0), rgba(var(--bg-card-rgb), 1))', pointerEvents: 'none' }} />}
      {capped && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>{rows.length} students · scroll for the rest. The CSV export has the full table.</div>}
    </figure>
  )
}

// Legend chips (identity never by colour alone)
export const Legend = ({ items }) => (
  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
    {items.map((it, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: it.color, display: 'inline-block' }} />{it.label}</span>)}
  </div>
)
