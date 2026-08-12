import React from 'react'

// Item Health status -> visual language. Colors mirror the existing correct/warning/danger palette
// already used on the results page (RoomResultsPage's scoreColor thresholds: #059669 / #d97706 /
// #dc2626), so this badge reads as part of the same system rather than introducing a new one.
const STATUS_META = {
  'Healthy': { color: '#059669', label: 'Healthy' },
  'Needs Attention': { color: '#d97706', label: 'Needs Attention' },
  'Review Recommended': { color: '#dc2626', label: 'Review Recommended' },
  'Insufficient Data': { color: 'var(--text-secondary)', label: 'Insufficient Data' }
}

const FALLBACK_META = { color: 'var(--text-secondary)', label: 'Unknown' }

// Fixed display order for room-level summaries — most-severe-first, matching the backend's
// most-severe-wins classification order in itemHealthService.js.
export const ITEM_HEALTH_STATUS_ORDER = [
  'Review Recommended',
  'Needs Attention',
  'Healthy',
  'Insufficient Data'
]

export function getItemHealthMeta(status) {
  return STATUS_META[status] || FALLBACK_META
}

// Renders a single status pill ("Healthy"), or — when `count` is provided — a room-level summary
// chip ("3 Healthy"), reusing the same visual treatment for both.
export default function ItemHealthBadge({ status, count }) {
  const meta = getItemHealthMeta(status)
  return (
    <span
      title={`Item Health: ${meta.label}`}
      style={{
        padding: '3px 8px',
        background: 'color-mix(in srgb, ' + meta.color + ' 14%, transparent)',
        color: meta.color,
        border: '1px solid color-mix(in srgb, ' + meta.color + ' 28%, transparent)',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}
    >
      {count !== undefined ? `${count} ${meta.label}` : meta.label}
    </span>
  )
}

// ── Readable metric formatters ───────────────────────────────────────────────────────────────
// Shared here so the badge component is the single source of truth for how Item Health numbers
// are presented, whether or not the underlying value is available.

export function formatCorrectRate(entry) {
  if (!entry || entry.correctRate === null || entry.correctRate === undefined) return '—'
  return `${Math.round(entry.correctRate * 100)}%`
}

export function formatDiscrimination(entry) {
  if (!entry) return '—'
  if (entry.discrimination === null || entry.discrimination === undefined) {
    return entry.discriminationInsufficientData ? 'Not enough data' : '—'
  }
  return entry.discrimination.toFixed(2)
}

// TF/MSQ questions don't have a meaningful "distractor" concept (see itemHealthService.js), so
// this reads "N/A" for them rather than a misleading 0/0.
export function formatDeadDistractors(entry) {
  if (!entry || !entry.distractorEfficiency) return '—'
  const { applicable, deadCount, totalDistractors } = entry.distractorEfficiency
  if (!applicable) return 'N/A'
  return `${deadCount}/${totalDistractors}`
}
