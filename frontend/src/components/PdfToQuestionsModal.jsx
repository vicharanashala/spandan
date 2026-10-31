import React, { useState, useRef } from 'react'
import { FileUp, FileText, X, Check, Sparkles, Loader2, BookOpen, Layers, CheckCircle2 } from 'lucide-react'
import { Ico } from './icons'

function PdfToQuestionsModal({
  isOpen,
  onClose,
  onGenerate,
  roomSettings = {},
  isGenerating = false
}) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileBase64, setFileBase64] = useState(null)
  const [fileError, setFileError] = useState('')
  const [numQuestions, setNumQuestions] = useState(10) // default 10 as requested
  const [difficulty, setDifficulty] = useState(roomSettings.difficulty || 'medium')
  const [autoSaveDirectly, setAutoSaveDirectly] = useState(true) // saves directly to room question bank!
  const [isReadingFile, setIsReadingFile] = useState(false)
  const fileInputRef = useRef(null)

  if (!isOpen) return null

  const handleFileSelect = (file) => {
    setFileError('')
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.md')) {
      setFileError('Please select a valid PDF or text file (.pdf, .txt, .md).')
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      setFileError('File size exceeds 15MB limit. Please upload a smaller document.')
      return
    }

    setSelectedFile(file)
    setIsReadingFile(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      setFileBase64(e.target.result)
      setIsReadingFile(false)
    }
    reader.onerror = () => {
      setFileError('Failed to read the file. Please try again.')
      setIsReadingFile(false)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleStartGeneration = async () => {
    if (!fileBase64) {
      setFileError('Please upload a PDF document first.')
      return
    }

    await onGenerate({
      pdfBase64: fileBase64,
      fileName: selectedFile?.name || 'document.pdf',
      numQuestions,
      difficulty,
      autoSave: autoSaveDirectly
    })
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.72)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2100,
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        width: '560px',
        maxWidth: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.45)',
        border: '1px solid var(--border-color)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              <Ico as={FileUp} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Upload PDF to Generate Questions
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Upload class notes, syllabus, or lecture slides to automatically generate 10–15 quiz questions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)'
            }}
            aria-label="Close"
          >
            <Ico as={X} />
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !isGenerating && fileInputRef.current?.click()}
          style={{
            border: selectedFile ? '2px solid var(--accent)' : '2px dashed var(--border-color)',
            borderRadius: '14px',
            padding: '24px 20px',
            textAlign: 'center',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            background: selectedFile ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'var(--bg-primary)',
            transition: 'all 0.2s ease',
            marginBottom: '18px'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            disabled={isGenerating}
          />

          {selectedFile ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#dbeafe',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Ico as={FileText} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {selectedFile.name}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {formatFileSize(selectedFile.size)} • Click to change document
                </p>
              </div>
              <span style={{ marginLeft: 'auto', color: '#10b981', display: 'inline-flex' }}>
                <Ico as={CheckCircle2} />
              </span>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                <Ico as={FileUp} />
              </div>
              <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Click to browse or drag & drop PDF here
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Supports PDF notes, textbooks, slides, assignments (up to 15MB)
              </p>
            </div>
          )}
        </div>

        {fileError && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            fontSize: '13px',
            marginBottom: '16px'
          }}>
            {fileError}
          </div>
        )}

        {/* Number of Questions selector */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            <Ico as={Layers} /> Number of Questions to Generate:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[5, 10, 15, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setNumQuestions(num)}
                disabled={isGenerating}
                style={{
                  padding: '10px 8px',
                  borderRadius: '10px',
                  border: numQuestions === num ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                  background: numQuestions === num ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-primary)',
                  color: numQuestions === num ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: numQuestions === num ? '700' : '500',
                  fontSize: '13px',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                {num} Questions
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            Difficulty Level:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['easy', 'medium', 'hard'].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                disabled={isGenerating}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '8px',
                  border: difficulty === level ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                  background: difficulty === level ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-primary)',
                  color: difficulty === level ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  cursor: isGenerating ? 'not-allowed' : 'pointer'
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Direct Save Checkbox */}
        <div style={{
          marginBottom: '22px',
          padding: '12px 14px',
          borderRadius: '10px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer'
        }}
        onClick={() => setAutoSaveDirectly(!autoSaveDirectly)}
        >
          <input
            type="checkbox"
            checked={autoSaveDirectly}
            onChange={(e) => setAutoSaveDirectly(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          <div>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Add directly to room question bank
            </span>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Questions will immediately appear in your "Session Questions" list, ready to launch one by one.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStartGeneration}
          disabled={!selectedFile || isGenerating || isReadingFile}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: selectedFile && !isGenerating && !isReadingFile
              ? 'var(--accent-gradient)'
              : 'var(--border-color)',
            color: selectedFile && !isGenerating && !isReadingFile ? 'white' : 'var(--text-secondary)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: selectedFile && !isGenerating && !isReadingFile ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: selectedFile && !isGenerating ? '0 4px 14px rgba(37, 99, 235, 0.3)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          {isGenerating ? (
            <>
              <Ico as={Loader2} className="animate-spin" />
              <span>Analyzing Document & Generating {numQuestions} Questions...</span>
            </>
          ) : isReadingFile ? (
            <>
              <Ico as={Loader2} className="animate-spin" />
              <span>Reading PDF file...</span>
            </>
          ) : (
            <>
              <Ico as={Sparkles} />
              <span>Generate {numQuestions} Questions</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default PdfToQuestionsModal
