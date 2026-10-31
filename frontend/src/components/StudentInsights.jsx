import React, { useState } from 'react'
import { Columns, StepLine, Legend, OptionBar, COLORS, rateBand, textTone } from './InsightCharts'
import { scoreTicks, questionTicks, formatDuration } from '../lib/insightsFormat'
import { StatTile, TileGrid, SectionHeader, SectionLabel, HeroSummary, SectionNav, cardStyle, QPill, QuestionBox } from './InsightUI'
import { ArrowLeftRight, Award, ChartColumn, Check, CircleCheck, FileText, Flame, RotateCcw, Search, Star, Timer, TrendingDown, TrendingUp, X } from 'lucide-react'
import { Ico } from './icons'

const card = cardStyle
const hint = { margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }
const sm = { fontSize: '12px', color: 'var(--text-secondary)' }
const LETTERS = 'ABCDEFGHIJ'

// A student's own results against the class. `insights.me` comes from GET /responses/insights/:roomId
// (member student, ended room). Nothing here names other students.
export default function StudentInsights({ insights, isMobile }) {
  const { me, questions, scores, room, totals } = insights
  const [open, setOpen] = useState(null)        // expanded question id
  const [filter, setFilter] = useState('all')   // all | wrong | skipped
  const [showAll, setShowAll] = useState(false)
  if (!me) return null
  const byId = new Map(questions.map(q => [q.id, q]))
  const vs = (mine, cls, better = 'higher') => {
    if (mine === null || cls === null || cls === undefined) return ''
    if (mine === cls) return 'same as the class'
    const up = mine > cls
    return (better === 'higher' ? up : !up) ? 'better than the class' : 'below the class'
  }
  const counts = { all: me.perQuestion.length, wrong: me.perQuestion.filter(q => q.answered && q.isCorrect === false).length, skipped: me.perQuestion.filter(q => !q.answered).length }
  const rows = me.perQuestion.filter(q => filter === 'all' ? true : filter === 'wrong' ? (q.answered && q.isCorrect === false) : !q.answered)
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', alignItems: 'start' }

  return (
    <div>
      <HeroSummary isMobile={isMobile} title="Your session"
        meta={[room?.createdAt ? new Date(room.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null, totals ? formatDuration(totals.durationMin) : null, `${me.answered + me.missed} question${me.answered + me.missed === 1 ? '' : 's'}`].filter(m => m && m !== '—')}
        ring={{ value: me.correctRate, label: 'right', color: rateBand(me.correctRate).color }}
        highlights={[
          { icon: Flame, label: 'Best streak', value: `${me.bestStreak} in a row` },
          me.classMedianScore !== null && { icon: me.points >= me.classMedianScore ? TrendingUp : TrendingDown, label: 'Against the class', value: me.points === me.classMedianScore ? 'right at the median' : `${Math.abs(me.points - me.classMedianScore)} pts ${me.points > me.classMedianScore ? 'above' : 'below'} median` },
          { icon: RotateCcw, label: 'Worth a second look', value: counts.wrong + counts.skipped ? `${counts.wrong} wrong · ${counts.skipped} skipped` : 'nothing — all correct' },
        ].filter(Boolean)} />
      <SectionNav isMobile={isMobile} sections={[{ id: 'res-you', label: 'Your results' }, { id: 'res-session', label: 'Session' }, { id: 'res-questions', label: 'Questions' }, { id: 'res-class', label: 'In the class' }]} />

      {/* ---- you vs class: the page's ONE tile row for students ---- */}
      <SectionLabel id="res-you">Your results</SectionLabel>
      <TileGrid isMobile={isMobile} cols={3}>
        {[
          me.rankHidden
            ? { icon: Award, label: 'Your rank', value: 'Hidden', sub: 'the leaderboard is anonymous', tint: '#f59e0b' }
            : { icon: Award, label: 'Your rank', value: me.rank ? `#${me.rank}` : '—', sub: me.of ? `of ${me.of} who answered` : '', tint: '#f59e0b', tone: me.rank ? '#d97706' : undefined },
          { icon: Star, label: 'Your points', value: `${me.points}`, sub: me.classMedianScore !== null ? `class median ${me.classMedianScore} · ${vs(me.points, me.classMedianScore)}` : `of ${me.maxPossible} possible`, tint: '#8b5cf6', progress: me.maxPossible ? (me.points / me.maxPossible) * 100 : undefined },
          { icon: CircleCheck, label: 'Your correct rate', value: me.correctRate !== null ? `${me.correctRate}%` : '—', sub: `${me.correct} of ${me.answered} correct` + (me.classCorrectRate !== null ? ` · class ${me.classCorrectRate}% · ${vs(me.correctRate, me.classCorrectRate)}` : ''), tint: COLORS.good, tone: me.correctRate !== null ? rateBand(me.correctRate).color : undefined, progress: me.correctRate, progressColor: me.correctRate !== null ? rateBand(me.correctRate).color : undefined },
          { icon: Timer, label: 'Your median time', value: me.medianResponseTime !== null ? `${me.medianResponseTime}s` : '—', sub: me.classMedianResponseTime !== null ? `class ${me.classMedianResponseTime}s · faster on ${me.fasterThanClass} of ${me.answered}` : '', tint: '#0ea5e9' },
          { icon: Flame, label: 'Best streak', value: `${me.bestStreak}`, sub: 'correct answers in a row', tint: '#ef4444' },
          { icon: FileText, label: 'Answered', value: `${me.answered} / ${me.answered + me.missed}`, sub: me.missed ? `${me.missed} not answered` : 'every question', tint: '#14b8a6', progress: me.answered + me.missed ? (me.answered / (me.answered + me.missed)) * 100 : undefined },
        ].map(t => <StatTile key={t.label} {...t} isMobile={isMobile} />)}
      </TileGrid>

      <SectionLabel id="res-session">Through the session</SectionLabel>
      <div data-tour="results-timeline" style={grid}>
        {/* ---- your points through the session ---- */}
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={TrendingUp} tint="#8b5cf6" title="Your points through the session" hint={<>Cumulative points question by question. Flat stretches are questions you missed or got wrong.</>} />
          {me.perQuestion.length ? <StepLine points={me.perQuestion.map(q => ({ x: q.n, y: q.cumulativePoints, gained: q.points, answered: q.answered, isCorrect: q.isCorrect }))} xLabel="Q" yLabel="points"
            tipFor={(p) => [`Q${p.x}: ${p.y} points so far`, !p.answered ? 'not answered · +0' : p.isCorrect ? `correct · +${p.gained}` : 'wrong · +0']} /> : <p style={hint}>No questions.</p>}
        </div>
        {/* ---- you vs class per question ---- */}
        <div className="insight-card" style={card(isMobile)}>
          <SectionHeader icon={ArrowLeftRight} tint="var(--accent)" title="You vs the class, per question" hint={<>Column = share of the class that got it right. Colour = your result on that question.</>} />
          {me.perQuestion.length ? (
            <>
              <Columns points={me.perQuestion.map(q => ({ x: q.n - 0.5, y: q.classCorrectRate ?? 0, label: `Q${q.n}`, mine: q.isCorrect, answered: q.answered }))} xMax={me.perQuestion.length} xTicks={questionTicks(me.perQuestion.length)} minBarPx={4} barWidth={22} height={170} yLabel="% correct"
                colorFor={(p) => !p.answered ? COLORS.grid : p.mine ? COLORS.good : COLORS.critical}
                tipFor={(p) => [p.label, `class ${p.y}% correct · you: ${!p.answered ? 'did not answer' : p.mine ? 'correct' : 'wrong'}`]} />
              <Legend items={[{ color: COLORS.good, label: 'you were right' }, { color: COLORS.critical, label: 'you were wrong' }, { color: COLORS.grid, label: 'not answered' }]} />
            </>
          ) : <p style={hint}>No questions.</p>}
        </div>
      </div>

      {/* ---- question-wise analysis (own results + class aggregates; collapsible rows) ---- */}
      <SectionLabel id="res-questions">Question by question</SectionLabel>
      <div data-tour="question-analysis" className="insight-card" style={card(isMobile)}>
        <SectionHeader icon={Search} tint="#0ea5e9" title="Question-wise analysis" hint={<>Your result, time and points on every question next to the class figures. Click a question number to see the question, its options, the correct answer, your pick, how the class answered and the explanation.</>} />
        <div role="tablist" aria-label="Filter questions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {[['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Not answered']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setOpen(null) }} style={{ padding: '6px 12px', borderRadius: '999px', border: '1px solid ' + (filter === k ? 'var(--accent)' : 'var(--border-color)'), background: filter === k ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: 'var(--text-primary)', fontSize: '13px', fontWeight: filter === k ? 700 : 500, cursor: 'pointer' }}>
              {label} ({counts[k]})
            </button>
          ))}
        </div>
        {rows.length === 0 ? <p style={hint}>{filter === 'wrong' ? 'No wrong answers — nice work.' : filter === 'skipped' ? 'You answered every question.' : 'No questions.'}</p> : (
          <div className="thin-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: 'var(--text-primary)' }}>
              {/* The question text lives inside each question's expanded row (click Qn). Phones: fewer
                  columns — the class median time moves into the expanded row. */}
              <thead><tr>{(isMobile ? ['#', 'Result', 'Time', 'Class', 'Points'] : ['#', 'Your result', 'Your time', 'Class median', 'Class correct', 'Points']).map(h => <th key={h} style={isMobile ? thM : th}>{h}</th>)}</tr></thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 10)).map(q => {
                  const full = byId.get(q.id) || { text: '', options: [], explanation: '', correctRate: null, responses: 0 }
                  const isOpen = open === q.id
                  const band = rateBand(q.classCorrectRate)
                  return (
                    <React.Fragment key={q.id}>
                      <tr onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen} style={{ cursor: 'pointer', background: isOpen ? 'var(--nav-hover)' : 'transparent' }}>
                        <td style={isMobile ? tdM : td}><QPill n={q.n} open={isOpen} compact={isMobile} /></td>
                        <td style={isMobile ? tdM : td}>{!q.answered ? <span style={sm}>{isMobile ? 'skipped' : 'not answered'}</span> : q.isCorrect ? <span style={{ color: textTone(COLORS.good), fontWeight: 700 }}><Ico as={Check} /> correct</span> : <span style={{ color: textTone(COLORS.critical), fontWeight: 700 }}><Ico as={X} /> wrong</span>}</td>
                        <td style={isMobile ? tdM : td}>{q.responseTime !== null ? `${q.responseTime}s` : '—'}{!isMobile && q.responseTime !== null && q.classMedianResponseTime !== null ? <span style={sm}> {q.responseTime < q.classMedianResponseTime ? '· faster' : q.responseTime > q.classMedianResponseTime ? '· slower' : ''}</span> : null}</td>
                        {!isMobile && <td style={td}>{q.classMedianResponseTime !== null ? `${q.classMedianResponseTime}s` : '—'}</td>}
                        <td style={isMobile ? tdM : td}><span style={{ color: textTone(band.color), fontWeight: 700 }}>{q.classCorrectRate ?? '—'}{q.classCorrectRate !== null ? '%' : ''}</span>{!isMobile && <span style={sm}> {q.classCorrectRate !== null ? band.label : ''}</span>}</td>
                        <td style={isMobile ? tdM : td}>{isMobile ? `${q.points}/${q.maxPoints ?? '—'}` : `${q.points} / ${q.maxPoints ?? '—'}`}</td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={isMobile ? 5 : 6} style={{ ...td, whiteSpace: 'normal', background: 'var(--bg-primary)' }}>
                          <QuestionBox n={q.n} text={full.text}>
                            {isMobile && q.classMedianResponseTime !== null && (
                              <div style={{ ...sm, marginTop: 6 }}>Class median time {q.classMedianResponseTime}s{q.responseTime !== null ? (q.responseTime < q.classMedianResponseTime ? ' · you were faster' : q.responseTime > q.classMedianResponseTime ? ' · you were slower' : '') : ''}</div>
                            )}
                          </QuestionBox>
                          {full.responses > 0 && (
                            <>
                              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>How the class answered</div>
                              <OptionBar options={full.options} total={full.responses} />
                            </>
                          )}
                          <ol style={{ margin: '10px 0 0', paddingLeft: '22px', fontSize: '13px', lineHeight: 1.6 }}>
                            {full.options.map((o, i) => {
                              const picked = q.selected.includes(i)
                              return <li key={i} style={{ fontWeight: o.isCorrect ? 700 : 400, color: o.isCorrect ? COLORS.good : picked ? COLORS.critical : 'inherit' }}>{LETTERS[i]}. {o.text}{o.isCorrect ? <> <Ico as={Check} aria-label="correct" /></> : ''}{picked ? ' (your pick)' : ''}{o.share !== undefined && full.responses > 0 ? <span style={sm}> — {o.share}% of the class</span> : null}</li>
                            })}
                          </ol>
                          {full.explanation && <div style={{ marginTop: '10px', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}><strong>Explanation:</strong> {full.explanation}</div>}
                        </td></tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 10 && <button onClick={() => setShowAll(v => !v)} style={{ marginTop: '10px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--nav-hover)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{showAll ? 'Show first 10' : `Show all ${rows.length} questions`}</button>}
          </div>
        )}
      </div>

      <SectionLabel id="res-class">In the class</SectionLabel>
      {/* ---- where you sit in the class ---- */}
      <div className="insight-card" style={card(isMobile)}>
        <SectionHeader icon={ChartColumn} tint="#ec4899" title="Where you sit in the class" hint={<>Students by total points; your band is highlighted. No names are shown.</>} />
        <Columns points={scores.buckets.map((b, i) => ({ x: i + 0.5, y: b.count, label: `${b.from}–${b.to} pts`, mine: me.points >= b.from && (me.points < b.to || i === scores.buckets.length - 1) }))} xMax={scores.buckets.length} xTicks={scoreTicks(scores.buckets)} barWidth={40} height={160} yLabel="students"
          colorFor={(p) => p.mine ? COLORS.s2 : COLORS.s1} tipFor={(p) => [p.label, `${p.y} student${p.y === 1 ? '' : 's'}${p.mine ? ' · you are here' : ''}`]} />
        <Legend items={[{ color: COLORS.s1, label: 'students' }, { color: COLORS.s2, label: 'your band' }]} />
      </div>
    </div>
  )
}
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }
// phones: tighter cells so the 4-column question table fits a ~290 px card
const thM = { ...th, padding: '8px 5px' }
const tdM = { ...td, padding: '8px 5px' }
