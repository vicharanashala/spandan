import React, { useState, useRef } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

const ALLOWED_TYPES = [
  'application/pdf', 
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg'
]
const ALLOWED_EXTENSIONS = '.pdf,.txt,.docx,.png,.jpeg,.jpg'

function UploadContentPopup({ isOpen, onClose, onContentExtracted }) {
  const token = useAuthStore(s => s.token)
  const fileInputRef = useRef(null)

  const [files, setFiles] = useState([])
  const [urls, setUrls] = useState([])
  const [urlInput, setUrlInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [errors, setErrors] = useState([])
  const [step, setStep] = useState('upload') // 'upload' | 'review'

  if (!isOpen) return null

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || [])
    
    // Type validation
    const validTypes = selected.filter(f => ALLOWED_TYPES.includes(f.type) || f.name.match(/\.(pdf|txt|docx|png|jpe?g)$/i))
    if (validTypes.length !== selected.length) {
      setErrors(prev => [...prev, 'Some files were skipped (only PDF, TXT, DOCX, and Images supported)'])
    }

    // Size validation (Max 10MB, Min 1 byte)
    const validSize = validTypes.filter(f => {
      if (f.size === 0) {
        setErrors(prev => [...prev, `Skipped empty file: ${f.name}`])
        return false
      }
      if (f.size > 10 * 1024 * 1024) {
        setErrors(prev => [...prev, `Skipped large file: ${f.name} (Max 10MB)`])
        return false
      }
      return true
    })

    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      const newFiles = validSize.filter(f => !existing.has(f.name))
      if (prev.length + newFiles.length > 5) {
        setErrors(prev => [...prev, 'Maximum 5 files allowed. Extra files were ignored.'])
      }
      return [...prev, ...newFiles].slice(0, 5)
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (name) => setFiles(prev => prev.filter(f => f.name !== name))

  const addUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    try {
      new URL(url)
      if (urls.includes(url)) return
      setUrls(prev => [...prev, url].slice(0, 10))
      setUrlInput('')
    } catch {
      setErrors(prev => [...prev, `Invalid URL: ${url}`])
    }
  }

  const removeUrl = (url) => setUrls(prev => prev.filter(u => u !== url))

  const handleExtract = async () => {
    if (!files.length && !urls.length) return

    setIsExtracting(true)
    setErrors([])

    try {
      // Read files as base64
      const fileData = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]
          resolve({ name: file.name, mimeType: file.type || 'application/pdf', data: base64 })
        }
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
        reader.readAsDataURL(file)
      })))

      const response = await fetch(`${API_URL}/questions/extract-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ files: fileData, urls })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Extraction failed')
      }

      if (data.errors?.length) {
        setErrors(data.errors.map(e => `${e.file}: ${e.error}`))
      }

      if (data.combinedText) {
        setExtractedText(data.combinedText)
        setStep('review')
      } else {
        setErrors(prev => [...prev, 'No content could be extracted from the provided files or URLs.'])
      }
    } catch (error) {
      setErrors(prev => [error.message])
    } finally {
      setIsExtracting(false)
    }
  }

  const handleUseContent = () => {
    onContentExtracted(extractedText)
    handleReset()
    onClose()
  }

  const handleReset = () => {
    setFiles([])
    setUrls([])
    setUrlInput('')
    setExtractedText('')
    setErrors([])
    setStep('upload')
  }

  const chars = extractedText.length

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '20px', padding: '24px',
        width: '600px', maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '20px', paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>📎</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {step === 'review' ? 'Review Extracted Content' : 'Upload Files & Links'}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {step === 'review' ? 'Review and use the extracted content for question generation' : 'Add PDFs, text files, or URLs to generate questions from'}
              </p>
            </div>
          </div>
          <button onClick={() => { handleReset(); onClose() }}
            style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            ✕
          </button>
        </div>

        {step === 'upload' ? (
          <>
            {/* File Upload */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                Upload Files (PDF, TXT, DOCX, Images)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-color)', borderRadius: '12px',
                  padding: '32px', textAlign: 'center', cursor: 'pointer',
                  background: 'var(--bg-primary)', transition: 'border-color 0.2s'
                }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6' }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)' }}
                onDrop={(e) => { e.preventDefault(); handleFileSelect({ target: { files: e.dataTransfer.files } }) }}
              >
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>📄</span>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Drag & drop files here, or <span style={{ color: '#3b82f6', fontWeight: '600' }}>browse</span>
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  PDF, TXT, DOCX, Images (max 10MB each, up to 5 files)
                </p>
              </div>
              <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS} multiple
                onChange={handleFileSelect} style={{ display: 'none' }} />

              {/* File List */}
              {files.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  {files.map(file => (
                    <div key={file.name} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)', marginBottom: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{file.name.endsWith('.pdf') ? '📕' : '📄'}</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{file.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          ({(file.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      <button onClick={() => removeFile(file.name)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* URL Input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                Add Related Links
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url" value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                  placeholder="https://example.com/article"
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: '10px',
                    border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                    color: 'var(--text-primary)', fontSize: '14px'
                  }}
                />
                <button onClick={addUrl}
                  style={{
                    padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: urlInput.trim() ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--border-color)',
                    color: urlInput.trim() ? 'white' : 'var(--text-secondary)',
                    fontSize: '13px', fontWeight: '600', cursor: urlInput.trim() ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap'
                  }} disabled={!urlInput.trim()}>
                  Add Link
                </button>
              </div>

              {/* URL List */}
              {urls.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  {urls.map(url => (
                    <div key={url} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)', marginBottom: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '16px' }}>🔗</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                          {url}
                        </span>
                      </div>
                      <button onClick={() => removeUrl(url)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px', padding: '12px', marginBottom: '16px'
              }}>
                {errors.map((err, i) => (
                  <p key={i} style={{ margin: '2px 0', fontSize: '13px', color: '#ef4444' }}>{err}</p>
                ))}
              </div>
            )}

            {/* Extract Button */}
            <button onClick={handleExtract}
              disabled={isExtracting || (!files.length && !urls.length)}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: (files.length || urls.length) && !isExtracting
                  ? 'linear-gradient(135deg, #3b82f6, #1e40af)' : 'var(--border-color)',
                color: (files.length || urls.length) && !isExtracting ? 'white' : 'var(--text-secondary)',
                fontSize: '14px', fontWeight: '600',
                cursor: (files.length || urls.length) && !isExtracting ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}>
              {isExtracting ? (
                <><span>⏳</span><span>Extracting Content...</span></>
              ) : (
                <><span>🔍</span><span>Extract Content</span></>
              )}
            </button>
          </>
        ) : (
          <>
            {/* Review Step */}
            <div style={{
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '10px', padding: '12px', marginBottom: '16px'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#10b981' }}>
                ✓ Extracted {files.length} file(s) and {urls.length} URL(s) — {chars.toLocaleString()} characters
              </p>
            </div>

            {errors.length > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px', padding: '12px', marginBottom: '16px'
              }}>
                {errors.map((err, i) => (
                  <p key={i} style={{ margin: '2px 0', fontSize: '13px', color: '#ef4444' }}>{err}</p>
                ))}
              </div>
            )}

            <textarea readOnly value={extractedText}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'monospace',
                resize: 'vertical', minHeight: '250px', lineHeight: '1.5',
                marginBottom: '16px', boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('upload')}
                style={{
                  flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-primary)',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                }}>
                ← Back
              </button>
              <button onClick={handleUseContent}
                style={{
                  flex: 2, padding: '14px', borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                ✓ Use for Question Generation
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default UploadContentPopup
