// Shared Mermaid singleton — imported by ALL components that use Mermaid.
// This guarantees mermaid.initialize() is called exactly ONCE per page load,
// preventing state corruption when both TerminologySidebar and MindMapViewer
// are mounted on the same page (which happens in RoomDetailPage + StudentRoomPage).
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
})

export default mermaid
