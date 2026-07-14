import React from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

function StatCard({ label, value, suffix = '', color = '#3b82f6' }) {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid var(--border-color)',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '28px', fontWeight: '700', color }}>{value}{suffix}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: '500' }}>{label}</div>
    </div>
  )
}

function InsightRow({ icon, label, value }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      padding: '10px 12px',
      background: 'var(--bg-primary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      fontSize: '13px'
    }}>
      <span style={{ color: '#10b981', fontWeight: '700' }}>{icon}</span>
      <div>
        <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{label}: </span>
        <span style={{ color: 'var(--text-primary)' }}>{value}</span>
      </div>
    </div>
  )
}

function AISummaryCard({ summary, isLoading, questionText }) {
  if (isLoading) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '32px',
        border: '1px solid var(--border-color)',
        textAlign: 'center',
        marginBottom: '20px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid var(--border-color)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} />
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: '18px' }}>Generating AI Summary...</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Analyzing student responses</p>
      </div>
    )
  }

  if (!summary) return null

  const stats = summary.pollStats || {}
  const insights = summary.aiInsightsDetails || {}
  const charts = summary.charts || {}
  const distribution = charts.answerDistribution || {}

  const pieData = {
    labels: ['Correct', 'Incorrect'],
    datasets: [{
      data: [charts.correctAnswers || 0, charts.incorrectAnswers || 0],
      backgroundColor: ['#10b981', '#ef4444'],
      borderWidth: 0
    }]
  }

  const barLabels = Object.keys(distribution).map(idx => String.fromCharCode(65 + parseInt(idx, 10)))
  const barData = {
    labels: barLabels.length ? barLabels : ['A', 'B', 'C', 'D'],
    datasets: [{
      label: 'Responses',
      data: Object.keys(distribution).length
        ? Object.values(distribution)
        : [0, 0, 0, 0],
      backgroundColor: '#6366f1',
      borderRadius: 6
    }]
  }

  const participation = stats.participationRate || 0
  const gaugeData = {
    labels: ['Participated', 'Remaining'],
    datasets: [{
      data: [participation, Math.max(0, 100 - participation)],
      backgroundColor: ['#3b82f6', 'var(--border-color)'],
      borderWidth: 0
    }]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid var(--border-color)',
      marginBottom: '20px',
      boxShadow: 'var(--card-shadow)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
          📊 AI Classroom Summary
        </h2>
        {summary.isFallback && (
          <span style={{
            padding: '4px 10px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: '600'
          }}>
            Local fallback summary
          </span>
        )}
      </div>

      {questionText && (
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Question: {questionText}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <StatCard label="Participation Rate" value={stats.participationRate ?? 0} suffix="%" color="#3b82f6" />
        <StatCard label="Average Score" value={stats.averageScore ?? 0} color="#8b5cf6" />
        <StatCard label="Correct %" value={stats.correctPercentage ?? 0} suffix="%" color="#10b981" />
        <StatCard label="Incorrect %" value={stats.incorrectPercentage ?? 0} suffix="%" color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'center' }}>Correct vs Incorrect</p>
          <div style={{ height: '160px' }}>
            <Doughnut data={pieData} options={chartOptions} />
          </div>
        </div>
        <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'center' }}>Answer Distribution</p>
          <div style={{ height: '160px' }}>
            <Bar data={barData} options={{ ...chartOptions, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }} />
          </div>
        </div>
        <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textAlign: 'center' }}>Participation Gauge</p>
          <div style={{ height: '160px', position: 'relative' }}>
            <Doughnut data={gaugeData} options={{ ...chartOptions, cutout: '75%' }} />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '24px',
              fontWeight: '700',
              color: '#3b82f6'
            }}>
              {participation}%
            </div>
          </div>
        </div>
      </div>

      {summary.aiSummary && (
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px',
          whiteSpace: 'pre-wrap',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--text-primary)'
        }}>
          {summary.aiSummary}
        </div>
      )}

      <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>AI Insights</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <InsightRow icon="✓" label="Most understood concept" value={insights.mostUnderstoodConcept} />
        <InsightRow icon="✗" label="Most misunderstood concept" value={insights.mostMisunderstoodConcept} />
        <InsightRow icon="💡" label="Suggested explanation" value={insights.suggestedExplanation} />
        <InsightRow icon="❓" label="Suggested follow-up question" value={insights.suggestedFollowUpQuestion} />
        <InsightRow icon="📚" label="Homework recommendation" value={insights.homeworkRecommendation} />
        <InsightRow icon="➡️" label="Next topic recommendation" value={insights.nextTopicRecommendation} />
      </div>

      {summary.recommendations?.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Recommendations</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.8' }}>
            {summary.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default AISummaryCard
