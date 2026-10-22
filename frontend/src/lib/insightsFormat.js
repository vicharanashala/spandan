// Labels for the response-time histogram buckets (must match RT_BUCKETS in the backend insights service).
export const RT_BUCKET_LABELS = ['0–5s', '5–10s', '10–20s', '20–30s', '30–60s', '60s+']

// x-axis labels for the charts whose x is an index, not a value (ticks for <Columns xTicks>).
// Score histogram: bucket edges in points (first, middle, last edge).
export const scoreTicks = (buckets) => {
  const n = buckets.length
  if (!n) return []
  const mid = Math.floor(n / 2)
  return [{ x: 0, label: '0' }, { x: mid, label: String(buckets[mid].from) }, { x: n, label: `${buckets[n - 1].to} pts` }]
}
// Response-time histogram: one short label under each bar.
export const rtTicks = () => ['0–5', '5–10', '10–20', '20–30', '30–60', '60+'].map((label, i) => ({ x: i + 0.5, label, anchor: 'middle' }))
// One column per question at x = n − 0.5: label the first, middle and last question.
export const questionTicks = (count) => {
  if (!count) return []
  const mid = Math.ceil(count / 2)
  return [...new Set([1, mid, count])].map((n, i, a) => ({ x: n - 0.5, label: `Q${n}`, anchor: i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle' }))
}
// Session length for a tile: "45 min" up to 90 minutes, then "2 h 05 min".
export const formatDuration = (min) => {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—'
  if (min <= 90) return `${Math.round(min)} min`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return `${h} h ${String(m).padStart(2, '0')} min`
}
