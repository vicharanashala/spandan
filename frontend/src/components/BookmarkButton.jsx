import { useState } from 'react'
import { bookmarkApi } from '../lib/api.js'

export default function BookmarkButton({
    questionId,
    bookmark = null,
    onChange
}) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleClick = async () => {
        if (loading) return

        setLoading(true)
        setError('')

        try {
            if (bookmark) {
                await bookmarkApi.delete(bookmark._id)

                if (onChange) {
                    onChange(null)
                }
            } else {
                const result = await bookmarkApi.create(questionId)

                if (onChange) {
                    onChange(result.bookmark)
                }
            }
        } catch (err) {
            console.error('Bookmark error:', err)
            setError(err.message || 'Failed to update bookmark')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <button
                type="button"
                onClick={handleClick}
                disabled={loading}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: bookmark
                        ? '2px solid #16a34a'
                        : '2px solid var(--border-color)',
                    background: bookmark
                        ? 'rgba(34, 197, 94, 0.12)'
                        : 'var(--bg-secondary)',
                    color: bookmark
                        ? '#16a34a'
                        : 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: bookmark
                        ? '0 0 12px rgba(34, 197, 94, 0.25)'
                        : '0 2px 6px rgba(0, 0, 0, 0.08)',
                    opacity: loading ? 0.7 : 1
                }}
            >
                <span
                    style={{
                        fontSize: '20px',
                        lineHeight: 1,
                        transform: bookmark ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.2s ease'
                    }}
                >
                    🔖
                </span>

                <span>
                    {loading
                        ? 'Saving...'
                        : bookmark
                            ? 'Bookmarked'
                            : 'Save Question'}
                </span>
            </button>

            {error && (
                <small role="alert">
                    {error}
                </small>
            )}
        </div>
    )
}