import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import BadgeCard from '../components/BadgeCard'
import useAuthStore from '../stores/authStore'
import { api } from '../lib/api'
import useIsMobile from '../hooks/useIsMobile'

const EMPTY_STATS = {
  totalAnswers: 0,
  correctAnswers: 0,
  firstAnswersCorrect: 0,
  totalPoints: 0,
  currentStreak: 0,
  maxStreak: 0,
  accuracy: 0,
  fastestResponse: null,
  fastAnswers5: 0,
  fastAnswers10: 0
}

function dedupeAchievements(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const id = item?.badgeId?._id || item?.badgeId
    if (!id || seen.has(String(id))) return false
    seen.add(String(id))
    return true
  })
}


const CATEGORY_META = {
  speed: { icon: '⚡', title: 'Speed', description: 'Rewards for answering quickly and accurately.', short: 'Fast & accurate' },
  performance: { icon: '🎯', title: 'Performance', description: 'Rewards for correctness, streaks and accuracy.', short: 'Accuracy & streaks' },
  engagement: { icon: '🌱', title: 'Engagement', description: 'Rewards for consistently participating and learning.', short: 'Participation' },
  milestone: { icon: '🏆', title: 'Milestone', description: 'Special rewards for reaching important achievements.', short: 'Big goals' }
}
const CATEGORY_ORDER = ['speed', 'performance', 'engagement', 'milestone']

function groupByCategory(items = []) {
  return CATEGORY_ORDER.reduce((groups, category) => {
    groups[category] = items.filter((item) => {
      const badge = item?.badgeId || item
      return (badge?.category || 'milestone') === category
    })
    return groups
  }, {})
}

function distanceToBadge(badge, stats) {
  const rule = badge?.rule || {}
  const threshold = Number(rule.threshold || 0)
  switch (rule.type) {
    case 'questions_answered': return Math.max(0, threshold - Number(stats.totalAnswers || 0))
    case 'correct_answers': return Math.max(0, threshold - Number(stats.correctAnswers || 0))
    case 'correct_streak': return Math.max(0, threshold - Number(stats.maxStreak || 0))
    case 'accuracy': return Number(stats.totalAnswers || 0) >= Number(rule.minAnswers || 100) ? Math.max(0, threshold - Number(stats.accuracy || 0)) : Number(rule.minAnswers || 100) - Number(stats.totalAnswers || 0)
    case 'section_accuracy': return Number(stats.totalAnswers || 0) >= Number(rule.minAnswers || 20) ? Math.max(0, threshold - Number(stats.accuracy || 0)) : Number(rule.minAnswers || 20) - Number(stats.totalAnswers || 0)
    case 'fast_answers': return Math.max(0, threshold - Number(stats.fastAnswers5 || 0))
    case 'fast_answers_10': return Math.max(0, threshold - Number(stats.fastAnswers10 || 0))
    case 'perfect_start': return Math.max(0, threshold - Number(stats.firstAnswersCorrect || 0))
    case 'fast_response': return stats.fastestResponse == null ? threshold : 0
    default: return 999999
  }
}

function BadgeGrid({ badges, earned = false, stats, isMobile }) {
  if (!badges?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(230px,1fr))', gap: 16 }}>
      {badges.map((item) => {
        const badge = earned ? item.badgeId : item
        return (
          <BadgeCard
            key={earned ? item._id : badge._id}
            badge={badge}
            earned={earned}
            earnedAt={earned ? item.earnedAt : undefined}
            stats={stats}
          />
        )
      })}
    </div>
  )
}

