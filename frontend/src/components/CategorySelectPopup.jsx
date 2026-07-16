import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'

const CATEGORY_PRESETS = [
  { name: 'Math', color: '#2563eb', bg: '#dbeafe' },
  { name: 'Science', color: '#059669', bg: '#d1fae5' },
  { name: 'English', color: '#d97706', bg: '#fef3c7' },
  { name: 'History', color: '#db2777', bg: '#fce7f3' },
  { name: 'Physics', color: '#7c3aed', bg: '#ede9fe' },
  { name: 'Chemistry', color: '#a16207', bg: '#fef9c3' },
  { name: 'Biology', color: '#16a34a', bg: '#dcfce7' },
]

function getCategoryColor(name) {
  const found = CATEGORY_PRESETS.find(c => c.name === name)
  return found || { name, color: '#6b7280', bg: '#f3f4f6' }
}

/**
 * CategorySelectPopup — shown when saving question(s) to bank.
 * Shows existing categories + option to type a new one.
 */
export default function CategorySelectPopup({ token, onSave, onClose, questionCount = 1 }) {
  const [existingCategories, setExistingCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/question-bank/categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setExistingCategories(data.categories)
    } catch (err) {
      console.error('Failed to fetch categories:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = () => {
    const category = selectedCategory || newCategory.trim() || 'Uncategorized'
    onSave(category)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (selectedCategory || newCategory.trim())) {
      handleSave()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
        width: '90%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
            💾 Save {questionCount > 1 ? `${questionCount} Questions` : 'Question'} to Bank
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)'
          }}>✕</button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Select a category to organize this question:
        </p>

        {/* Existing categories */}
        {existingCategories.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              EXISTING CATEGORIES
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {existingCategories.map(cat => {
                const style = getCategoryColor(cat.name)
                const isSelected = selectedCategory === cat.name
                return (
                  <button
                    key={cat.name}
                    onClick={() => {
                      setSelectedCategory(isSelected ? '' : cat.name)
                      setNewCategory('')
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                      border: `2px solid ${isSelected ? style.color : 'var(--border-color)'}`,
                      background: isSelected ? style.bg : 'var(--bg-secondary)',
                      color: isSelected ? style.color : 'var(--text-secondary)',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    {cat.name} ({cat.count})
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Create new category */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            {existingCategories.length > 0 ? 'OR CREATE NEW' : 'CREATE CATEGORY'}
          </p>
          <input
            type="text"
            value={newCategory}
            onChange={(e) => {
              setNewCategory(e.target.value)
              setSelectedCategory('')
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type category name..."
            autoFocus
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: '2px solid var(--border-color)', fontSize: '14px',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              boxSizing: 'border-box', outline: 'none'
            }}
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            background: (selectedCategory || newCategory.trim()) ? '#3b82f6' : '#9ca3af',
            color: 'white', border: 'none', fontSize: '14px', fontWeight: '600',
            cursor: (selectedCategory || newCategory.trim()) ? 'pointer' : 'not-allowed'
          }}
        >
          Save as "{selectedCategory || newCategory.trim() || 'Uncategorized'}"
        </button>
      </div>
    </div>
  )
}
