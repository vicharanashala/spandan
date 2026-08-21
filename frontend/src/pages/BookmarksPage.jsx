import React, { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useAuthStore from '../stores/authStore'
import useIsMobile from '../hooks/useIsMobile'
import { bookmarkApi } from '../lib/api.js'

export default function BookmarksPage() {
    const { user } = useAuthStore()
    const isMobile = useIsMobile()

    const [bookmarks, setBookmarks] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const loadBookmarks = async () => {
        try {
            setLoading(true)
            setError('')

            const data = await bookmarkApi.getAll()
            setBookmarks(data.bookmarks || [])
        } catch (err) {
            console.error('Failed to load bookmarks:', err)
            setError(err.message || 'Failed to load bookmarks')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadBookmarks()
    }, [])

    const removeBookmark = async (bookmarkId) => {
        try {
            await bookmarkApi.delete(bookmarkId)

            setBookmarks(prev =>
                prev.filter(bookmark => bookmark._id !== bookmarkId)
            )
        } catch (err) {
            console.error('Failed to remove bookmark:', err)
            alert(err.message || 'Failed to remove bookmark')
        }
    }

    return (
        <div
            style={{
                display: 'flex',
                minHeight: '100vh',
                background: 'var(--bg-primary)',
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
            }}
        >
            <Sidebar user={user} />

            <div
                style={{
                    flex: 1,
                    minWidth: 0,
                    marginLeft: 'var(--sidebar-width, 240px)'
                }}
            >
                {/* Header */}
                <header
                    style={{
                        background: 'var(--header-bg)',
                        color: 'white',
                        padding: isMobile ? '20px 16px' : '24px 32px',
                        paddingLeft: isMobile ? '64px' : '32px'
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px'
                        }}
                    >
                        <div>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: isMobile ? '22px' : '28px',
                                    fontWeight: 700
                                }}
                            >
                                🔖 My Bookmarks
                            </h1>

                            <p
                                style={{
                                    margin: '6px 0 0',
                                    opacity: 0.9,
                                    fontSize: '14px'
                                }}
                            >
                                Questions you saved for later
                            </p>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                            }}
                        >
                            <ThemeToggle />
                            <ProfileDropdown />
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main
                    style={{
                        padding: isMobile ? '16px' : '32px'
                    }}
                >
                    {loading && (
                        <div
                            style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '40px',
                                textAlign: 'center',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            Loading bookmarks...
                        </div>
                    )}

                    {error && !loading && (
                        <div
                            style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid #fecaca',
                                borderRadius: '12px',
                                padding: '20px',
                                color: '#dc2626'
                            }}
                        >
                            {error}
                        </div>
                    )}

                    {!loading && !error && bookmarks.length === 0 && (
                        <div
                            style={{
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '60px 20px',
                                textAlign: 'center'
                            }}
                        >
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                                🔖
                            </div>

                            <h2
                                style={{
                                    margin: '0 0 8px',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                No Saved Questions
                            </h2>

                            <p
                                style={{
                                    margin: 0,
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                Questions you bookmark during a session will appear here.
                            </p>
                        </div>
                    )}

                    {!loading && !error && bookmarks.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '20px'
                            }}
                        >
                            <div
                                style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '14px'
                                }}
                            >
                                {bookmarks.length} saved question
                                {bookmarks.length !== 1 ? 's' : ''}
                            </div>

                            {bookmarks.map((bookmark, index) => {
                                const question = bookmark.questionId
                                const room = bookmark.roomId

                                return (
                                    <div
                                        key={bookmark._id}
                                        style={{
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '12px',
                                            padding: isMobile ? '18px' : '24px'
                                        }}
                                    >
                                        {/* Top row */}
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                gap: '16px',
                                                marginBottom: '16px'
                                            }}
                                        >
                                            <div>
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '5px 10px',
                                                        borderRadius: '6px',
                                                        background: 'rgba(79, 70, 229, 0.15)',
                                                        color: 'var(--accent-color, #4f46e5)',
                                                        fontSize: '12px',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    {question?.type || 'Question'}
                                                </span>

                                                {room && (
                                                    <span
                                                        style={{
                                                            marginLeft: '8px',
                                                            color: 'var(--text-secondary)',
                                                            fontSize: '13px'
                                                        }}
                                                    >
                                                        Room: {room.name || room.code}
                                                    </span>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => removeBookmark(bookmark._id)}
                                                style={{
                                                    border: '1px solid #dc2626',
                                                    background: 'transparent',
                                                    color: '#dc2626',
                                                    borderRadius: '6px',
                                                    padding: '7px 12px',
                                                    cursor: 'pointer',
                                                    fontWeight: 600,
                                                    fontSize: '12px'
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>

                                        {/* Question */}
                                        <h2
                                            style={{
                                                margin: '0 0 20px',
                                                fontSize: isMobile ? '18px' : '21px',
                                                lineHeight: 1.5,
                                                color: 'var(--text-primary)'
                                            }}
                                        >
                                            {index + 1}. {question?.question || 'Question unavailable'}
                                        </h2>

                                        {/* Options */}
                                        {question?.options?.length > 0 && (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '10px'
                                                }}
                                            >
                                                {question.options.map((option, optionIndex) => (
                                                    <div
                                                        key={option._id || optionIndex}
                                                        style={{
                                                            padding: '12px 16px',
                                                            borderRadius: '8px',
                                                            background: 'var(--bg-primary)',
                                                            border: '1px solid var(--border-color)',
                                                            color: 'var(--text-primary)'
                                                        }}
                                                    >
                                                        <strong>
                                                            {String.fromCharCode(65 + optionIndex)}.
                                                        </strong>{' '}
                                                        {typeof option === 'string' ? option : option.text}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Explanation */}
                                        {question?.explanation && (
                                            <div
                                                style={{
                                                    marginTop: '18px',
                                                    padding: '14px 16px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(34, 197, 94, 0.08)',
                                                    border: '1px solid rgba(34, 197, 94, 0.25)'
                                                }}
                                            >
                                                <strong
                                                    style={{
                                                        color: 'var(--text-primary)'
                                                    }}
                                                >
                                                    Explanation
                                                </strong>

                                                <p
                                                    style={{
                                                        margin: '6px 0 0',
                                                        color: 'var(--text-secondary)',
                                                        lineHeight: 1.5
                                                    }}
                                                >
                                                    {question.explanation}
                                                </p>
                                            </div>
                                        )}

                                        {/* Note */}
                                        {bookmark.note && (
                                            <div
                                                style={{
                                                    marginTop: '14px',
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '14px'
                                                }}
                                            >
                                                📝 {bookmark.note}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}