export default function AchievementsPage() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('lifetime')
  const [data, setData] = useState({ achievedBadges: [], unachievedBadges: [] })
  const [progress, setProgress] = useState({ earned: 0, total: 0, percent: 0, stats: EMPTY_STATS })
  const [sections, setSections] = useState([])
  const [selectedRoom, setSelectedRoom] = useState('')
  const [sectionData, setSectionData] = useState({ achievedBadges: [], unachievedBadges: [], stats: EMPTY_STATS, roomCode: '' })
  const [loading, setLoading] = useState(true)

  const loadLifetime = useCallback(async () => {
    const [badges, progressData] = await Promise.all([api.get('/achievements'), api.get('/achievements/progress')])
    setData({
      achievedBadges: dedupeAchievements(badges?.achievedBadges || []),
      unachievedBadges: badges?.unachievedBadges || []
    })
    setProgress({
      earned: progressData?.earned || 0,
      total: progressData?.total || 0,
      percent: progressData?.percent || 0,
      stats: { ...EMPTY_STATS, ...(progressData?.stats || {}) }
    })
  }, [])

  const loadSections = useCallback(async () => {
    const result = await api.get('/achievements/sections')
    const list = result?.sections || []
    setSections(list)
    if (!selectedRoom && list[0]?.roomCode) setSelectedRoom(list[0].roomCode)
  }, [])

  const loadSection = useCallback(async (roomCode) => {
    if (!roomCode) return
    const result = await api.get(`/achievements/section/${encodeURIComponent(roomCode)}`)
    setSectionData({
      achievedBadges: dedupeAchievements(result?.achievedBadges || []),
      unachievedBadges: result?.unachievedBadges || [],
      stats: { ...EMPTY_STATS, ...(result?.stats || {}) },
      roomCode: result?.roomCode || roomCode
    })
  }, [])

  useEffect(() => {
    ; (async () => {
      try {
        setLoading(true)
        await Promise.allSettled([loadLifetime(), loadSections()])
      } catch (error) {
        console.error('Failed to load achievements:', error)
      } finally {
        setLoading(false)
      }
    })()
  }, [loadLifetime, loadSections])

  useEffect(() => {
    if (tab === 'section' && selectedRoom) loadSection(selectedRoom).catch((e) => console.error('Failed to load section achievements:', e))
  }, [tab, selectedRoom, loadSection])

  const stats = tab === 'lifetime' ? progress.stats : sectionData.stats
  const achieved = tab === 'lifetime' ? data.achievedBadges : sectionData.achievedBadges
  const unachieved = tab === 'lifetime' ? data.unachievedBadges : sectionData.unachievedBadges
  const earnedCount = achieved.length
  const totalCount = earnedCount + unachieved.length
  const percent = totalCount ? Math.round((earnedCount / totalCount) * 100) : 0

  const nextBadge = useMemo(() => {
    if (!unachieved.length) return null
    return [...unachieved].sort((a, b) => distanceToBadge(a, stats) - distanceToBadge(b, stats))[0]
  }, [unachieved, stats])

  const selectedSection = sections.find(s => s.roomCode === selectedRoom)
  const earnedByCategory = useMemo(() => groupByCategory(achieved), [achieved])
  const lockedByCategory = useMemo(() => groupByCategory(unachieved), [unachieved])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--bg-primary), var(--bg-secondary))' }}>
      <Sidebar user={user} />
      <main style={{ marginLeft: 'var(--sidebar-width, 240px)', padding: isMobile ? 16 : 32, maxWidth: 1500, marginRight: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 22, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'inline-flex', gap: 7, color: 'var(--accent)', fontSize: 11, fontWeight: 850, letterSpacing: 1.8, textTransform: 'uppercase' }}><span>🏆</span><span>Rewards & Progress</span></div>
            <h1 style={{ margin: '7px 0 5px', color: 'var(--text-primary)', fontSize: isMobile ? 28 : 38, lineHeight: 1.1 }}>Achievements</h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>Build section streaks and collect permanent lifetime badges.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><ThemeToggle /><ProfileDropdown /></div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 22 }}>
          {[
            ['lifetime', '🏆', 'Lifetime Achievements', 'Never reset — your complete Spandan journey'],
            ['section', '🧩', 'Section Achievements', 'Reset for each quiz / room section']
          ].map(([key, icon, title, subtitle]) => (
            <button key={key} onClick={() => setTab(key)} style={{ textAlign: 'left', padding: 18, borderRadius: 18, border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border-color)'}`, background: tab === key ? 'var(--bg-card)' : 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', boxShadow: tab === key ? 'var(--shadow-md)' : 'none' }}>
              <div style={{ fontSize: 25 }}>{icon}</div>
              <strong style={{ display: 'block', marginTop: 7, fontSize: 16 }}>{title}</strong>
              <span style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)', fontSize: 12 }}>{subtitle}</span>
            </button>
          ))}
        </div>

        {tab === 'section' && (
          <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 18, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Choose section</div>
                <strong style={{ display: 'block', marginTop: 4, color: 'var(--text-primary)', fontSize: 17 }}>{selectedSection?.room?.name || selectedRoom || 'No section yet'}</strong>
              </div>
              <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} style={{ minWidth: isMobile ? '100%' : 260, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                {!sections.length && <option value="">No answered sections yet</option>}
                {sections.map(s => <option key={s.roomCode} value={s.roomCode}>{s.room?.name || s.roomCode} — {s.roomCode}</option>)}
              </select>
            </div>
          </section>
        )}

        <section style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 20 : 28, marginBottom: 22, boxShadow: 'var(--shadow-md)' }}>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto', gap: 24, alignItems: 'center' }}>
            <div style={{ width: isMobile ? 105 : 125, height: isMobile ? 105 : 125, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: `conic-gradient(var(--accent) ${percent}%, var(--border-color) 0)`, flexShrink: 0 }}>
              <div style={{ width: '78%', height: '78%', borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><strong style={{ color: 'var(--text-primary)', fontSize: 27 }}>{percent}%</strong><span style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>COMPLETE</span></div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{tab === 'lifetime' ? 'Lifetime journey' : 'Current section journey'}</div>
              <div style={{ marginTop: 5, color: 'var(--text-primary)', fontSize: 24, fontWeight: 800 }}>{earnedCount} of {totalCount} badges unlocked</div>
              <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{tab === 'lifetime' ? 'These achievements stay with you forever.' : 'Section progress resets when you move to another section.'}</p>
            </div>
            {nextBadge && <div style={{ minWidth: isMobile ? 0 : 190, padding: 16, borderRadius: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}><div style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Next goal</div><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}><span style={{ fontSize: 27 }}>{nextBadge.icon || '🏆'}</span><strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{nextBadge.name}</strong></div></div>}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 28 }}>
          {[["📝", stats.totalAnswers || 0, 'Answers'], ["✅", stats.correctAnswers || 0, 'Correct'], ["🔥", stats.maxStreak || 0, 'Best streak'], ["⭐", stats.totalPoints || 0, 'Points']].map(([icon, value, label]) => <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 20 }}>{icon}</div><strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: 22, marginTop: 6 }}>{value}</strong><span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{label}</span></div>)}
        </section>

        {loading ? <div style={{ padding: 50, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading achievements…</div> : (
          <>
            <section style={{ marginBottom: 30 }}>
              <div style={{ marginBottom: 14 }}>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>🗂️ Achievement Categories</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>Explore rewards by what they measure: speed, performance, engagement and milestones.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,minmax(0,1fr))', gap: 10 }}>
                {CATEGORY_ORDER.map((category) => {
                  const meta = CATEGORY_META[category]
                  const earnedInCategory = earnedByCategory[category]?.length || 0
                  const lockedInCategory = lockedByCategory[category]?.length || 0
                  const totalInCategory = earnedInCategory + lockedInCategory
                  return (
                    <div key={category} style={{ padding: 15, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 23 }}>{meta.icon}</span>
                        <span style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 800 }}>{earnedInCategory}/{totalInCategory}</span>
                      </div>
                      <strong style={{ display: 'block', marginTop: 8, color: 'var(--text-primary)', fontSize: 15 }}>{meta.title}</strong>
                      <span style={{ display: 'block', marginTop: 3, color: 'var(--text-secondary)', fontSize: 11 }}>{meta.short}</span>
                    </div>
                  )
                })}
              </div>

            </section>

            {CATEGORY_ORDER.map((category) => {
              const meta = CATEGORY_META[category]
              const earnedItems = earnedByCategory[category] || []
              const lockedItems = lockedByCategory[category] || []
              const totalItems = earnedItems.length + lockedItems.length
              if (!totalItems) return null
              return (
                <section key={category} style={{ marginBottom: 34 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 15, marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontSize: 25 }}>{meta.icon}</span>
                        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>{meta.title}</h2>
                        <span style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 800 }}>{earnedItems.length}/{totalItems}</span>
                      </div>
                      <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>{meta.description}</p>
                    </div>
                  </div>

                  {earnedItems.length > 0 && (
                    <div
                      style={{
                        marginBottom: lockedItems.length ? 18 : 0,
                        padding: 14,
                        borderRadius: 16,
                        background: 'var(--bg-card)',
                        border: `1px solid ${meta.icon === '🏆' ? 'var(--border-color)' : 'var(--border-color)'}`,
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)' }}>✓</span>
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 850, textTransform: 'uppercase', letterSpacing: 1 }}>Unlocked</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>Achievements you have already earned</div>
                        </div>
                      </div>
                      <BadgeGrid badges={earnedItems} earned stats={stats} isMobile={isMobile} />
                    </div>
                  )}

                  {lockedItems.length > 0 && (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        background: 'var(--bg-secondary)',
                        border: '1px dashed var(--border-color)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-color)', fontSize: 13 }}>🔒</span>
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 850, textTransform: 'uppercase', letterSpacing: 1 }}>Locked — To Unlock</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>Complete the progress shown on each badge</div>
                        </div>
                      </div>
                      <BadgeGrid badges={lockedItems} stats={stats} isMobile={isMobile} />
                    </div>
                  )}
                </section>
              )
            })}

            {!totalCount && (
              <div style={{ padding: 45, textAlign: 'center', border: '2px dashed var(--border-color)', borderRadius: 18, background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 42 }}>🏆</div>
                <strong style={{ display: 'block', marginTop: 8, color: 'var(--text-primary)' }}>No achievements available yet</strong>
                <span style={{ display: 'block', marginTop: 5, fontSize: 12 }}>Complete a quiz section to start collecting badges.</span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
