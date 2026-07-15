import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import EditableTranscriptList from '../components/EditableTranscriptList'

function TranscriptListHarness({ initialSegments }) {
  const [segments, setSegments] = React.useState(initialSegments)
  const [editingSegmentId, setEditingSegmentId] = React.useState(null)
  const [draftTranscriptText, setDraftTranscriptText] = React.useState('')
  const [transcriptError, setTranscriptError] = React.useState('')
  const [isSavingTranscript, setIsSavingTranscript] = React.useState(false)

  const handleEdit = (segment) => {
    setEditingSegmentId(segment._id)
    setDraftTranscriptText(segment.text)
    setTranscriptError('')
  }

  const handleCancel = () => {
    setEditingSegmentId(null)
    setDraftTranscriptText('')
    setTranscriptError('')
  }

  const handleSave = (segment, nextText) => {
    const trimmedText = nextText.trim()
    if (!trimmedText) {
      setTranscriptError('Transcript text cannot be empty')
      return
    }

    setIsSavingTranscript(true)
    setSegments(prev => prev.map(item => item._id === segment._id ? { ...item, text: trimmedText, isEdited: true, editedAt: new Date().toISOString() } : item))
    setEditingSegmentId(null)
    setIsSavingTranscript(false)
  }

  return (
    <EditableTranscriptList
      segments={segments}
      editingSegmentId={editingSegmentId}
      draftTranscriptText={draftTranscriptText}
      transcriptError={transcriptError}
      isSavingTranscript={isSavingTranscript}
      onEdit={handleEdit}
      onSave={handleSave}
      onCancel={handleCancel}
      onDraftChange={setDraftTranscriptText}
    />
  )
}

describe('EditableTranscriptList', () => {
  const baseSegments = [
    {
      _id: 'segment-1',
      segmentIndex: 0,
      text: 'Original transcript',
      isEdited: false,
      editedAt: null
    }
  ]

  it('switches to edit mode when the Edit button is clicked', () => {
    render(<TranscriptListHarness initialSegments={baseSegments} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByLabelText(/edit transcript segment/i)).toBeInTheDocument()
  })

  it('calls save with the updated text and reflects the saved text', () => {
    render(<TranscriptListHarness initialSegments={baseSegments} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const textarea = screen.getByLabelText(/edit transcript segment/i)
    fireEvent.change(textarea, { target: { value: 'Updated transcript' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(screen.getByText('Updated transcript')).toBeInTheDocument()
  })

  it('discards changes when Cancel is clicked without calling save', () => {
    render(<TranscriptListHarness initialSegments={baseSegments} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const textarea = screen.getByLabelText(/edit transcript segment/i)
    fireEvent.change(textarea, { target: { value: 'Unsaved text' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByLabelText(/edit transcript segment/i)).not.toBeInTheDocument()
    expect(screen.getByText('Original transcript')).toBeInTheDocument()
  })

  it('shows validation feedback when the draft is empty', () => {
    render(<TranscriptListHarness initialSegments={baseSegments} />)

    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const textarea = screen.getByLabelText(/edit transcript segment/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(screen.getByText(/transcript text cannot be empty/i)).toBeInTheDocument()
  })

  it('shows an edited badge for segments flagged as edited', () => {
    render(
      <EditableTranscriptList
        segments={[{ ...baseSegments[0], isEdited: true, editedAt: '2026-07-15T12:00:00.000Z' }]}
        editingSegmentId={null}
        draftTranscriptText=""
        transcriptError=""
        isSavingTranscript={false}
        onEdit={jest.fn()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onDraftChange={jest.fn()}
      />
    )

    expect(screen.getAllByText(/edited/i).length).toBeGreaterThan(0)
  })
})
