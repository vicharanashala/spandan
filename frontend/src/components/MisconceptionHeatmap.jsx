import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import HeatmapChart from './HeatmapChart'

function MisconceptionHeatmap({ roomId, refreshTrigger = 0 }) {
  const token = useAuthStore(s => s.token)
  const [heatmap, setHeatmap] = useState([])
  const [recentAnalyses, setRecentAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomId || !token) return
    fetchHeatmap()
  }, [roomId, token, refreshTrigger])

  const fetchHeatmap = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/insights/misconceptions/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setHeatmap(data.heatmap || [])
        setRecentAnalyses(data.analyses || [])
        if (data.heatmap?.length > 0 && !selectedTopic) {
          setSelectedTopic(data.heatmap[0])
        }
      } else {
        setError(data.error || 'Failed to load heatmap')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
        <div style={{
          width: '32px', height: '32px', border: '3px solid var(--border-color)',
          borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite',
          margin: '0 auto 12px'
        }} />
        Loading misconception analysis...
      </div>
    )
  }

  const currentTopic = selectedTopic || heatmap[0] || null
  const subtopics = currentTopic?.subtopics || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {heatmap.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>🔥</span>
          <p style={{ fontSize: '14px', margin: 0 }}>No misconception data yet.</p>
          <p style={{ fontSize: '13px', margin: '4px 0 0' }}>Complete a poll to automatically generate misconception analysis.</p>
        </div>
      ) : (
        <>
          {/* Topic Tabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {heatmap.map((topic, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedTopic(topic)}
                style={{
                  padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border-color)',
                  background: selectedTopic?.topic === topic.topic ? '#3b82f6' : 'var(--bg-secondary)',
                  color: selectedTopic?.topic === topic.topic ? 'white' : 'var(--text-primary)',
                  fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {topic.topic}
                <span style={{
                  marginLeft: '8px', padding: '2px 6px', borderRadius: '10px',
                  background: topic.overallConfusionScore > 50 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
                  fontSize: '11px'
                }}>
                  {topic.overallConfusionScore}%
                </span>
              </button>
            ))}
          </div>

          {/* Heatmap */}
          <HeatmapChart
            topics={subtopics.map(st => ({
              name: st.name,
              confusionScore: st.confusionScore,
              studentsAffected: st.studentsAffected,
              recommendation: st.recommendation
            }))}
            title={`🔥 ${currentTopic?.topic || 'Classroom Misconception Heatmap'}`}
          />

          {/* Overall Stats */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '16px',
            border: '1px solid var(--border-color)'
          }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              📊 Overall Confusion Score
            </h4>
            <div style={{
              width: '100%', height: '24px', background: 'var(--bg-secondary)',
              borderRadius: '12px', overflow: 'hidden', position: 'relative'
            }}>
              <div style={{
                height: '100%', borderRadius: '12px',
                background: currentTopic?.overallConfusionScore <= 20
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : currentTopic?.overallConfusionScore <= 40
                    ? 'linear-gradient(90deg, #eab308, #ca8a04)'
                    : currentTopic?.overallConfusionScore <= 60
                      ? 'linear-gradient(90deg, #f97316, #ea580c)'
                      : 'linear-gradient(90deg, #ef4444, #dc2626)',
                width: `${Math.min(currentTopic?.overallConfusionScore || 0, 100)}%`,
                transition: 'width 0.8s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                paddingRight: '12px'
              }}>
                <span style={{ fontSize: '11px', color: 'white', fontWeight: '700' }}>
                  {currentTopic?.overallConfusionScore || 0}% Confused
                </span>
              </div>
            </div>
          </div>

          {/* Recent Analyses Timeline */}
          {recentAnalyses.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', borderRadius: '12px', padding: '16px',
              border: '1px solid var(--border-color)'
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                📋 Analysis History ({recentAnalyses.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflow: 'auto' }}>
                {recentAnalyses.map((a, idx) => (
                  <div key={idx} style={{
                    padding: '10px', borderRadius: '8px',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                    fontSize: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        {a.questionId?.question?.substring(0, 60) || 'Question'}...
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                        background: a.overallConfusionScore > 50 ? '#fee2e2' : '#dcfce7',
                        color: a.overallConfusionScore > 50 ? '#991b1b' : '#166534'
                      }}>
                        {a.overallConfusionScore}% confused
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                      {a.subtopics?.length || 0} subtopic(s) analyzed · {new Date(a.generatedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MisconceptionHeatmap
