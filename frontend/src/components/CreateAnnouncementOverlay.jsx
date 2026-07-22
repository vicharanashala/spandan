import React, { useState, useRef } from 'react'

function CreateAnnouncementOverlay({ isOpen, onClose, onLaunch }) {
    const [announcement, setAnnouncement] = useState('')
    const [file, setFile] = useState(null)
    const [dragActive, setDragActive] = useState(false)
    const fileInputRef = useRef(null)

    if (!isOpen) return null

    const handleDrag = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true)
        } else if (e.type === "dragleave") {
            setDragActive(false)
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0]
            if (droppedFile.name.endsWith('.csv')) {
                setFile(droppedFile)
            } else {
                alert('Only .csv files are allowed!')
            }
        }
    }

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0]
            if (selectedFile.name.endsWith('.csv')) {
                setFile(selectedFile)
            } else {
                alert('Only .csv files are allowed!')
            }
        }
    }

    const handleRemoveFile = (e) => {
        e.stopPropagation()
        setFile(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleLaunch = () => {
        if (!announcement.trim()) {
            alert('Please enter an announcement')
            return
        }

        const finalizeLaunch = (emailsList = [], name = null) => {
            onLaunch({
                announcement: announcement.trim(),
                emails: emailsList,
                fileName: name
            })
            // Clear states and close
            setAnnouncement('')
            setFile(null)
            onClose()
        }

        if (file) {
            const reader = new FileReader()
            reader.onload = (e) => {
                const text = e.target.result || ''
                // Match emails case-insensitively
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
                const matchedEmails = text.match(emailRegex) || []
                // Deduplicate and trim
                const uniqueEmails = Array.from(new Set(matchedEmails.map(email => email.trim().toLowerCase())))
                console.log('Parsed emails from CSV:', uniqueEmails)
                finalizeLaunch(uniqueEmails, file.name)
            }
            reader.onerror = () => {
                alert('Failed to read CSV file!')
            }
            reader.readAsText(file)
        } else {
            finalizeLaunch([], null)
        }
    }

    return (
        <div style={styles.overlay}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title}>📢 Create Announcement</h2>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>

                {/* Announcement Input */}
                <div style={styles.fieldContainer}>
                    <label style={styles.label}>announcement</label>
                    <textarea
                        value={announcement}
                        onChange={(e) => setAnnouncement(e.target.value)}
                        placeholder="Type your announcement here..."
                        rows={4}
                        style={styles.textarea}
                    />
                </div>

                {/* File Upload Field */}
                <div style={styles.fieldContainer}>
                    <label style={styles.label}>Upload CSV File</label>
                    <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current.click()}
                        style={{
                            ...styles.dropZone,
                            borderColor: dragActive ? '#3b82f6' : 'var(--border-color)',
                            backgroundColor: dragActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-primary)'
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />
                        {!file ? (
                            <div style={styles.dropZoneContent}>
                                <span style={{ fontSize: '24px' }}>📄</span>
                                <span style={styles.dropZoneText}>
                                    Drag & drop your <strong>.csv</strong> file here, or click to browse
                                </span>
                            </div>
                        ) : (
                            <div style={styles.selectedFileContainer} onClick={(e) => e.stopPropagation()}>
                                <div style={styles.fileDetails}>
                                    <span style={{ fontSize: '20px' }}>📊</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div style={styles.fileName}>{file.name}</div>
                                        <div style={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                </div>
                                <button onClick={handleRemoveFile} style={styles.removeFileBtn} title="Remove file">
                                    ✕ Remove
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Launch Button */}
                <button
                    onClick={handleLaunch}
                    disabled={!announcement.trim()}
                    style={{
                        ...styles.launchBtn,
                        opacity: announcement.trim() ? 1 : 0.6,
                        cursor: announcement.trim() ? 'pointer' : 'not-allowed'
                    }}
                >
                    🚀 Launch Announcement
                </button>
            </div>
        </div>
    )
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
    },
    card: {
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        width: '560px',
        maxHeight: '85vh',
        overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border-color)'
    },
    title: {
        margin: 0,
        fontSize: '18px',
        fontWeight: '600',
        color: '#3b82f6'
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        fontSize: '20px',
        cursor: 'pointer',
        color: 'var(--text-secondary)'
    },
    fieldContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    label: {
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--text-primary)',
        textTransform: 'none'
    },
    textarea: {
        width: '100%',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontSize: '14px',
        resize: 'vertical',
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 0.2s'
    },
    dropZone: {
        border: '2px dashed var(--border-color)',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out'
    },
    dropZoneContent: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-secondary)'
    },
    dropZoneText: {
        fontSize: '13px',
        lineHeight: '1.4'
    },
    selectedFileContainer: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '8px',
        textAlign: 'left'
    },
    fileDetails: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: 'var(--text-primary)'
    },
    fileName: {
        fontSize: '13px',
        fontWeight: '600',
        wordBreak: 'break-all'
    },
    fileSize: {
        fontSize: '11px',
        color: 'var(--text-secondary)'
    },
    removeFileBtn: {
        padding: '6px 12px',
        background: '#ef444415',
        color: '#ef4444',
        border: '1px solid #ef444430',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'background 0.2s'
    },
    launchBtn: {
        width: '100%',
        padding: '14px',
        borderRadius: '12px',
        border: 'none',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: 'white',
        fontSize: '14px',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s'
    }
}

export default CreateAnnouncementOverlay