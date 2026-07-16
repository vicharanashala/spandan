import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const CategoryManager = ({ roomId, token, onCategoriesChange }) => {
  const [categories, setCategories] = useState([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories?roomId=${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setCategories(data.categories)
        onCategoriesChange?.(data.categories)
      }
    } catch (err) {
      setError('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (roomId && token) fetchCategories()
  }, [roomId, token])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setError('')
    try {
      const res = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ roomId, name: newName, color: newColor })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create')
        return
      }
      setCategories(prev => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)))
      onCategoriesChange?.([...categories, data.category])
      setNewName('')
      setNewColor(PRESET_COLORS[0])
    } catch (err) {
      setError('Failed to create category')
    }
  }

  const handleUpdate = async (id) => {
    if (!editName.trim()) return
    setError('')
    try {
      const res = await fetch(`${API_URL}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: editName, color: editColor })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update')
        return
      }
      setCategories(prev => prev.map(c => c._id === id ? data.category : c).sort((a, b) => a.name.localeCompare(b.name)))
      onCategoriesChange?.(categories.map(c => c._id === id ? data.category : c))
      setEditingId(null)
    } catch (err) {
      setError('Failed to update category')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this category? Questions will become uncategorized.')) return
    setError('')
    try {
      const res = await fetch(`${API_URL}/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete')
        return
      }
      setCategories(prev => prev.filter(c => c._id !== id))
      onCategoriesChange?.(categories.filter(c => c._id !== id))
    } catch (err) {
      setError('Failed to delete category')
    }
  }

  if (loading) {
    return <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading categories...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Create new category */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name..."
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
            background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
          }}
        />
        <div style={{ display: 'flex', gap: '4px' }}>
          {PRESET_COLORS.slice(0, 4).map(c => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              style={{
                width: '22px', height: '22px', borderRadius: '50%', background: c, border: 'none',
                cursor: 'pointer', outline: newColor === c ? '2px solid var(--text-primary)' : 'none',
                outlineOffset: '2px'
              }}
            />
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            background: newName.trim() ? '#3b82f6' : 'var(--border-color)',
            color: 'white', fontSize: '13px', fontWeight: '600', cursor: newName.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          Add
        </button>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {/* Category list */}
      {categories.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          No categories yet. Create one to organize your questions.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {categories.map(cat => (
            <div key={cat._id} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
              background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)'
            }}>
              {editingId === cat._id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat._id)}
                    style={{
                      flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
                      background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                    }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        style={{
                          width: '16px', height: '16px', borderRadius: '50%', background: c, border: 'none',
                          cursor: 'pointer', outline: editColor === c ? '2px solid var(--text-primary)' : 'none',
                          outlineOffset: '1px'
                        }}
                      />
                    ))}
                  </div>
                  <button onClick={() => handleUpdate(cat._id)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>✓</button>
                  <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </>
              ) : (
                <>
                  <span style={{
                    width: '14px', height: '14px', borderRadius: '50%', background: cat.color, flexShrink: 0
                  }} />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {cat.name}
                  </span>
                  {cat.questionCount > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                      {cat.questionCount} Q
                    </span>
                  )}
                  <button
                    onClick={() => { setEditingId(cat._id); setEditName(cat.name); setEditColor(cat.color) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(cat._id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CategoryManager
