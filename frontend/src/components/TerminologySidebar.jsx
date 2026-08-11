import { useState, useEffect } from 'react'
import mermaid from '../lib/mermaid'   // [C1] shared singleton — never double-initialize
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

/**
 * TerminologySidebar — shows a live-growing list of detected lecture terms.
 *
 * Design (locked with the team):
 *  1. Term NAMES appear as soon as they're detected — free, no AI call, just
 *     whatever the detection step already found.
 *  2. Clicking a term lazily fetches its definition + recommended study
 *     material in ONE call (only when the student is actually curious).
 *  3. A "Generate Mindmap" button inside the expanded term lazily fetches a
 *     small mindmap for JUST that term — a second, separate, optional call.
 *
 * Props:
 *  - roomId: string
 *  - socket: the shared socket.io client instance (same one used elsewhere on the page)
 *
 * NOTE: This is the frontend shell. It expects three backend endpoints that
 * we'll build in the next phases:
 *   GET  /api/terminology/room/:roomId          -> { terms: [{ term, _id }] }
 *   GET  /api/terminology/:termId/details        -> { definition, studyMaterial: [...] }
 *   GET  /api/terminology/:termId/mindmap        -> { mermaidCode }
 * and a socket event 'terminology_update' -> { term, _id } pushed as new terms
 * are detected live, matching the existing 'mindmap_shared' pattern.
 */
