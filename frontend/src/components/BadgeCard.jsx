import React, { useMemo, useState } from 'react'

const tierStyles = {
  performance: {
    ring: '#7c3aed',
    bg: '#f3e8ff',
    darkBg: '#2e1065',
    label: 'Performance'
  },
  engagement: {
    ring: '#059669',
    bg: '#d1fae5',
    darkBg: '#064e3b',
    label: 'Engagement'
  },
  speed: {
    ring: '#2563eb',
    bg: '#dbeafe',
    darkBg: '#172554',
    label: 'Speed'
  },
  milestone: {
    ring: '#d97706',
    bg: '#fef3c7',
    darkBg: '#451a03',
    label: 'Milestone'
  }
}

function getProgress(badge, stats = {}) {
  const rule = badge?.rule
  if (!rule) return null

  const threshold = Number(rule.threshold || 0)

  if (!threshold) return null

  switch (rule.type) {
    case 'questions_answered': {
      const current = Number(stats.totalAnswers || 0)
      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current} / ${threshold}`
      }
    }

    case 'correct_answers': {
      const current = Number(stats.correctAnswers || 0)
      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current} / ${threshold}`
      }
    }

    case 'correct_streak': {
      const current = Number(stats.maxStreak || 0)
      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current} / ${threshold}`
      }
    }

    case 'accuracy': {
      const current = Number(stats.accuracy || 0)

      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current.toFixed(0)}% / ${threshold}% (min ${Number(rule.minAnswers || 100)} answers)`
      }
    }


    case 'fast_answers': {
      const current = Number(stats.fastAnswers5 || 0)
      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current} / ${threshold}`
      }
    }

    case 'fast_answers_10': {
      const current = Number(stats.fastAnswers10 || 0)
      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current} / ${threshold}`
      }
    }

    case 'perfect_start': {
      const current = Math.min(Number(stats.firstAnswersCorrect || 0), threshold)
      return {
        current,
        threshold,
        percent: Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current} / ${threshold} first correct`
      }
    }

    case 'section_accuracy': {
      const current = Number(stats.accuracy || 0)
      const minAnswers = Number(rule.minAnswers || 20)
      return {
        current,
        threshold,
        percent: current >= threshold && Number(stats.totalAnswers || 0) >= minAnswers ? 100 : Math.min(100, Math.round((current / threshold) * 100)),
        text: `${current.toFixed(0)}% / ${threshold}% (${Number(stats.totalAnswers || 0)}/${minAnswers})`
      }
    }

    case 'fast_response': {
      const fastest = stats.fastestResponse

      if (fastest === null || fastest === undefined) {
        return {
          current: 0,
          threshold,
          percent: 0,
          text: `≤ ${threshold}s`,
          special: true
        }
      }

      const achieved = Number(fastest) <= threshold

      return {
        current: Number(fastest),
        threshold,
        percent: achieved ? 100 : 0,
        text: `${Number(fastest).toFixed(1)}s best`,
        special: true,
        achieved
      }
    }

    default:
      return null
  }
}

export default function BadgeCard({
  badge,
  earned = false,
  earnedAt,
  stats = {}
}) {
  const [hovered, setHovered] = useState(false)

  const tier = tierStyles[badge?.category] || tierStyles.milestone

  const progress = useMemo(
    () => getProgress(badge, stats),
    [badge, stats]
  )

  const progressColor = tier.ring

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        minHeight: 245,
        padding: 22,
        borderRadius: 20,
        border: `1px solid ${earned ? `${tier.ring}66` : 'var(--border-color)'
          }`,
        background: 'var(--bg-card)',
        boxShadow: hovered
          ? 'var(--shadow-lg)'
          : earned
            ? 'var(--shadow-md)'
            : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition:
          'transform .2s ease, box-shadow .2s ease, border-color .2s ease',
        overflow: 'hidden'
      }}
    >
      {/* Top accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: earned
            ? `linear-gradient(90deg, ${tier.ring}, ${tier.ring}88)`
            : 'var(--border-color)'
        }}
      />

      {/* Lock / earned indicator */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 30,
          height: 30,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: earned
            ? `${tier.ring}18`
            : 'var(--bg-secondary)',
          border: `1px solid ${earned ? `${tier.ring}44` : 'var(--border-color)'
            }`,
          fontSize: 15
        }}
      >
        {earned ? '✓' : '🔒'}
      </div>

      {/* Badge icon — fixed viewport so emoji glyphs can never spill outside */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          marginBottom: 15,
          flex: '0 0 72px',
          overflow: 'hidden',
          boxSizing: 'border-box',
          fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
          background: earned ? tier.bg : 'var(--bg-secondary)',
          border: `2px solid ${earned ? `${tier.ring}44` : 'var(--border-color)'
            }`,
          filter: earned ? 'none' : 'grayscale(1)',
          opacity: earned ? 1 : 0.65,
          boxShadow: earned
            ? `0 8px 20px ${tier.ring}22`
            : 'none'
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            lineHeight: '68px',
            textAlign: 'center',
            fontSize: 31,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            transform: 'translateY(1px)'
          }}
        >
          {badge?.icon || '🏆'}
        </span>
      </div>

      {/* Category */}
      <div
        style={{
          display: 'inline-flex',
          padding: '5px 9px',
          borderRadius: 999,
          background: earned ? `${tier.ring}12` : 'var(--bg-secondary)',
          border: `1px solid ${earned ? `${tier.ring}30` : 'var(--border-color)'
            }`,
          color: tier.ring,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: 'uppercase'
        }}
      >
        {tier.label}
      </div>

      {/* Title */}
      <h3
        style={{
          margin: '10px 0 6px',
          color: 'var(--text-primary)',
          fontSize: 18,
          fontWeight: 750,
          letterSpacing: '-0.02em'
        }}
      >
        {badge?.name || 'Achievement'}
      </h3>

      {/* Description */}
      <p
        style={{
          margin: 0,
          color: 'var(--text-secondary)',
          fontSize: 13,
          lineHeight: 1.55,
          minHeight: 40
        }}
      >
        {earned
          ? badge?.description
          : badge?.criteria || badge?.description}
      </p>

      {/* Earned */}
      {earned && (
        <div
          style={{
            marginTop: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--border-color)'
          }}
        >
          <span
            style={{
              color: tier.ring,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.6
            }}
          >
            ✓ EARNED
          </span>

          {earnedAt && (
            <span
              style={{
                color: 'var(--text-secondary)',
                fontSize: 10
              }}
            >
              {new Date(earnedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Locked progress */}
      {!earned && progress && (
        <div style={{ marginTop: 17 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 7
            }}
          >
            <span
              style={{
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600
              }}
            >
              Progress
            </span>

            <span
              style={{
                color: 'var(--text-primary)',
                fontSize: 11,
                fontWeight: 750
              }}
            >
              {progress.text}
            </span>
          </div>

          <div
            style={{
              height: 7,
              width: '100%',
              borderRadius: 99,
              overflow: 'hidden',
              background: 'var(--border-color)'
            }}
          >
            <div
              style={{
                width: `${progress.percent}%`,
                height: '100%',
                borderRadius: 99,
                background: progressColor,
                transition: 'width .5s ease'
              }}
            />
          </div>
        </div>
      )}

      {/* Hover description overlay inspired by PR #41 */}
      {hovered && !earned && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.94)',
            color: '#fff',
            transition: 'opacity .2s ease',
            pointerEvents: 'none'
          }}
        >
          <div>
            <div
              style={{
                width: 54,
                height: 54,
                margin: '0 auto 8px',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
                fontSize: 27,
                lineHeight: 1
              }}
            >
              {badge?.icon || '🏆'}
            </div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.5,
                color: '#93c5fd',
                textTransform: 'uppercase',
                marginBottom: 7
              }}
            >
              How to unlock
            </div>

            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                fontWeight: 600
              }}
            >
              {badge?.criteria || badge?.description}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}