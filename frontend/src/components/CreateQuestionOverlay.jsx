import React, { useState, useEffect, useRef } from 'react'

function CreateQuestionOverlay({ isOpen, onClose, onLaunch, defaultType = 'MCQ' }) {
  const [questionType, setQuestionType] = useState(defaultType)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false }
  ])
  const [timeToAnswer, setTimeToAnswer] = useState(30)
  const [points, setPoints] = useState(100)

  // Launched state - once teacher launches, show timer mode
  const [isLaunched, setIsLaunched] = useState(false)
  const [launchedTimeLeft, setLaunchedTimeLeft] = useState(0)
  const launchedTimerRef = useRef(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (launchedTimerRef.current) {
        clearInterval(launchedTimerRef.current)
        launchedTimerRef.current = null
      }
    }
  }, [])

  if (!isOpen) return null

  const handleTypeChange = (newType) => {
    setQuestionType(newType)
    if (newType === 'TF') {
      setOptions([
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false }
      ])
    } else if (newType === 'MCQ') {
      setOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false }
      ])
    } else {
      // MSQ - at least 2 correct by default
      setOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false }
      ])
    }
  }

  const handleOptionChange = (index, text) => {
    const newOptions = [...options]
    newOptions[index].text = text
    setOptions(newOptions)
  }

  const handleCorrectChange = (index) => {
    if (questionType === 'TF') {
      setOptions([
        { text: 'True', isCorrect: index === 0 },
        { text: 'False', isCorrect: index === 1 }
      ])
    } else if (questionType === 'MSQ') {
      const newOptions = options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index ? !options[index].isCorrect : opt.isCorrect
      }))
      setOptions(newOptions)
    } else {
      // MCQ - single correct
      const newOptions = options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index
      }))
      setOptions(newOptions)
    }
  }

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, { text: '', isCorrect: false }])
    }
  }

  const removeOption = (index) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index)
      setOptions(newOptions)
    }
  }

  const handleLaunch = () => {
    if (!question.trim()) {
      alert('Please enter a question')
      return
    }

    const filledOptions = options.filter(o => o.text.trim())
    if (filledOptions.length < 2) {
      alert('Please enter at least 2 options')
      return
    }

    // First, emit the question to students via onLaunch
    onLaunch({
      type: questionType,
      question: question.trim(),
      options: questionType === 'TF' 
        ? [{ text: 'True', isCorrect: options[0].isCorrect }, { text: 'False', isCorrect: options[1].isCorrect }]
        : options.filter(o => o.text.trim()),
      timeToAnswer,
      points
    })

    // Start launched timer - question is now live
    setIsLaunched(true)
    setLaunchedTimeLeft(timeToAnswer)
    
    launchedTimerRef.current = setInterval(() => {
      setLaunchedTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(launchedTimerRef.current)
          launchedTimerRef.current = null
          // Auto-close when timer hits 0
          setTimeout(() => {
            handleCloseAndReset()
          }, 500)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleCloseAndReset = () => {
    if (launchedTimerRef.current) {
      clearInterval(launchedTimerRef.current)
      launchedTimerRef.current = null
    }
    setIsLaunched(false)
    setLaunchedTimeLeft(0)
    // Reset form
    setQuestion('')
    setOptions([
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ])
    setTimeToAnswer(30)
    setPoints(100)
    onClose()
  }

  const handleManualClose = () => {
    if (launchedTimerRef.current) {
      clearInterval(launchedTimerRef.current)
      launchedTimerRef.current = null
    }
    handleCloseAndReset()
  }

  const getOptionLabel = (index) => String.fromCharCode(65 + index)

  return (
    <div style={{
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
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        width: '560px',
        maxHeight: '85vh',
        overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#3b82f6' }}>
              ✍️ Create Question
            </h2>
            {isLaunched && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: launchedTimeLeft <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `2px solid ${launchedTimeLeft <= 5 ? '#ef4444' : '#10b981'}`
              }}>
                <span style={{ fontSize: '14px', color: launchedTimeLeft <= 5 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                  {launchedTimeLeft <= 5 ? '⏱️ TIME! ' : '⏱️ ' }{launchedTimeLeft}s
                </span>
                {launchedTimeLeft <= 5 && (
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', animation: 'pulse 0.5s infinite' }}>
                    LEFT
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={isLaunched ? handleManualClose : onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Question Type */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            Question Type
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['MCQ', 'TF', 'MSQ'].map(type => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: questionType === type ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                  background: questionType === type ? '#dbeafe' : 'transparent',
                  color: questionType === type ? '#1e40af' : 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {type === 'MCQ' && 'Single Answer'}
                {type === 'TF' && 'True/False'}
                {type === 'MSQ' && 'Multi Answer'}
              </button>
            ))}
          </div>
        </div>

        {/* Question Text */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            Question
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter your question here..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
        </div>

        {/* Options */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            Options 
            {questionType === 'TF' && '(Select correct answer)'}
            {questionType === 'MSQ' && '(Select all correct answers)'}
            {questionType === 'MCQ' && '(Select one correct answer)'}
            {questionType !== 'TF' && (
              <button
                onClick={addOption}
                style={{
                  marginLeft: '8px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  background: '#3b82f620',
                  color: '#3b82f6',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                + Add Option
              </button>
            )}
          </label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {options.map((opt, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {questionType !== 'TF' ? (
                  <>
                    <button
                      onClick={() => handleCorrectChange(index)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: opt.isCorrect ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                        background: opt.isCorrect ? '#dbeafe' : 'var(--bg-primary)',
                        color: opt.isCorrect ? '#3b82f6' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {getOptionLabel(index)}
                    </button>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Option ${getOptionLabel(index)}`}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: opt.isCorrect ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '13px'
                      }}
                    />
                    {opt.isCorrect && (
                      <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '500' }}>✓</span>
                    )}
                    {options.length > 2 && (
                      <button
                        onClick={() => removeOption(index)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  // True/False layout
                  <>
                    <button
                      onClick={() => handleCorrectChange(index)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: opt.isCorrect ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                        background: opt.isCorrect ? '#dbeafe' : 'var(--bg-primary)',
                        color: opt.isCorrect ? '#3b82f6' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {getOptionLabel(index)}
                    </button>
                    <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>
                      {opt.text}
                    </span>
                    {opt.isCorrect && (
                      <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '500' }}>✓ Correct</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Time and Points Row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
              Time to Answer (TTA)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setTimeToAnswer(Math.max(5, timeToAnswer - 5))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                −
              </button>
              <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '50px', textAlign: 'center' }}>
                {timeToAnswer}s
              </span>
              <button
                onClick={() => setTimeToAnswer(Math.min(300, timeToAnswer + 5))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
              Points
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setPoints(Math.max(1, points - 10))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                −
              </button>
              <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '50px', textAlign: 'center' }}>
                {points}
              </span>
              <button
                onClick={() => setPoints(Math.min(1000, points + 10))}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Launch Button */}
        <button
          onClick={handleLaunch}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          🚀 Launch Question
        </button>
      </div>
    </div>
  )
}

export default CreateQuestionOverlay