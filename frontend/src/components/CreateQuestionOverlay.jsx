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
  const [correctPoints, setCorrectPoints] = useState(10)
  const [incorrectPoints, setIncorrectPoints] = useState(0)
  const [imageUrl, setImageUrl] = useState('')
  const [matrixRows, setMatrixRows] = useState(['Row 1', 'Row 2'])
  const [matrixColumns, setMatrixColumns] = useState(['Col 1', 'Col 2'])
  const [categories, setCategories] = useState(['Category 1', 'Category 2'])
  const [subQuestions, setSubQuestions] = useState([])

  // Launched state - once teacher launches, show timer mode
  const [isLaunched, setIsLaunched] = useState(false)
  const [launchedTimeLeft, setLaunchedTimeLeft] = useState(0)
  const launchedTimerRef = useRef(null)

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
    } else if (newType === 'MATRIX') {
      setOptions([])
    } else {
      // MSQ, RANKING, CATEGORIZATION - at least 2 default options
      setOptions([
        { text: '', isCorrect: true, categoryId: 0 },
        { text: '', isCorrect: true, categoryId: 1 },
        { text: '', isCorrect: false, categoryId: 0 },
        { text: '', isCorrect: false, categoryId: 1 }
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
        : (questionType === 'MATRIX' ? [] : options.filter(o => o.text.trim())),
      timeToAnswer,
      correctPoints,
      incorrectPoints,
      imageUrl,
      matrixRows: questionType === 'MATRIX' ? matrixRows.filter(r => r.trim()) : [],
      matrixColumns: questionType === 'MATRIX' ? matrixColumns.filter(c => c.trim()) : [],
      categories: questionType === 'CATEGORIZATION' ? categories.filter(c => c.trim()) : [],
      subQuestions
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
    setCorrectPoints(10)
    setIncorrectPoints(0)
    setImageUrl('')
    setMatrixRows(['Row 1', 'Row 2'])
    setMatrixColumns(['Col 1', 'Col 2'])
    setCategories(['Category 1', 'Category 2'])
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
                background: launchedTimeLeft <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(10, 185, 129, 0.15)',
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
            {['MCQ', 'TF', 'MSQ', 'RANKING', 'MATRIX', 'CATEGORIZATION'].map(type => (
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
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {type === 'MCQ' && 'Single'}
                {type === 'TF' && 'True/False'}
                {type === 'MSQ' && 'Multi'}
                {type === 'RANKING' && 'Ranking'}
                {type === 'MATRIX' && 'Matrix'}
                {type === 'CATEGORIZATION' && 'Category'}
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
              fontFamily: 'inherit',
              marginBottom: '8px'
            }}
          />
          {/* Image Upload Area */}
          <div 
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => setImageUrl(ev.target.result);
                reader.readAsDataURL(file);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onPaste={(e) => {
              const items = (e.clipboardData || e.originalEvent.clipboardData).items;
              for (let index in items) {
                const item = items[index];
                if (item.kind === 'file') {
                  const blob = item.getAsFile();
                  const reader = new FileReader();
                  reader.onload = (ev) => setImageUrl(ev.target.result);
                  reader.readAsDataURL(blob);
                }
              }
            }}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '8px',
              border: '2px dashed var(--border-color)',
              background: 'var(--bg-secondary)',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={() => document.getElementById('image-upload-input').click()}
          >
            <input 
              id="image-upload-input"
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setImageUrl(ev.target.result);
                  reader.readAsDataURL(file);
                }
              }}
            />
            {imageUrl ? (
              <img src={imageUrl.startsWith('data:image') || imageUrl.startsWith('http') ? imageUrl : ''} alt="Preview" style={{ maxHeight: '100px', borderRadius: '4px' }} />
            ) : (
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Drag & drop an image, paste it, or click to browse</span>
            )}
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Or paste an Image URL here"
              onClick={(e) => e.stopPropagation()} // Prevent triggering file dialog when clicking input
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '12px'
              }}
            />
          </div>
        </div>

        {/* Options */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
            Options 
            {questionType === 'TF' && '(Select correct answer)'}
            {questionType === 'MSQ' && '(Select all correct answers)'}
            {questionType === 'MCQ' && '(Select one correct answer)'}
            {questionType === 'RANKING' && '(List options in the correct order)'}
            {questionType === 'CATEGORIZATION' && '(Assign categories to options)'}
            {questionType !== 'TF' && questionType !== 'MATRIX' && (
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
              <React.Fragment key={index}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {questionType !== 'TF' ? (
                    <>
                      {questionType !== 'RANKING' && questionType !== 'CATEGORIZATION' && (
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
                      )}
                      
                      {questionType === 'RANKING' && (
                        <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                          {index + 1}.
                        </div>
                      )}

                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        placeholder={`Option ${getOptionLabel(index)}`}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: opt.isCorrect && questionType !== 'RANKING' && questionType !== 'CATEGORIZATION' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '13px'
                        }}
                      />
                      
                      {questionType === 'CATEGORIZATION' && (
                        <select
                          value={opt.categoryId || 0}
                          onChange={(e) => {
                            const newOptions = [...options];
                            newOptions[index].categoryId = parseInt(e.target.value);
                            setOptions(newOptions);
                          }}
                          style={{
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '12px'
                          }}
                        >
                          {categories.map((c, cIdx) => (
                            <option key={cIdx} value={cIdx}>{c || `Category ${cIdx + 1}`}</option>
                          ))}
                        </select>
                      )}

                      {opt.isCorrect && questionType !== 'RANKING' && questionType !== 'CATEGORIZATION' && (
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
                    // True/False
                    <>
                      <button
                        onClick={() => handleCorrectChange(index)}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          border: opt.isCorrect ? '2px solid #10b981' : '1px solid var(--border-color)',
                          background: opt.isCorrect ? '#d1fae5' : 'var(--bg-primary)',
                          color: opt.isCorrect ? '#10b981' : 'var(--text-secondary)',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {opt.text}
                      </button>
                    </>
                  )}
                </div>

                {/* Conditional Sub-question Form for MCQ */}
                {questionType === 'MCQ' && (
                  <div style={{ marginLeft: '40px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                    {subQuestions.find(sq => sq.dependsOnOptionIndex === index) ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#8b5cf6' }}>↳ Sub-question if selected</span>
                          <button onClick={() => setSubQuestions(subQuestions.filter(sq => sq.dependsOnOptionIndex !== index))} style={{ fontSize: '10px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>Remove</button>
                        </div>
                        <input
                          type="text"
                          placeholder="Follow-up question..."
                          value={subQuestions.find(sq => sq.dependsOnOptionIndex === index).question}
                          onChange={(e) => {
                            setSubQuestions(prev => prev.map(sq => sq.dependsOnOptionIndex === index ? { ...sq, question: e.target.value } : sq))
                          }}
                          style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', marginBottom: '4px' }}
                        />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {subQuestions.find(sq => sq.dependsOnOptionIndex === index).options.map((sOpt, sIdx) => (
                            <input
                              key={sIdx}
                              type="text"
                              placeholder={`Opt ${sIdx + 1}`}
                              value={sOpt.text}
                              onChange={(e) => {
                                setSubQuestions(prev => prev.map(sq => {
                                  if (sq.dependsOnOptionIndex === index) {
                                    const newOpts = [...sq.options]
                                    newOpts[sIdx].text = e.target.value
                                    return { ...sq, options: newOpts }
                                  }
                                  return sq
                                }))
                              }}
                              style={{ flex: 1, padding: '4px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSubQuestions([...subQuestions, { dependsOnOptionIndex: index, question: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] }])}
                        style={{ fontSize: '11px', color: '#8b5cf6', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0' }}
                      >
                        + Add Conditional Sub-question
                      </button>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Additional configuration for advanced types */}
        {questionType === 'CATEGORIZATION' && (
          <div style={{ marginBottom: '16px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
              Categories
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categories.map((cat, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={cat} onChange={(e) => {
                    const newCat = [...categories];
                    newCat[idx] = e.target.value;
                    setCategories(newCat);
                  }} placeholder={`Category ${idx + 1}`} style={{ flex: 1, padding: '8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                  {categories.length > 2 && (
                    <button onClick={() => setCategories(categories.filter((_, i) => i !== idx))} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setCategories([...categories, ''])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'left', marginTop: '4px' }}>+ Add Category</button>
            </div>
          </div>
        )}

        {questionType === 'MATRIX' && (
          <div style={{ marginBottom: '16px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>Rows</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {matrixRows.map((row, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={row} onChange={(e) => {
                      const newRows = [...matrixRows];
                      newRows[idx] = e.target.value;
                      setMatrixRows(newRows);
                    }} placeholder={`Row ${idx + 1}`} style={{ flex: 1, padding: '8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                    {matrixRows.length > 1 && <button onClick={() => setMatrixRows(matrixRows.filter((_, i) => i !== idx))} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>}
                  </div>
                ))}
                <button onClick={() => setMatrixRows([...matrixRows, ''])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>+ Add Row</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>Columns</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {matrixColumns.map((col, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={col} onChange={(e) => {
                      const newCols = [...matrixColumns];
                      newCols[idx] = e.target.value;
                      setMatrixColumns(newCols);
                    }} placeholder={`Column ${idx + 1}`} style={{ flex: 1, padding: '8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                    {matrixColumns.length > 1 && <button onClick={() => setMatrixColumns(matrixColumns.filter((_, i) => i !== idx))} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>}
                  </div>
                ))}
                <button onClick={() => setMatrixColumns([...matrixColumns, ''])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>+ Add Column</button>
              </div>
            </div>
          </div>
        )}

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
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#10b981', display: 'block', marginBottom: '8px' }}>
              + Points (Correct)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCorrectPoints(Math.max(1, correctPoints - 10))}
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
              <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>
                {correctPoints}
              </span>
              <button
                onClick={() => setCorrectPoints(Math.min(1000, correctPoints + 10))}
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
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#ef4444', display: 'block', marginBottom: '8px' }}>
              - Points (Wrong)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setIncorrectPoints(Math.max(0, incorrectPoints - 5))}
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
              <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', minWidth: '40px', textAlign: 'center' }}>
                {incorrectPoints}
              </span>
              <button
                onClick={() => setIncorrectPoints(Math.min(1000, incorrectPoints + 5))}
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