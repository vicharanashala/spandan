// Teacher-only exports of a room's questions (text, options, correct answers, explanations).
//   questionsToCsv(insights, { answerKey })  → CSV string
//   questionsToPrintHtml(insights, { answerKey }) → standalone HTML for the browser's print → Save as PDF
//   downloadText(filename, text, mime)       → triggers a file download
//   openPrintWindow(html)                     → opens the HTML in a new window and calls print()
// answerKey=false produces the "student copy": no ticks, no explanations, no statistics.

const LETTERS = 'ABCDEFGHIJ'
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function questionsToCsv(insights, { answerKey = true } = {}) {
  const qs = insights.questions || []
  const maxOpts = Math.max(2, ...qs.map((q) => q.options.length))
  const head = ['no', 'segment', 'type', 'question', ...Array.from({ length: maxOpts }, (_, i) => `option_${LETTERS[i]}`)]
  if (answerKey) head.push('correct', 'explanation', 'points', 'time_to_answer_s', 'responses', 'correct_rate_pct')
  const rows = qs.map((q) => {
    const row = [q.n, q.segmentIndex >= 1 ? q.segmentIndex : '', q.type, q.text, ...Array.from({ length: maxOpts }, (_, i) => q.options[i]?.text ?? '')]
    if (answerKey) row.push(q.options.map((o, i) => (o.isCorrect ? LETTERS[i] : null)).filter(Boolean).join(' '), q.explanation || '', q.points ?? '', q.timeToAnswer ?? '', q.responses ?? '', q.correctRate ?? '')
    return row
  })
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function questionsToPrintHtml(insights, { answerKey = true } = {}) {
  const r = insights.room || {}
  const qs = insights.questions || []
  const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
  const title = `${r.name || 'Session'} — ${answerKey ? 'Questions with answer key' : 'Questions (student copy)'}`
  const body = qs.map((q) => `
    <section class="q">
      <div class="meta">Q${q.n}${q.segmentIndex >= 1 ? ` · Segment ${q.segmentIndex}` : ''} · ${q.type}${answerKey && q.points ? ` · ${q.points} pts` : ''}${answerKey && q.timeToAnswer ? ` · ${q.timeToAnswer} s` : ''}${answerKey && q.responses ? ` · ${q.responses} answered, ${q.correctRate}% correct` : ''}</div>
      <div class="text">${esc(q.text)}</div>
      <ol class="opts">${q.options.map((o, i) => `<li class="${answerKey && o.isCorrect ? 'correct' : ''}"><span class="letter">${LETTERS[i]}.</span> ${esc(o.text)}${answerKey && o.isCorrect ? ' <span class="tick">✓</span>' : ''}</li>`).join('')}</ol>
      ${answerKey && q.explanation ? `<div class="expl"><strong>Explanation:</strong> ${esc(q.explanation)}</div>` : ''}
    </section>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; } .sub { color: #555; font-size: 13px; margin-bottom: 20px; }
  .q { break-inside: avoid; page-break-inside: avoid; margin: 0 0 18px; padding-bottom: 12px; border-bottom: 1px solid #ddd; }
  .meta { font-size: 11px; color: #666; margin-bottom: 4px; } .text { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .opts { list-style: none; padding: 0; margin: 0 0 6px; } .opts li { font-size: 13px; padding: 2px 0 2px 4px; }
  .opts li.correct { font-weight: 700; } .letter { display: inline-block; width: 22px; color: #555; } .tick { color: #0a7a0a; }
  .expl { font-size: 12px; color: #333; background: #f4f4f4; padding: 6px 8px; border-radius: 4px; }
  @media print { body { margin: 14mm; } }
</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">${esc(r.code ? 'Room ' + r.code : '')}${date ? ' · ' + esc(date) : ''} · ${qs.length} question${qs.length === 1 ? '' : 's'}${answerKey ? '' : ' · answers not shown'}</div>
${body}
</body></html>`
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function openPrintWindow(html) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch (e) { /* user can print manually */ } }, 300)
  return true
}

export const safeFilename = (s) => String(s || 'spandan').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60)
