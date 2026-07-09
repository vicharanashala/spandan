import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'

export default function QuestionLibrary() {
  const { user, token } = useAuthStore()
  const navigate = useNavigate()
  
  const [questions, setQuestions] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user?.role !== 'teacher') {
      navigate('/dashboard')
      return
    }
    fetchQuestions()
  }, [user, token, navigate])

  const fetchQuestions = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/library`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setQuestions(data.questions || [])
      }
    } catch (err) {
      console.error('Failed to fetch library questions:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return
    try {
      const res = await fetch(`${API_URL}/library/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setQuestions(questions.filter(q => q._id !== id))
      }
    } catch (err) {
      console.error('Failed to delete question:', err)
    }
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
                📚 Question Library
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Your personal bank of saved questions
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', marginTop: '40px' }}>Loading library...</div>
          ) : questions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
              <p>Your library is empty.</p>
              <p style={{ fontSize: '14px' }}>You can save questions to your library from active rooms.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {questions.map((q, index) => (
                <div key={q._id} style={{
                  padding: '20px',
                  background: 'var(--bg-card)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'var(--card-shadow)',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <span style={{
                        padding: '4px 10px',
                        background: '#eff6ff',
                        color: '#3b82f6',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}>
                        {q.type}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {q.timeToAnswer}s • {q.points} pts
                      </span>
                    </div>
                    <button onClick={() => handleDelete(q._id)} style={{
                      background: 'rgba(220,38,38,.1)', border: 'none', borderRadius: '6px',
                      color: '#dc2626', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', fontWeight: '600'
                    }}>
                      Delete
                    </button>
                  </div>
                  
                  <p style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {q.question}
                  </p>
                  
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {q.options && q.options.map((opt, i) => (
                      <div key={i} style={{
                        padding: '10px 14px',
                        background: opt.isCorrect ? '#d1fae5' : 'var(--bg-primary)',
                        border: opt.isCorrect ? '1px solid #059669' : '1px solid var(--border-color)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        {String.fromCharCode(65 + i)}. {opt.text}
                        {opt.isCorrect && <span style={{ marginLeft: 'auto', color: '#059669' }}>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
