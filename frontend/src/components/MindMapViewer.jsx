import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { toPng } from 'html-to-image'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
})

const MindMapViewer = ({ maps = [] }) => {
  const containerRef = useRef(null)

  useEffect(() => {
    const renderMaps = async () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
        
        for (let i = 0; i < maps.length; i++) {
          const map = maps[i]
          const id = `mermaid-mindmap-${i}-${Date.now()}`
          
          try {
            const { svg } = await mermaid.render(id, map)
            
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
            containerRef.current.appendChild(wrapper)
            
          } catch (error) {
            console.error('Mermaid rendering failed', error)
            const errorDiv = document.createElement('div')
            errorDiv.className = 'text-red-500 p-2'
            errorDiv.innerText = 'Failed to render mind map'
            containerRef.current.appendChild(errorDiv)
          }
        }
      }
    }
    
    if (maps.length > 0) {
      renderMaps()
    } else if (containerRef.current) {
      containerRef.current.innerHTML = '<p class="text-gray-500 text-center py-4">No mind maps generated yet.</p>'
    }
  }, [maps])

  return (
    <div className="mindmap-viewer max-h-[80vh] overflow-y-auto w-full p-2">
      <div ref={containerRef} className="flex flex-col gap-4"></div>
    </div>
  )
}

export default MindMapViewer
