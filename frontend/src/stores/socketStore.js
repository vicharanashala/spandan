import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config.js'
import useAuthStore from './authStore.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,
  // The room we should belong to. Kept across reconnects (unlike currentRoom, which is cleared
  // on disconnect) so the 'connect' handler can auto-rejoin after a dropped socket. Cleared only
  // on an explicit leaveRoom()/disconnect().
  joinedRoom: null,

  connect: (token) => {
    const { socket: existingSocket } = get()
    if (existingSocket?.connected) {
      console.log('Socket already connected, skipping')
      return
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      path: '/spandan/socket.io',
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      set({ isConnected: true })
      socket.emit('authenticate', { token })
      // On a (re)connect, socket.io gives us a NEW underlying connection that is a member of NO
      // rooms — even if we had joined one before the drop. Without this, a student whose socket
      // briefly reconnects silently stops receiving room broadcasts (new_question, leaderboard…)
      // until they manually refresh the page. Re-join the room we were in so delivery self-heals.
      const { joinedRoom } = get()
      if (joinedRoom?.roomCode) {
        socket.emit('room:join', { roomCode: joinedRoom.roomCode, userId: joinedRoom.userId, coHostCode: joinedRoom.coHostCode })
      }
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      set({ isConnected: false, currentRoom: null })
    })

    socket.on('authenticated', (data) => {
      if (!data.success) {
        console.error('Socket authentication failed:', data.error)
        // A token that expired mid-session fails socket re-auth too (server sends expired:true). Treat
        // it like an HTTP 401 so the user is sent to re-login instead of sitting on a silently
        // unauthenticated socket that still shows polls but can't submit answers.
        if (data.expired) {
          useAuthStore.getState().handleSessionExpired()
        }
      }
    })

    socket.on('room:joined', (data) => {
      console.log('Joined room:', data)
      set({ 
        currentRoom: data.roomCode,
        participants: data.participants || 0
      })
    })

    socket.on('room:left', (data) => {
      console.log('Left room:', data)
      set({ 
        currentRoom: null,
        participants: 0
      })
    })

    socket.on('question:started', (data) => {
      console.log('Question started:', data)
    })

    socket.on('question:ended', (data) => {
      console.log('Question ended:', data)
    })

    socket.on('response:new', (data) => {
      console.log('New response:', data)
    })

    socket.on('leaderboard:updated', (data) => {
      console.log('Leaderboard updated:', data)
    })

    socket.on('new_question', (data) => {
      console.log('New question received:', data)
    })

    set({ socket })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, isConnected: false, currentRoom: null, joinedRoom: null })
    }
  },

  joinRoom: (roomCode, userId, coHostCode) => {
    const { socket } = get()
    // Remember the room so the socket auto-rejoins after a reconnect (see the 'connect' handler).
    set({ joinedRoom: { roomCode, userId, coHostCode } })
    if (socket) {
      socket.emit('room:join', { roomCode, userId, coHostCode })
      if (!socket.connected) {
        console.warn('[socketStore] joinRoom emitted while socket is connecting (buffered by Socket.IO):', { roomCode, userId })
      }
    } else {
      console.error('[socketStore] joinRoom failed: socket is not initialized', { roomCode, userId })
    }
  },

  leaveRoom: (roomCode, userId) => {
    const { socket } = get()
    // Deliberate leave — stop auto-rejoining on future reconnects.
    set({ joinedRoom: null })
    if (socket) {
      socket.emit('room:leave', { roomCode, userId })
      set({ currentRoom: null, participants: 0 })
    } else {
      console.error('[socketStore] leaveRoom failed: socket is not initialized', { roomCode, userId })
    }
  },

  leaveCoHostRoom: (roomCode) => {
    const { socket } = get()
    set({ joinedRoom: null })
    if (socket) {
      socket.emit('cohost:leave', { roomCode })
      set({ currentRoom: null, participants: 0 })
    } else {
      console.error('[socketStore] leaveCoHostRoom failed: socket is not initialized', { roomCode })
    }
  },

  generateCoHostCode: (roomCode, durationMinutes) => {
    const { socket } = get()
    if (!roomCode) {
      console.warn('[socketStore] generateCoHostCode failed: missing roomCode')
      return
    }
    if (socket) {
      socket.emit('cohost:generate-code', { roomCode, durationMinutes })
      if (!socket.connected) {
        console.warn('[socketStore] generateCoHostCode emitted while socket is connecting:', { roomCode })
      }
    } else {
      console.error('[socketStore] generateCoHostCode failed: socket is not initialized', { roomCode })
    }
  },

  removeCoHost: (roomCode, coHostUserId) => {
    const { socket } = get()
    if (!roomCode || !coHostUserId) {
      console.warn('[socketStore] removeCoHost failed: missing roomCode or coHostUserId', { roomCode, coHostUserId })
      return
    }
    if (socket) {
      socket.emit('cohost:remove', { roomCode, coHostUserId })
    } else {
      console.error('[socketStore] removeCoHost failed: socket is not initialized', { roomCode, coHostUserId })
    }
  },

  submitResponse: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('response:submit', data)
    } else {
      console.error('[socketStore] submitResponse failed: socket is not initialized', data)
    }
  },

  startQuestion: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('question:start', data)
    } else {
      console.error('[socketStore] startQuestion failed: socket is not initialized', data)
    }
  },

  endQuestion: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('question:end', data)
    } else {
      console.error('[socketStore] endQuestion failed: socket is not initialized', data)
    }
  }

}))

export default useSocketStore