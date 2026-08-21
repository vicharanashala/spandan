import React, { useEffect, useState } from 'react'
import { bookmarkApi } from '../lib/api.js'

export default function StudentBookmarks() {
    const [bookmarks, setBookmarks] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const loadBookmarks = async () => {
            try {
                const data = await bookmarkApi.getAll()
                setBookmarks(data.bookmarks || [])
            } catch (err) {
                console.error('Failed to load bookmarks:', err)
                setError(err.message || 'Failed to load saved questions')
            } finally {
                setLoading(false)
            }
        }

        loadBookmarks()
    }, [])

    const handleDelete = async (bookmarkId) => {
        try {
            await bookmarkApi.delete(bookmarkId)

            setBookmarks(prev =>
                prev.filter(bookmark => bookmark._id !== bookmarkId)
            )
        } catch (err) {
            console.error('Failed to remove bookmark:', err)
            setError(err.message || 'Failed to remove bookmark')
        }
    }

    const handleNoteSave = async (bookmarkId, note) => {
        try {
            const data = await bookmarkApi.update(
                bookmarkId,
                note
            )

            setBookmarks(prev =>
                prev.map(bookmark =>
                    bookmark._id === bookmarkId
                        ? data.bookmark
                        : bookmark
                )
            )
        } catch (err) {
            console.error('Failed to save note:', err)
            setError(err.message || 'Failed to save note')
        }
    }

    if (loading) {
        return (
            <div style={{ padding: '32px' }}>
                Loading saved questions...
            </div>
        )
    }

    return (
        <div style={{ padding: '32px' }}>
            <h1>🔖 My Saved Questions</h1>

            {error && (
                <div
                    style={{
                        padding: '12px',
                        marginBottom: '20px',
                        borderRadius: '8px',
                        background: '#fee2e2',
                        color: '#991b1b'
                    }}
                >
                    {error}
                </div>
            )}

            {bookmarks.length === 0 ? (
                <p>
                    You haven't saved any questions yet.
                </p>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gap: '20px',
                        marginTop: '24px'
                    }}
                >
                    {bookmarks.map(bookmark => {
                        const question = bookmark.questionId
                        const room = bookmark.roomId

                        return (
                            <div
                                key={bookmark._id}
                                style={{
                                    padding: '24px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--card-bg)'
                                }}
                            >
                                <div
                                    style={{
                                        marginBottom: '12px',
                                        fontSize: '13px',
                                        opacity: 0.7
                                    }}
                                >
                                    {room?.code
                                        ? `Room: ${room.code}`
                                        : 'Saved Question'}
                                </div>

                                <h2>
                                    {question?.question || 'Question unavailable'}
                                </h2>

                                {question?.options?.length > 0 && (
                                    <ol>
                                        {question.options.map(
                                            (option, index) => {
                                                const text =
                                                    typeof option === 'string'
                                                        ? option
                                                        : option.text

                                                return (
                                                    <li key={index}>
                                                        {text}
                                                    </li>
                                                )
                                            }
                                        )}
                                    </ol>
                                )}

                                <div style={{ marginTop: '20px' }}>
                                    <label>
                                        <strong>My Note</strong>

                                        <textarea
                                            defaultValue={bookmark.note || ''}
                                            maxLength={1000}
                                            placeholder="Add a note for later revision..."
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                minHeight: '80px',
                                                marginTop: '8px',
                                                padding: '10px',
                                                boxSizing: 'border-box'
                                            }}
                                            onBlur={(event) =>
                                                handleNoteSave(
                                                    bookmark._id,
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleDelete(bookmark._id)
                                    }
                                    style={{ marginTop: '16px' }}
                                >
                                    Remove Bookmark
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}