const TerminologySidebar = ({ roomId, socket }) => {
  const [terms, setTerms] = useState([])
  const [isLoadingTerms, setIsLoadingTerms] = useState(true)  // [L3] initial fetch loading state
  const [expandedId, setExpandedId] = useState(null)
  const [detailsCache, setDetailsCache] = useState({})   // termId -> { definition, studyMaterial }
  const [mindmapCache, setMindmapCache] = useState({})   // termId -> mermaidCode (or 'loading')
  // [M4] Use Set instead of single ID — multiple terms can be loading concurrently
  const [loadingDetailsIds, setLoadingDetailsIds] = useState(new Set())
  const [loadingMindmapIds, setLoadingMindmapIds] = useState(new Set())
  const [mindmapSvg, setMindmapSvg] = useState({})       // termId -> rendered svg string
  const [mindmapError, setMindmapError] = useState({})   // termId -> error message string

  // Load any terms already detected so far in this room (e.g. on page refresh)
  useEffect(() => {
    if (!roomId) return
    setIsLoadingTerms(true)   // [L3] show loading indicator while fetching
    const token = useAuthStore.getState().token
    fetch(`${API_URL}/terminology/room/${roomId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) setTerms(data.terms || [])
      })
      .catch(err => console.error('Failed to fetch room terms:', err))
      .finally(() => setIsLoadingTerms(false))  // [L3] always stop loading
  }, [roomId])

  // Listen for new terms detected live during the lecture
  useEffect(() => {
    if (!socket) return
    const handleNewTerm = (data) => {
      if (!data?.term) return
      setTerms(prev => {
        // Dedupe defensively on the frontend too, even though the backend should
        // already avoid sending duplicates within a room.
        if (prev.some(t => t.term.toLowerCase() === data.term.toLowerCase())) return prev
        return [...prev, data]
      })
    }
    // [H3] Clear ALL state on terminology_cleared — prevents stale loading spinners
    const handleCleared = () => {
      setTerms([])
      setExpandedId(null)
      setDetailsCache({})
      setMindmapCache({})
      setMindmapSvg({})
      setMindmapError({})           // [H3] was missing — stale error messages would linger
      setLoadingDetailsIds(new Set())  // [H3] was missing — stuck spinner if clearing mid-load
      setLoadingMindmapIds(new Set())  // [H3] was missing — stuck "Generating..." if clearing mid-load
    }
    socket.on('terminology_update', handleNewTerm)
    socket.on('terminology_cleared', handleCleared)
    return () => {
      socket.off('terminology_update', handleNewTerm)
      socket.off('terminology_cleared', handleCleared)
    }
  }, [socket])

  const handleTermClick = async (termObj) => {
    const id = termObj._id || termObj.term
    if (expandedId === id) {
      setExpandedId(null) // collapse if clicking the same term again
      return
    }
    setExpandedId(id)

    // Lazy fetch #1: definition + study material (only if not already cached)
    if (!detailsCache[id]) {
      // [M4] Add to Set, not replace
      setLoadingDetailsIds(prev => new Set([...prev, id]))
      try {
        const token = useAuthStore.getState().token
        const res = await fetch(`${API_URL}/terminology/${id}/details`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) {
          setDetailsCache(prev => ({ ...prev, [id]: { definition: data.definition, studyMaterial: data.studyMaterial } }))
        }
      } catch (err) {
        console.error('Failed to fetch term details:', err)
      } finally {
        // [M4] Remove from Set, not null-out a single ID
        setLoadingDetailsIds(prev => { const s = new Set(prev); s.delete(id); return s })
      }
    }
  }

  const handleGenerateMindmap = async (termObj) => {
    const id = termObj._id || termObj.term
    if (mindmapCache[id]) return // already generated, don't re-fetch
    // [M4] Add to Set
    setLoadingMindmapIds(prev => new Set([...prev, id]))
    setMindmapError(prev => ({ ...prev, [id]: null }))
    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`${API_URL}/terminology/${id}/mindmap`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success && data.mermaidCode) {
        setMindmapCache(prev => ({ ...prev, [id]: data.mermaidCode }))
        try {
          // [M1] Use crypto.randomUUID() instead of Date.now() to prevent ID collisions
          //      when two mindmaps render within the same millisecond.
          const uniqueId = `term-mindmap-${id}-${crypto.randomUUID()}`
          const { svg } = await mermaid.render(uniqueId, data.mermaidCode)
          setMindmapSvg(prev => ({ ...prev, [id]: svg }))
        } catch (renderErr) {
          console.error('Mermaid failed to render term mindmap:', renderErr, '\nRaw code was:', data.mermaidCode)
          setMindmapCache(prev => { const next = { ...prev }; delete next[id]; return next }) // allow retry to re-fetch
          setMindmapError(prev => ({ ...prev, [id]: 'The generated diagram had invalid formatting and could not be displayed.' }))
        }
      } else {
        console.error('Mindmap request did not return mermaidCode:', data)
        setMindmapError(prev => ({ ...prev, [id]: data.error || 'Could not generate a mindmap for this term.' }))
      }
    } catch (err) {
      console.error('Failed to generate term mindmap:', err)
      setMindmapError(prev => ({ ...prev, [id]: 'Something went wrong while generating the mindmap.' }))
    } finally {
      // [M4] Remove from Set
      setLoadingMindmapIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  return (
    <div style={{
      background: 'var(--bg-card, #fff)',
      border: '1px solid var(--border-color, #e5e7eb)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #111)' }}>
        📘 Lecture Terminology
      </h3>

      {/* [L3] Show loading state while initial fetch is happening */}
      {isLoadingTerms && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-secondary, #6b7280)', fontSize: '13px' }}>
          Loading terms...
        </div>
      )}

      {!isLoadingTerms && terms.length === 0 && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-secondary, #6b7280)', fontSize: '13px' }}>
          Terms will appear here as the lecture progresses.
        </div>
      )}

      {terms.map((termObj) => {
        const id = termObj._id || termObj.term
        const isExpanded = expandedId === id
        const details = detailsCache[id]
        // [M4] Check Set membership instead of equality with a single ID
        const isLoadingDetails = loadingDetailsIds.has(id)
        const isLoadingMindmap = loadingMindmapIds.has(id)
        const svg = mindmapSvg[id]
        const mmError = mindmapError[id]

        return (
          <div key={id} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => handleTermClick(termObj)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: isExpanded ? 'var(--bg-secondary, #f3f4f6)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary, #111)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>✓ {termObj.term}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)' }}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div style={{ padding: '10px 12px', fontSize: '13px', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                {isLoadingDetails && <div style={{ color: 'var(--text-secondary, #6b7280)' }}>Loading definition...</div>}

                {!isLoadingDetails && details && (
                  <>
                    <p style={{ margin: '0 0 8px 0', color: 'var(--text-primary, #111)' }}>{details.definition}</p>
                    {details.studyMaterial?.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #6b7280)' }}>📚 Learn more:</div>
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                          {details.studyMaterial.map((link, i) => (
                            <li key={i}>
                              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent, #2563eb)' }}>
                                {link.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {!svg && (
                  <button
                    onClick={() => handleGenerateMindmap(termObj)}
                    disabled={isLoadingMindmap}
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--accent, #2563eb)',
                      color: '#fff',
                      cursor: isLoadingMindmap ? 'not-allowed' : 'pointer',
                      opacity: isLoadingMindmap ? 0.6 : 1
                    }}
                  >
                    {isLoadingMindmap ? '⏳ Generating...' : '🧠 Generate Mindmap for this term'}
                  </button>
                )}

                {mmError && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#b91c1c' }}>
                    ⚠️ {mmError}{' '}
                    <button
                      onClick={() => handleGenerateMindmap(termObj)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {svg && (
                  <div style={{ marginTop: '10px', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TerminologySidebar
