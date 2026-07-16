import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import QuestionSettingsPopup from './QuestionSettingsPopup'

const CATEGORY_COLORS = {
  'Uncategorized': { bg: '#f3f4f6', color: '#6b7280' },
  'Math': { bg: '#dbeafe', color: '#2563eb' },
  'Science': { bg: '#d1fae5', color: '#059669' },
  'English': { bg: '#fef3c7', color: '#d97706' },
  'History': { bg: '#fce7f3', color: '#db2777' },
  'Geography': { bg: '#ccfbf1', color: '#0d9488' },
  'Physics': { bg: '#ede9fe', color: '#7c3aed' },
  'Chemistry': { bg: '#fef9c3', color: '#a16207' },
  'Biology': { bg: '#dcfce7', color: '#16a34a' },
  'Computer Science': { bg: '#e0e7ff', color: '#4f46e5' },
}

function getCategoryStyle(name) {
  return CATEGORY_COLORS[name] || { bg: '#f3f4f6', color: '#6b7280' }
}

export default function QuestionBankPanel({ token, onInsertQuestions, onClose }) {
  const [bankQuestions, setBankQuestions] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showCategoryInput, setShowCategoryInput] = useState(null) // question id for editing category
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showSettingsPopup, setShowSettingsPopup] = useState(false)

  useEffect(() => {
    fetchBank()
    fetchCategories()
  }, [])

  const fetchBank = async (category = null) => {
    try {
      let url = `${API_URL}/question-bank`
      if (category && category !== 'All') url += `?category=${encodeURIComponent(category)}`
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setBankQuestions(data.questions)
    } catch (err) {
      console.error('Failed to fetch question bank:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/question-bank/categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setCategories(data.categories)
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    }
  }

  const handleCategoryFilter = (cat) => {
    setSelectedCategory(cat)
    setIsLoading(true)
    fetchBank(cat)
  }

  const handleSetCategory = async (questionId, category) => {
    try {
      const res = await fetch(`${API_URL}/question-bank/${questionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ category: category || 'Uncategorized' })
      })
      const data = await res.json()
      if (data.success) {
        setBankQuestions(prev => prev.map(q => q._id === questionId ? { ...q, category: category || 'Uncategorized' } : q))
        fetchCategories()
      }
    } catch (err) {
      console.error('Failed to update category:', err)
    }
    setShowCategoryInput(null)
    setNewCategoryName('')
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === bankQuestions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bankQuestions.map(q => q._id)))
    }
  }

  const handleInsert = () => {
    setShowSettingsPopup(true)
  }

  const handleConfirmInsert = ({ timeToAnswer, points }) => {
    const selected = bankQuestions.filter(q => selectedIds.has(q._id))
    const transformed = selected.map(q => ({
      _id: q._id,
      question: q.question,
      type: q.type,
      options: q.options,
      explanation: q.explanation,
      points,
      timeToAnswer,
      status: 'approved'
    }))
    onInsertQuestions(transformed)
    onClose()
  }

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_URL}/question-bank/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setBankQuestions(prev => prev.filter(q => q._id !== id))
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
      fetchCategories()
    } catch {}
  }

  if (isLoading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '40px', color: 'var(--text-primary)' }}>
          Loading question bank...
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
        width: '90%', maxWidth: '700px', maxHeight: '80vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
            📚 Question Bank ({bankQuestions.length})
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)'
          }}>✕</button>
        </div>

        {/* Category Filter Chips */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleCategoryFilter('All')}
              style={{
                padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                border: selectedCategory === 'All' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                background: selectedCategory === 'All' ? '#3b82f6' : 'var(--bg-secondary)',
                color: selectedCategory === 'All' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              All ({bankQuestions.length})
            </button>
            {categories.map(cat => {
              const style = getCategoryStyle(cat.name)
              const isActive = selectedCategory === cat.name
              return (
                <button
                  key={cat.name}
                  onClick={() => handleCategoryFilter(cat.name)}
                  style={{
                    padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                    border: isActive ? `2px solid ${style.color}` : '1px solid var(--border-color)',
                    background: isActive ? style.bg : 'var(--bg-secondary)',
                    color: isActive ? style.color : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {cat.name} ({cat.count})
                </button>
              )
            })}
          </div>
        )}

        {bankQuestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>No saved questions yet</p>
            <p style={{ fontSize: '13px' }}>Save questions from your sessions to reuse them here.</p>
          </div>
        ) : (
          <>
            {/* Actions bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
              <button onClick={selectAll} style={{
                padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-primary)'
              }}>
                {selectedIds.size === bankQuestions.length ? 'Deselect All' : 'Select All'}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {selectedIds.size} selected
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleInsert}
                disabled={selectedIds.size === 0}
                style={{
                  padding: '8px 20px',
                  background: selectedIds.size > 0 ? '#3b82f6' : '#9ca3af',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '600',
                  cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                Insert {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} into Room
              </button>
            </div>

            {/* Question list */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bankQuestions.map(q => {
                const isSelected = selectedIds.has(q._id)
                const catStyle = getCategoryStyle(q.category || 'Uncategorized')
                return (
                  <div key={q._id} onClick={() => toggleSelect(q._id)} style={{
                    padding: '12px 16px', borderRadius: '10px', cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : 'var(--bg-primary)',
                    border: `2px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}`,
                    display: 'flex', gap: '12px', alignItems: 'flex-start'
                  }}>
                    <input type="checkbox" checked={isSelected} readOnly style={{ marginTop: '4px', cursor: 'pointer' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                          padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                          background: q.type === 'MCQ' ? '#3b82f620' : q.type === 'TF' ? '#10b98120' : '#8b5cf620',
                          color: q.type === 'MCQ' ? '#3b82f6' : q.type === 'TF' ? '#10b981' : '#8b5cf6'
                        }}>{q.type}</span>
                        <span style={{
                          padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                          background: '#fef3c7', color: '#92400e'
                        }}>{q.points}pts</span>
                        {/* Category badge — clickable to edit */}
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowCategoryInput(showCategoryInput === q._id ? null : q._id)
                            setNewCategoryName(q.category || '')
                          }}
                          style={{
                            padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                            background: catStyle.bg, color: catStyle.color,
                            cursor: 'pointer', border: '1px dashed ' + catStyle.color
                          }}
                          title="Click to change category"
                        >
                          {q.category || 'Uncategorized'}
                        </span>
                        {q.timesUsed > 0 && (
                          <span style={{
                            padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                            background: '#f0fdf4', color: '#16a34a'
                          }}>Used {q.timesUsed}x</span>
                        )}
                      </div>

                      {/* Category inline editor */}
                      {showCategoryInput === q._id && (
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', alignItems: 'center' }}
                          onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Category name"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSetCategory(q._id, newCategoryName)
                              if (e.key === 'Escape') setShowCategoryInput(null)
                            }}
                            style={{
                              padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
                              fontSize: '11px', flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)'
                            }}
                          />
                          <button onClick={() => handleSetCategory(q._id, newCategoryName)} style={{
                            padding: '4px 8px', borderRadius: '6px', background: '#3b82f6',
                            color: 'white', border: 'none', fontSize: '11px', cursor: 'pointer'
                          }}>✓</button>
                        </div>
                      )}

                      <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                        {q.question}
                      </p>
                      {q.explanation && (
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          💡 {q.explanation.substring(0, 80)}{q.explanation.length > 80 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(q._id) }} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444',
                      fontSize: '14px', padding: '4px', flexShrink: 0
                    }} title="Remove from bank">🗑</button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Settings Popup */}
      {showSettingsPopup && (
        <QuestionSettingsPopup
          questionCount={selectedIds.size}
          onConfirm={handleConfirmInsert}
          onClose={() => setShowSettingsPopup(false)}
        />
      )}
    </div>
  )
}
