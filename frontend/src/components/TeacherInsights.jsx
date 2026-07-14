import React, { useState } from 'react'
import MisconceptionHeatmap from './MisconceptionHeatmap'
import HomeworkCenter from './HomeworkCenter'
import RevisionSheet from './RevisionSheet'

function TeacherInsights({ roomId }) {
  const [activeTab, setActiveTab] = useState('heatmap')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const tabs = [
    { id: 'heatmap', label: '🔥 Misconceptions', icon: '🔥' },
    { id: 'homework', label: '📝 Homework', icon: '📝' },
    { id: 'revision', label: '📄 Revision', icon: '📄' },
    { id: 'analytics', label: '📊 Analytics', icon: '📊' }
  ]

  return (
    <div style={{ padding: '8px' }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '20px',
        borderBottom: '1px solid var(--border-color)', paddingBottom: '12px',
        overflow: 'auto'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: activeTab === tab.id
                ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                : 'var(--bg-secondary)',
              color: activeTab === tab.id ? 'white' : 'var(--text-primary)',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'heatmap' && (
          <MisconceptionHeatmap roomId={roomId} refreshTrigger={refreshTrigger} />
        )}

        {activeTab === 'homework' && (
          <HomeworkCenter roomId={roomId} />
        )}

        {activeTab === 'revision' && (
          <RevisionSheet roomId={roomId} refreshTrigger={refreshTrigger} />
        )}

        {activeTab === 'analytics' && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
            border: '1px solid var(--border-color)', textAlign: 'center'
          }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>📊</span>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: 'var(--text-primary)' }}>
              Session Analytics
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
              Detailed analytics view coming soon. Complete polls to populate data.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default TeacherInsights
