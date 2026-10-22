import React, { useMemo, useState } from 'react'
import { BarList, Columns, StepLine, Scatter, OptionBar, Funnel, Heatmap, Legend, COLORS, rateBand, textTone } from './InsightCharts'
import { questionsToCsv, questionsToPrintHtml, downloadText, openPrintWindow, safeFilename } from '../lib/questionsExport'
import { RT_BUCKET_LABELS, scoreTicks, rtTicks, formatDuration } from '../lib/insightsFormat'
import { StatTile, TileGrid, SectionHeader, SectionLabel, HeroSummary, SectionNav, cardStyle, QPill, QuestionBox } from './InsightUI'
import { ChartColumn, Check, CircleCheck, Clock as ClockIcon, Download, FileText, Funnel as FunnelIcon, Hand, Hourglass, MessageSquare, Mic, Mountain, PartyPopper, Puzzle, Search, Target, Timer, Users, Zap } from 'lucide-react'
import { Ico } from './icons'

const card = cardStyle
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const hint = { margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }
const LETTERS = 'ABCDEFGHIJ'
const FLAG_TEXT = { 'too-easy': 'Too easy (≥90% correct)', hard: 'Hard (<30% correct)', 'low-discrimination': 'Low discrimination', 'dead-distractor': 'Dead distractor (an option nobody picked)' }

// Teacher results-page insights. `insights` = payload of GET /responses/insights/:roomId (owner).
// Students get their own view instead: components/StudentInsights.jsx.
export default function RoomInsights({ insights, isTeacher, isMobile, onExportResponses }) {
  const [open, setOpen] = useState(null)          // expanded question id
  const [showAll, setShowAll] = useState(false)   // item table: all rows vs first 10
  const [dl, setDl] = useState(false)             // download dialog
  const [dlFormat, setDlFormat] = useState('pdf')
  const [dlKey, setDlKey] = useState(true)
  const { totals, timeline, joinCurve, questions, scores, segments, heatmap, room } = insights
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', alignItems: 'start' } // start: a tall card must not stretch its neighbour

  const rateItems = useMemo(() => questions.map(q => ({ key: q.id, label: `Q${q.n}`, value: q.correctRate, extra: `${q.responses} answered` })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1)), [questions])
  const scatterPts = useMemo(() => questions.filter(q => q.medianResponseTime !== null && q.correctRate !== null).map(q => ({ x: q.medianResponseTime, y: q.correctRate, label: q.n, lines: [`Q${q.n}: ${q.text.slice(0, 60)}${q.text.length > 60 ? '…' : ''}`, `${q.correctRate}% correct · median ${q.medianResponseTime}s · ${q.responses} answered`] })), [questions])
  // Hero highlights: the hardest question (among those enough students answered), the strongest
  // segment, and how many stayed to the end.
  const highlights = useMemo(() => {
    const out = []
    const minN = Math.max(3, Math.ceil((totals.responders || 0) * 0.2))
    const rated = questions.filter(q => q.correctRate !== null && q.responses >= Math.min(minN, Math.max(1, totals.responders)))
    const hardest = rated.length ? rated.reduce((a, q) => (q.correctRate < a.correctRate ? q : a)) : null
    if (hardest) out.push({ icon: Mountain, label: 'Hardest question', value: `Q${hardest.n} · ${hardest.correctRate}% correct` })
    const segs = segments.filter(x => x.segmentIndex >= 1 && x.correctRate !== null && x.responses > 0)
    if (segs.length > 1) {
      const best = segs.reduce((a, x) => (x.correctRate > a.correctRate ? x : a))
      out.push({ icon: Target, label: 'Strongest segment', value: `Segment ${best.segmentIndex} · ${best.correctRate}%` })
    }
    if (totals.questions) out.push({ icon: PartyPopper, label: 'Answered every poll', value: `${totals.answeredAll} of ${plural(totals.joined, 'student')}` })
    return out
  }, [questions, segments, totals])
  const correctTotal = useMemo(() => questions.reduce((a, q) => a + (q.correct || 0), 0), [questions])
  const sessionEnd = Math.max(totals.durationMin || 0, ...timeline.map(t => t.minute || 0), ...joinCurve.map(j => j.minute)) || 1

  const exportNow = () => {
    const base = safeFilename(`${room.name}_${room.code}_questions${dlKey ? '' : '_student_copy'}`)
    if (dlFormat === 'csv') downloadText(base + '.csv', questionsToCsv(insights, { answerKey: dlKey }), 'text/csv')
    else if (!openPrintWindow(questionsToPrintHtml(insights, { answerKey: dlKey }))) window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.')
    setDl(false)
  }

  return (
    <div>
      <HeroSummary isMobile={isMobile} title="Session summary"
        meta={[room.createdAt ? new Date(room.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null, formatDuration(totals.durationMin), plural(totals.questions, 'poll'), plural(totals.joined, 'student')].filter(m => m && m !== '—')}
        ring={{ value: totals.overallCorrectRate, label: 'correct', color: rateBand(totals.overallCorrectRate).color }}
        highlights={highlights} />
      <SectionNav isMobile={isMobile} sections={[{ id: 'res-overview', label: 'Overview' }, { id: 'res-engagement', label: 'Engagement' }, { id: 'res-questions', label: 'Questions' }, ...(heatmap && heatmap.rows.length ? [{ id: 'res-students', label: 'Students' }] : [])]} />

      {/* ---- overview: the download actions + the page's ONE tile row (students = everyone who joined or answered) ---- */}
      <SectionLabel actions={isTeacher && (
        <div data-tour="results-download" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          <button onClick={() => setDl(true)} style={{ ...btn(), flex: isMobile ? 1 : undefined }}><Ico as={Download} /> {isMobile ? 'Questions' : 'Download questions'}</button>
          {onExportResponses && <button onClick={onExportResponses} style={{ ...btn(), flex: isMobile ? 1 : undefined }}><Ico as={Download} /> Responses CSV</button>}
        </div>
      )} id="res-overview">Overview</SectionLabel>
      <TileGrid isMobile={isMobile} cols={4}>
        {[
          { icon: Users, label: 'Students', value: `${totals.joined}`, sub: `${totals.responders} answered at least one`, tint: 'var(--accent)' },
          { icon: FileText, label: 'Questions', value: `${totals.questions}`, sub: `${totals.maxPossible} points possible`, tint: '#8b5cf6' },
          { icon: MessageSquare, label: 'Responses', value: `${totals.responses}`, sub: totals.responders ? `${Math.round(totals.responses / totals.responders * 10) / 10} per answering student` : 'no answers', tint: '#0ea5e9' },
          { icon: Hand, label: 'Participation', value: totals.participationRate !== null ? `${totals.participationRate}%` : '—', sub: `${totals.responders} of ${totals.joined} students answered`, tint: '#14b8a6', progress: totals.participationRate },
          { icon: CircleCheck, label: 'Class correct rate', value: totals.overallCorrectRate !== null ? `${totals.overallCorrectRate}%` : '—', sub: `${correctTotal} of ${totals.responses} answers correct`, tint: COLORS.good, tone: totals.overallCorrectRate !== null ? rateBand(totals.overallCorrectRate).color : undefined, progress: totals.overallCorrectRate, progressColor: totals.overallCorrectRate !== null ? rateBand(totals.overallCorrectRate).color : undefined },
          { icon: Timer, label: 'Median response time', value: totals.medianResponseTime !== null ? `${totals.medianResponseTime}s` : '—', sub: 'across every answer', tint: '#f59e0b' },
          { icon: ChartColumn, label: 'Score spread', value: totals.medianScore !== null ? `${totals.medianScore} / ${totals.meanScore}` : '—', sub: `median / mean of ${totals.maxPossible} possible`, tint: '#ec4899', progress: totals.maxPossible && totals.medianScore !== null ? (totals.medianScore / totals.maxPossible) * 100 : undefined },
          { icon: Hourglass, label: 'Session length', value: formatDuration(totals.durationMin), sub: `${totals.questions} poll${totals.questions === 1 ? '' : 's'} launched`, tint: '#64748b' },
        ].map(t => <StatTile key={t.label} {...t} isMobile={isMobile} />)}
      </TileGrid>

      {dl && (
        <div role="dialog" aria-modal="true" aria-label="Download questions" style={{ position: 'fixed', inset: 0, zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDl(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ position: 'relative', width: 'min(440px, 92vw)', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '17px' }}>Download questions</h3>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>{questions.length} questions with their options{dlKey ? ', correct answers marked and explanations where available' : ', without answers'}.</p>
            <fieldset style={fs}><legend style={lg}>Format</legend>
              <label style={lb}><input type="radio" name="fmt" checked={dlFormat === 'pdf'} onChange={() => setDlFormat('pdf')} /> PDF <span style={sm}>(opens the print dialog — choose "Save as PDF")</span></label>
              <label style={lb}><input type="radio" name="fmt" checked={dlFormat === 'csv'} onChange={() => setDlFormat('csv')} /> CSV <span style={sm}>(one row per question, options as columns)</span></label>
            </fieldset>
            <fieldset style={fs}><legend style={lg}>Content</legend>
              <label style={lb}><input type="radio" name="key" checked={dlKey} onChange={() => setDlKey(true)} /> Answer key <span style={sm}>(✓ on correct options, explanations, points, timer, correct rate)</span></label>
              <label style={lb}><input type="radio" name="key" checked={!dlKey} onChange={() => setDlKey(false)} /> Student copy <span style={sm}>(questions and options only — a handout)</span></label>
            </fieldset>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setDl(false)} style={btn()}>Cancel</button>
              <button onClick={exportNow} style={btn(true)}>Download</button>
            </div>
          </div>
        </div>
      )}

      <SectionLabel id="res-engagement">Engagement</SectionLabel>
      {/* ---- timeline + joins ---- */}
      <div data-tour="results-timeline" className="insight-card" style={card(isMobile)}>
        <SectionHeader icon={ClockIcon} tint="var(--accent)" title="Session timeline" hint={<>Each column is a poll; polls launched together sit side by side at the minute they went out. Height = how many students answered. Colour = correct-rate band.</>} />
        {timeline.length ? (
          <>
            <Columns points={timeline.map(t => ({ x: t.minute ?? 0, y: t.responders, n: t.n, label: `Q${t.n}`, rate: t.correctRate }))} xMax={sessionEnd} xLabel="min" yLabel="answered"
              cluster groupLabel={(ps) => { const ns = ps.map(p => p.n).sort((a, b) => a - b); return ns.length > 1 ? `Q${ns[0]}–Q${ns.at(-1)}` : `Q${ns[0]}` }}
              minBarPx={4} colorFor={(p) => (p.y ? rateBand(p.rate).color : COLORS.muted)}
              tipFor={(p) => [p.label, p.y ? `${p.y} answered · ${p.rate ?? '—'}% correct · minute ${p.x}` : `no one answered · minute ${p.x}`]} />
            <Legend items={[{ color: COLORS.good, label: '≥70% correct' }, { color: COLORS.warning, label: '40–69%' }, { color: COLORS.critical, label: '<40%' }, ...(timeline.some(t => !t.responders) ? [{ color: COLORS.muted, label: 'no answers' }] : [])]} />
          </>
        ) : <p style={hint}>No polls were launched.</p>}
        {joinCurve.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <StepLine title="Students in the room" subtitle="Cumulative joins over the session — late joiners show as steps after the first polls." points={joinCurve.map(j => ({ x: j.minute, y: j.cumulative }))} yLabel="joined" />
          </div>
        )}
      </div>

      {/* ---- engagement: funnel + score distribution ---- */}
      <div style={grid}>
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={FunnelIcon} tint="#14b8a6" title="Participation funnel" hint={<>How far students went: joined → answered at least one poll → answered half → answered every poll.</>} />
          <Funnel stages={[
            { label: 'Joined', value: totals.joined, pct: 100 },
            { label: 'Answered ≥ 1', value: totals.responders, pct: totals.joined ? Math.round(totals.responders / totals.joined * 100) : 0 },
            { label: 'Answered ≥ half', value: totals.answeredHalf, pct: totals.joined ? Math.round(totals.answeredHalf / totals.joined * 100) : 0 },
            { label: 'Answered all', value: totals.answeredAll, pct: totals.joined ? Math.round(totals.answeredAll / totals.joined * 100) : 0 },
          ]} />
        </div>
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={ChartColumn} tint="#ec4899" title="Score distribution" hint={<>Students by total points. Two humps mean two groups in the room. Mean {scores.mean ?? '—'}, median {scores.median ?? '—'}, top {scores.max ?? '—'} of {scores.maxPossible}.</>} />
          <Columns points={scores.buckets.map((b, i) => ({ x: i + 0.5, y: b.count, label: `${b.from}–${b.to} pts` }))} xMax={scores.buckets.length} xTicks={scoreTicks(scores.buckets)} barWidth={40} height={170} yLabel="students"
            tipFor={(p) => [p.label, `${p.y} student${p.y === 1 ? '' : 's'}`]} />
        </div>
      </div>

      <SectionLabel id="res-questions">Questions</SectionLabel>
      {/* ---- difficulty: correct rate bars + speed vs accuracy ---- */}
      <div style={grid}>
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={Target} tint={COLORS.good} title="Correct rate per question" hint={<>Sorted, easiest first. A wide spread means the session had cliffs; a flat line means uniform difficulty.</>} />
          {rateItems.length ? <BarList items={rateItems} colorFor={(it) => rateBand(it.value).color} /> : <p style={hint}>No answers yet.</p>}
        </div>
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={Zap} tint="#f59e0b" title="Speed vs accuracy" hint={<>One dot per question: median response time against correct rate. Slow and wrong = the class struggled. Fast and wrong = a misconception.</>} />
          {scatterPts.length ? <Scatter points={scatterPts} xLabel="s" yLabel="correct" xMax={Math.max(10, ...scatterPts.map(p => p.x)) * 1.1} /> : <p style={hint}>No response times recorded.</p>}
        </div>
      </div>

      {/* ---- per segment ---- */}
      {segments.length > 0 && (
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={Mic} tint="#8b5cf6" title="By lecture segment" hint={<>Where in the lecture the class got lost: questions and correct rate per segment, with the transcript length of that segment.</>} />
          <div className="thin-scroll" style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr>{['Segment', 'Questions', 'Answers', 'Correct rate', 'Transcript words', 'Segment length'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{segments.map(s => (
                <tr key={s.segmentIndex}>
                  <td style={td}>{s.segmentIndex >= 1 ? `Segment ${s.segmentIndex}` : 'Manual / pasted'}</td>
                  <td style={td}>{s.questions}</td><td style={td}>{s.responses}</td>
                  <td style={td}><span style={{ color: textTone(rateBand(s.correctRate).color), fontWeight: 700 }}>{s.correctRate ?? '—'}{s.correctRate !== null ? '%' : ''}</span> <span style={sm}>{s.correctRate !== null ? rateBand(s.correctRate).label : ''}</span></td>
                  <td style={td}>{s.words || '—'}</td><td style={td}>{s.durationSec ? `${Math.round(s.durationSec / 60)} min` : '—'}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- item analysis (collapsible per question) ---- */}
      <div data-tour="item-analysis" className="insight-card" style={card(isMobile)}>
        <SectionHeader icon={Search} tint="#0ea5e9" title="Question-wise analysis" hint={<>Difficulty = share correct. Discrimination = did students who got it right score higher overall (point-biserial; above 0.3 is good, below 0.2 is weak). Click a question number to see the question, the answer distribution{isTeacher ? ', the explanation and who got it wrong' : ' and the explanation'}.</>} />
        {questions.length === 0 ? <p style={hint}>No questions were asked in this room.</p> : (
          <div className="thin-scroll" style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              {/* The question text lives inside each question's expanded row (click Qn); the rows stay one
                  line of numbers. Phones: fewer columns — type, difficulty and flags move into the expanded row. */}
              <thead><tr>{(isMobile ? ['#', 'Answered', 'Correct', 'Time', 'Discrim.'] : ['#', 'Type', 'Answered', 'Correct', 'Difficulty', 'Discrim.', 'Median time', 'Flags']).map(h => <th key={h} style={isMobile ? thM : th}>{h}</th>)}</tr></thead>
              <tbody>
                {(showAll ? questions : questions.slice(0, 10)).map(q => {
                  const isOpen = open === q.id
                  const band = rateBand(q.correctRate)
                  return (
                    <React.Fragment key={q.id}>
                      <tr onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen} style={{ cursor: 'pointer', background: isOpen ? 'var(--nav-hover)' : 'transparent' }}>
                        <td style={isMobile ? tdM : td}><QPill n={q.n} open={isOpen} compact={isMobile} /></td>
                        {!isMobile && <td style={td}>{q.type}</td>}
                        <td style={isMobile ? tdM : td}>{q.responses}{isTeacher && q.noAnswer ? <span style={sm}> (+{q.noAnswer}{isMobile ? '' : ' silent'})</span> : null}</td>
                        <td style={isMobile ? tdM : td}><span style={{ color: textTone(band.color), fontWeight: 700 }}>{q.correctRate ?? '—'}{q.correctRate !== null ? '%' : ''}</span>{!isMobile && <span style={sm}> {q.correctRate !== null ? band.label : ''}</span>}</td>
                        {!isMobile && <td style={td}>{q.difficulty ?? '—'}</td>}
                        {isMobile ? <td style={tdM}>{q.medianResponseTime !== null ? `${q.medianResponseTime}s` : '—'}</td> : null}
                        <td style={isMobile ? tdM : td}>{q.discrimination ?? '—'}</td>
                        {!isMobile && <td style={td}>{q.medianResponseTime !== null ? `${q.medianResponseTime}s` : '—'}</td>}
                        {!isMobile && <td style={td}>{q.flags.map(f => <span key={f} title={FLAG_TEXT[f]} style={chip}>{FLAG_TEXT[f].split(' (')[0]}</span>)}</td>}
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={isMobile ? 5 : 8} style={{ ...td, whiteSpace: 'normal', background: 'var(--bg-primary)' }}>
                          <QuestionBox n={q.n} type={q.type} text={q.text}>
                            {isMobile && <div style={{ ...sm, marginTop: 6 }}>{q.correctRate !== null ? `${band.label} · ` : ''}difficulty {q.difficulty ?? '—'}{isTeacher && q.noAnswer ? ` · ${q.noAnswer} joined but did not answer` : ''}</div>}
                            {isMobile && q.flags.length > 0 && <div style={{ marginTop: 6 }}>{q.flags.map(f => <span key={f} title={FLAG_TEXT[f]} style={chip}>{FLAG_TEXT[f].split(' (')[0]}</span>)}</div>}
                          </QuestionBox>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '18px' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Answer distribution</div>
                              <OptionBar options={q.options} total={q.responses} />
                              <ol style={{ margin: '10px 0 0', paddingLeft: '22px', fontSize: '13px', lineHeight: 1.6 }}>
                                {q.options.map((o, i) => <li key={i} style={{ fontWeight: o.isCorrect ? 700 : 400 }}>{LETTERS[i]}. {o.text}{o.isCorrect ? <> <Ico as={Check} aria-label="correct" /></> : ''} <span style={sm}>— {o.count} ({o.share}%){!o.isCorrect && o.distractorShare !== null ? `, ${o.distractorShare}% of wrong picks` : ''}</span></li>)}
                              </ol>
                              {q.explanation && <div style={{ marginTop: '10px', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}><strong>Explanation:</strong> {q.explanation}</div>}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Response time</div>
                              <Columns points={q.rtBuckets.map((c, i) => ({ x: i + 0.5, y: c, label: RT_BUCKET_LABELS[i] }))} xMax={q.rtBuckets.length} xTicks={rtTicks()} barWidth={34} height={120} tipFor={(p) => [p.label, `${p.y} student${p.y === 1 ? '' : 's'}`]} />
                              <div style={sm}>seconds to answer</div>
                              {isTeacher && q.wrongStudents && q.wrongStudents.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '13px' }}><strong>Got it wrong ({q.wrongStudents.length}):</strong> {q.wrongStudents.map(w => w.name).join(', ')}</div>
                              )}
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {questions.length > 10 && <button onClick={() => setShowAll(v => !v)} style={{ ...btn(), marginTop: '10px' }}>{showAll ? 'Show first 10' : `Show all ${questions.length} questions`}</button>}
          </div>
        )}
      </div>

      {/* ---- heatmap (teacher) ---- */}
      {isTeacher && heatmap && heatmap.rows.length > 0 && <SectionLabel id="res-students">Students</SectionLabel>}
      {isTeacher && heatmap && heatmap.rows.length > 0 && (
        <div data-tour="results-heatmap" className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={Puzzle} tint="var(--accent)" title="Students × questions" hint={<>Each cell is one student's result on one question. Sorted by total points. The CSV export has the full table.</>} />
          {insights.anonymity && (
            <p style={{ ...hint, marginTop: '-8px' }}>This session's leaderboard is anonymous, so names are hidden here too{insights.anonymity.percent > 0 ? `, except the lowest-scoring ${insights.anonymity.percent}% (as on your leaderboard)` : ''}.</p>
          )}
          <Legend items={[{ color: COLORS.good, label: 'correct' }, { color: COLORS.critical, label: 'wrong' }, { color: COLORS.grid, label: 'no answer' }]} />
          <div style={{ marginTop: '10px' }}><Heatmap rows={heatmap.rows} questionCount={heatmap.questionIds.length} compact={isMobile} /></div>
        </div>
      )}

      <p style={{ ...sm, marginTop: '-8px' }}>Response times are reported by each student's browser and bounded by the server; treat them as indicative.</p>
    </div>
  )
}

const btn = (primary) => ({ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: primary ? 'var(--accent-solid)' : 'var(--nav-hover)', color: primary ? '#fff' : 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' })
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: 'var(--text-primary)' }
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top', whiteSpace: 'nowrap' }
// phones: tighter cells so the 4-column question table fits a ~290 px card
const thM = { ...th, padding: '8px 5px' }
const tdM = { ...td, padding: '8px 5px' }
const sm = { fontSize: '12px', color: 'var(--text-secondary)' }
const chip = { display: 'inline-block', fontSize: '11px', padding: '2px 7px', borderRadius: '999px', background: 'var(--nav-hover)', border: '1px solid var(--border-color)', marginRight: '4px', whiteSpace: 'nowrap' }
const fs = { border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 12px 10px', margin: '0 0 10px' }
const lg = { fontSize: '12px', color: 'var(--text-secondary)', padding: '0 4px' }
const lb = { display: 'block', fontSize: '14px', padding: '4px 0', cursor: 'pointer' }
