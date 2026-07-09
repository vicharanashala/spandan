import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

export default function FactionLeaderboardWidget({ token }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${API_URL}/factions/leaderboard`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setLeaderboard(data.leaderboard || [])
      }
    } catch (err) {
      console.error('Failed to fetch faction leaderboard:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getFactionColor = (faction) => {
    switch (faction) {
      case 'Pioneers': return { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe', icon: '🚀' }
      case 'Innovators': return { bg: '#ecfdf5', text: '#10b981', border: '#a7f3d0', icon: '💡' }
      case 'Visionaries': return { bg: '#f5f3ff', text: '#8b5cf6', border: '#ddd6fe', icon: '👁️' }
      default: return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb', icon: '🏳️' }
    }
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--card-shadow)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>⚔️</span> Faction Leaderboard
      </h2>

      {isLoading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {leaderboard.map((faction, idx) => {
            const colors = getFactionColor(faction.name)
            const isFirst = idx === 0 && faction.score > 0
            
            return (
              <div key={faction.name} style={{
                padding: '12px 16px',
                borderRadius: '12px',
                background: isFirst ? colors.bg : 'var(--bg-primary)',
                border: `1px solid ${isFirst ? colors.border : 'var(--border-color)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {isFirst && (
                  <div style={{ position: 'absolute', right: '-15px', top: '-15px', fontSize: '60px', opacity: 0.1 }}>
                    🏆
                  </div>
                )}
                
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px'
                }}>
                  {colors.icon}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', color: colors.text, fontSize: '15px' }}>{faction.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{faction.members} Members</div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '800', fontSize: '18px', color: 'var(--text-primary)' }}>{faction.score}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.5px' }}>TOTAL XP</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
