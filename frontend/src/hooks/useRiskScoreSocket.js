// Subscribes to the backend's risk-score socket events for the currently
// connected socket. Drop this into any component that has access to
// `socket` from useSocketStore().
//
// The hook guarantees:
// - Only THIS student's score is stored in `self`.
// - The `allInRoom` array is ONLY populated for hosts/co-hosts. Student sockets
//   that happen to receive `risk-score:all-update` (which shouldn't happen but
//   is defended against) will NOT trigger `setAllInRoom` because the hook
//   checks the user's role before subscribing to the snapshot event.

import { useEffect } from 'react'
import { useSocketStore } from '../stores/socketStore'
import { useAuthStore } from '../stores/authStore'
import { useRiskScoreStore } from '../stores/riskScoreStore'

export function useRiskScoreSocket() {
  const socket = useSocketStore((s) => s.socket)
  const user = useAuthStore((s) => s.user)
  const setSelf = useRiskScoreStore((s) => s.setSelf)
  const setAllInRoom = useRiskScoreStore((s) => s.setAllInRoom)

  useEffect(() => {
    if (!socket) return

    const handleSelf = (data) => {
      console.log('[risk-score] self-update received:', data)
      setSelf(data || {})
    }

    const handleAll = (data) => {
      console.log('[risk-score] all-update received (role=' + user?.role + '):', data?.snapshot?.length, 'students')
      // Defensive guard: only hosts/co-hosts should populate the room snapshot.
      // (Backend already enforces this server-side; this is client belt-and-braces.)
      if (user?.role !== 'teacher') return
      setAllInRoom(data?.snapshot || [])
    }

    socket.on('risk-score:self-update', handleSelf)
    socket.on('risk-score:all-update', handleAll)

    return () => {
      socket.off('risk-score:self-update', handleSelf)
      socket.off('risk-score:all-update', handleAll)
    }
  }, [socket, user, setSelf, setAllInRoom])
}
