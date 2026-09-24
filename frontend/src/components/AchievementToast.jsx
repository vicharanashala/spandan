import React, { useEffect, useState } from 'react'
import useSocketStore from '../stores/socketStore'
import useAuthStore from '../stores/authStore'

export default function AchievementToast() {
  const { socket } = useSocketStore()
  const { user } = useAuthStore()

  const [badge, setBadge] = useState(null)

  useEffect(() => {
    if (!socket) return

    const onBadgeEarned = (data) => {
      if (
        !user?._id ||
        String(data?.userId) !== String(user._id)
      ) {
        return
      }

      const next = data?.badges?.[0]?.badgeId

      if (!next) return

      setBadge(next)

      setTimeout(() => {
        setBadge(null)
      }, 6500)
    }

    socket.on('badge-earned', onBadgeEarned)

    return () => {
      socket.off('badge-earned', onBadgeEarned)
    }
  }, [socket, user?._id])

  if (!badge) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999
      }}
    >
      {/* Confetti */}
      {Array.from({ length: 34 }).map((_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${(i * 31) % 100}%`,
            top: '-20px',
            width: i % 2 === 0 ? 7 : 5,
            height: i % 2 === 0 ? 13 : 9,
            borderRadius: 2,
            background:
              i % 4 === 0
                ? '#3b82f6'
                : i % 4 === 1
                  ? '#f59e0b'
                  : i % 4 === 2
                    ? '#10b981'
                    : '#8b5cf6',
            transform: `rotate(${i * 29}deg)`,
            animation: `spandanConfetti ${1.2 + (i % 5) * 0.18
              }s ease-out forwards`,
            animationDelay: `${(i % 8) * 0.05}s`
          }}
        />
      ))}

      {/* Achievement modal */}
      <div
        style={{
          position: 'absolute',
          top: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(420px, calc(100vw - 32px))',
          padding: 28,
          textAlign: 'center',
          borderRadius: 24,
          background: 'var(--bg-card)',
          border: '1px solid var(--accent)',
          boxShadow: '0 24px 80px rgba(0,0,0,.35)',
          animation:
            'spandanAchievementPop .4s cubic-bezier(.2,.8,.2,1)'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 92,
            height: 92,
            borderRadius: '50%',
            background:
              'linear-gradient(135deg, rgba(59,130,246,.16), rgba(124,58,237,.16))',
            border: '2px solid var(--accent)',
            boxShadow: '0 10px 35px rgba(59,130,246,.18)',
            fontSize: 52
          }}
        >
          {badge.icon || '🏆'}
        </div>

        <div
          style={{
            marginTop: 18,
            color: 'var(--accent)',
            fontSize: 11,
            fontWeight: 850,
            letterSpacing: 2,
            textTransform: 'uppercase'
          }}
        >
          Achievement Unlocked
        </div>

        <h2
          style={{
            margin: '8px 0 5px',
            color: 'var(--text-primary)',
            fontSize: 26,
            letterSpacing: '-0.03em'
          }}
        >
          {badge.name}
        </h2>

        <p
          style={{
            margin: 0,
            color: 'var(--text-secondary)',
            fontSize: 14,
            lineHeight: 1.5
          }}
        >
          {badge.description}
        </p>

        <div
          style={{
            marginTop: 18,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 13px',
            borderRadius: 999,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 700
          }}
        >
          🎉 Keep going!
        </div>
      </div>

      <style>{`
        @keyframes spandanAchievementPop {
          from {
            opacity: 0;
            transform: translateX(-50%) scale(.82) translateY(-25px);
          }

          to {
            opacity: 1;
            transform: translateX(-50%) scale(1) translateY(0);
          }
        }

        @keyframes spandanConfetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }

          100% {
            transform: translateY(72vh) rotate(540deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}