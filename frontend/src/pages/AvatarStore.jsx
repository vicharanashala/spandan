import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'
import ConfettiEffect from '../components/ConfettiEffect'

export default function AvatarStore() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  
  const [catalog, setCatalog] = useState([])
  const [userState, setUserState] = useState({ personalXp: 0, unlockedAvatars: [], activeAvatar: 'default' })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [purchaseLoading, setPurchaseLoading] = useState(null)
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    fetchStoreData()
  }, [])

  const fetchStoreData = async () => {
    try {
      const res = await fetch(`${API_URL}/store/avatars`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setCatalog(data.catalog)
        setUserState(data.userState)
      } else {
        setError(data.error || 'Failed to load store')
      }
    } catch (err) {
      setError('Network error loading store')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePurchase = async (avatar) => {
    if (userState.personalXp < avatar.price) return
    setPurchaseLoading(avatar.id)
    try {
      const res = await fetch(`${API_URL}/store/avatars/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatarId: avatar.id })
      })
      const data = await res.json()
      if (data.success) {
        setUserState(prev => ({
          ...prev,
          personalXp: data.newBalance,
          unlockedAvatars: data.unlockedAvatars
        }))
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 3000)
      } else {
        alert(data.error)
      }
    } catch (err) {
      alert('Network error')
    } finally {
      setPurchaseLoading(null)
    }
  }

  const handleEquip = async (avatarId) => {
    try {
      const res = await fetch(`${API_URL}/store/avatars/equip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatarId })
      })
      const data = await res.json()
      if (data.success) {
        setUserState(prev => ({ ...prev, activeAvatar: data.activeAvatar }))
      }
    } catch (err) {
      alert('Network error')
    }
  }

  const S = {
    page: { display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", system-ui, sans-serif' },
    main: { flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column' },
    header: { padding: '24px 40px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 },
    title: { fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' },
    wallet: { background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', padding: '8px 16px', borderRadius: '12px', fontWeight: '700', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' },
    content: { padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' },
    card: { background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden', transition: 'all 0.2s', display: 'flex', flexDirection: 'column' },
    iconBox: { height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' },
    infoBox: { padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' },
    name: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 4px 0' },
    rarity: { fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' },
    btnGroup: { marginTop: 'auto' },
    buyBtn: { width: '100%', padding: '10px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', transition: 'transform 0.1s' },
    equipBtn: { width: '100%', padding: '10px', background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' },
    equippedLabel: { width: '100%', padding: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', fontWeight: '700', textAlign: 'center', boxSizing: 'border-box' },
    lockedBtn: { width: '100%', padding: '10px', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: '700', cursor: 'not-allowed', opacity: 0.6 }
  }

  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'Mythic': return '#ef4444'
      case 'Legendary': return '#f59e0b'
      case 'Epic': return '#8b5cf6'
      case 'Rare': return '#3b82f6'
      case 'Uncommon': return '#10b981'
      default: return 'var(--text-secondary)'
    }
  }

  return (
    <div style={S.page}>
      <ConfettiEffect trigger={showConfetti} duration={3000} />
      <Sidebar user={user} />
      
      <div style={S.main}>
        <header style={S.header}>
          <h1 style={S.title}><span>🛍️</span> Avatar Store</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={S.wallet}>
              ⭐ {userState.personalXp} XP
            </div>
            <ThemeToggle />
            <ProfileDropdown />
          </div>
        </header>

        <div style={S.content}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading catalog...</div>
          ) : error ? (
            <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '20px', borderRadius: '12px' }}>{error}</div>
          ) : (
            <div style={S.grid}>
              {catalog.map(item => {
                const isOwned = userState.unlockedAvatars.includes(item.id)
                const isEquipped = userState.activeAvatar === item.id
                const canAfford = userState.personalXp >= item.price
                const isBuying = purchaseLoading === item.id

                return (
                  <div key={item.id} style={{
                    ...S.card,
                    boxShadow: isEquipped ? '0 0 0 2px #10b981' : 'var(--card-shadow)'
                  }}>
                    <div style={S.iconBox}>
                      {item.icon}
                    </div>
                    <div style={S.infoBox}>
                      <h3 style={S.name}>{item.name}</h3>
                      <div style={{ ...S.rarity, color: getRarityColor(item.rarity) }}>
                        {item.rarity}
                      </div>
                      
                      <div style={S.btnGroup}>
                        {isEquipped ? (
                          <div style={S.equippedLabel}>✓ Equipped</div>
                        ) : isOwned ? (
                          <button onClick={() => handleEquip(item.id)} style={S.equipBtn}>Equip</button>
                        ) : (
                          <button 
                            disabled={!canAfford || isBuying}
                            onClick={() => handlePurchase(item)}
                            style={canAfford ? S.buyBtn : S.lockedBtn}
                          >
                            {isBuying ? 'Purchasing...' : `Buy for ${item.price} XP`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
