import React from 'react'

function EditableTranscriptList({
  segments,
  editingSegmentId,
  draftTranscriptText,
  transcriptError,
  isSavingTranscript,
  onEdit,
  onSave,
  onCancel,
  onDraftChange
}) {
  if (!segments?.length) {
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {segments.map((segment) => {
        const isEditing = editingSegmentId === segment._id

        return (
          <div
            key={segment._id}
            style={{
              padding: '10px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              background: 'var(--bg-primary)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Segment {segment.segmentIndex + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {segment.isEdited && (
                  <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '600' }}>
                    Edited
                  </span>
                )}
                {!isEditing && (
                  <button
                    onClick={() => onEdit(segment)}
                    style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✎ Edit
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  aria-label={`Edit transcript segment ${segment.segmentIndex + 1}`}
                  value={draftTranscriptText}
                  onChange={(event) => onDraftChange(event.target.value)}
                  rows={4}
                  style={{ width: '100%', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', resize: 'vertical' }}
                />
                {transcriptError && <span style={{ color: '#dc2626', fontSize: '12px' }}>{transcriptError}</span>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onSave(segment, draftTranscriptText)}
                    disabled={isSavingTranscript}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#2563eb', color: 'white', cursor: isSavingTranscript ? 'wait' : 'pointer' }}
                  >
                    {isSavingTranscript ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={onCancel}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ color: 'var(--text-primary)' }}>{segment.text}</div>
                {segment.isEdited && segment.editedAt && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Edited {new Date(segment.editedAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default EditableTranscriptList
