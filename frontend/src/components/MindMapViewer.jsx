import React, { useEffect, useRef } from 'react'
import mermaid from '../lib/mermaid'   // [C1] shared singleton — never double-initialize
import { toPng } from 'html-to-image'

const MindMapViewer = ({ maps = [] }) => {
  const containerRef = useRef(null)

  useEffect(() => {
    // Guards against React StrictMode's dev-mode double-invocation of effects
    // (and any other rapid re-render race): without this, two concurrent async
    // renders could both append their own "Mind Map 1", "Mind Map 2"... producing
    // visible duplicates, since the old code appended directly to the shared
    // container from inside the loop instead of committing atomically.
    let cancelled = false

    const renderMaps = async () => {
      if (!containerRef.current) return
      const fragment = document.createDocumentFragment()

      for (let i = 0; i < maps.length; i++) {
        if (cancelled) return // a newer effect run has started — abandon this one
        const map = maps[i]
        const id = `mermaid-mindmap-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`

        try {
          const { svg } = await mermaid.render(id, map)
          if (cancelled) return

          const wrapper = document.createElement('div')
          wrapper.className = 'bg-white p-4 rounded shadow mb-4 relative'

          const title = document.createElement('h3')
          title.className = 'text-lg font-bold mb-2 text-gray-800'
          title.innerText = `Mind Map ${i + 1}`

          const svgContainer = document.createElement('div')
          svgContainer.innerHTML = svg
          svgContainer.className = 'overflow-auto flex justify-center mermaid-container bg-white p-2'

          const downloadBtn = document.createElement('button')
          downloadBtn.className = 'absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition'
          downloadBtn.innerText = 'Download PNG'
          downloadBtn.onclick = () => {
            toPng(svgContainer, { backgroundColor: '#ffffff' })
              .then((dataUrl) => {
                const link = document.createElement('a')
                link.download = `mindmap-${i + 1}.png`
                link.href = dataUrl
                link.click()
              })
              .catch((err) => {
                console.error('Failed to download image', err)
              })
          }

          wrapper.appendChild(downloadBtn)
          wrapper.appendChild(title)
          wrapper.appendChild(svgContainer)
          fragment.appendChild(wrapper)

        } catch (error) {
          console.error('Mermaid rendering failed', error)
          const errorDiv = document.createElement('div')
          errorDiv.className = 'text-red-500 p-2'
          errorDiv.innerText = 'Failed to render mind map'
          fragment.appendChild(errorDiv)
        }
      }

      // Commit atomically — only ONE execution ever gets here uncancelled,
      // so there's no window where two runs both partially wrote to the DOM.
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(fragment)
    }

    if (maps.length > 0) {
      renderMaps()
    } else if (containerRef.current) {
      containerRef.current.innerHTML = '<p class="text-gray-500 text-center py-4">No mind maps generated yet.</p>'
    }

    return () => { cancelled = true }
  }, [maps])

  return (
    <div className="mindmap-viewer max-h-[80vh] overflow-y-auto w-full p-2">
      <div ref={containerRef} className="flex flex-col gap-4"></div>
    </div>
  )
}

export default MindMapViewer
