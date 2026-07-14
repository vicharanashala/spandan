import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useThemeStore from '../stores/themeStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'

const QuickAnswerPage = () => {
  const { roomId, questionId, optionIndex } = useParams()
  const { token, user } = useAuthStore()
  const [status, setStatus] = useState('Submitting your answer...')
  const navigate = useNavigate()

  useEffect(() => {
    if (!token || !user) {
      setStatus('Please log in first to answer the poll.')
      setTimeout(() => {
        navigate('/')
      }, 2000)
      return
    }

    const submitAnswer = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            roomId,
            questionId,
            studentId: user._id,
            selectedOptions: [parseInt(optionIndex, 10)],
            responseTime: 5 // Default estimate since it's an external click
          })
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to submit answer')
        }

        setStatus('Answer Recorded successfully! You can safely close this window.')
      } catch (err) {
        if (err.message.includes('already submitted')) {
          setStatus('You have already answered this poll!')
        } else {
          setStatus('Error: ' + err.message)
        }
      }
    }

    submitAnswer()
  }, [roomId, questionId, optionIndex, token, user, navigate])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '16px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Live Poll Submission</h1>
            <ThemeToggle />
          </div>
        </header>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            background: 'var(--bg-card)',
            padding: '40px',
            borderRadius: '16px',
            boxShadow: 'var(--card-shadow)',
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>{status}</h2>
            {status.includes('Recorded') || status.includes('already') ? (
              <p style={{ color: 'var(--text-secondary)' }}>You can close this tab and return to Teams.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuickAnswerPage
