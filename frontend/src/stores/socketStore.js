import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL, SOCKET_PATH } from '../config.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,
  reconnectAttempt: 0,
  lastError: null,

  connect: (token) => {
    const { socket: existingSocket } = get()
    if (existingSocket?.connected) {
      console.log('Socket already connected, skipping')
      return
    }

    // Default reconnect strategy (Socket.IO v4):
    //   5 attempts, 1s → 2s → 4s → 8s → 16s (doubles), capped at 5s.
    // We override to keep it sane for classroom use (no infinite backoff).
    const socket = io(SOCKET_URL, {
      auth: { token },
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socket.on('connect', () => {
      console.log('[socket] connected')
      set({ isConnected: true, reconnectAttempt: 0, lastError: null })
      socket.emit('authenticate', { token })
      // On a (re)connect, socket.io gives us a NEW underlying connection that is a member of NO
      // rooms — even if we had joined one before the drop. Without this, a student whose socket
      // briefly reconnects silently stops receiving room broadcasts (new_question, leaderboard…)
      // until they manually refresh the page. Re-join the room we were in so delivery self-heals.
      const { joinedRoom } = get()
      if (joinedRoom?.roomCode) {
        socket.emit('room:join', { roomCode: joinedRoom.roomCode, userId: joinedRoom.userId })
      }
    })

    socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnected:', reason)
      set({ isConnected: false, currentRoom: null })
      // 'io server disconnect' = server kicked us, must reconnect manually
      if (reason === 'io server disconnect') {
        socket.connect()
      }
    })

    socket.on('connect_error', (err) => {
      console.warn('[socket] connect_error:', err.message)
      set({ lastError: err.message })
    })

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[socket] reconnect attempt #${attempt}`)
      set({ reconnectAttempt: attempt })
    })

    socket.on('reconnect_failed', () => {
      console.error('[socket] reconnect_failed after all attempts')
      set({ lastError: 'Unable to reconnect to server' })
    })

    socket.on('authenticated', (data) => {
      if (!data.success) {
        console.error('Socket authentication failed:', data.error)
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
      set({ socket: null, isConnected: false, currentRoom: null, reconnectAttempt: 0, lastError: null })
    }
  },

  joinRoom: (roomCode, userId) => {
    const { socket } = get()
    // Remember the room so the socket auto-rejoins after a reconnect (see the 'connect' handler).
    set({ joinedRoom: { roomCode, userId } })
    if (socket) {
      socket.emit('room:join', { roomCode, userId })
    }
  },

  leaveRoom: (roomCode, userId) => {
    const { socket } = get()
    // Deliberate leave — stop auto-rejoining on future reconnects.
    set({ joinedRoom: null })
    if (socket) {
      socket.emit('room:leave', { roomCode, userId })
      set({ currentRoom: null, participants: 0 })
    }
  },

  submitResponse: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('response:submit', data)
    }
  },

  startQuestion: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('question:start', data)
    }
  },

  endQuestion: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('question:end', data)
    }
  }
}))

export default useSocketStore