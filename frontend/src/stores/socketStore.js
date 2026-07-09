import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,
  onSyncPendingAnswers: null, // Callback for syncing pending answers on reconnect

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
      
      // Trigger pending answers sync on reconnect
      const { onSyncPendingAnswers } = get()
      if (onSyncPendingAnswers) {
        console.log('[Socket] Triggering pending answers sync on reconnect')
        onSyncPendingAnswers()
      }
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      set({ isConnected: false, currentRoom: null })
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
      set({ socket: null, isConnected: false, currentRoom: null })
    }
  },

  joinRoom: (roomCode, userId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('room:join', { roomCode, userId })
    }
  },

  leaveRoom: (roomCode, userId) => {
    const { socket } = get()
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
  },

  /**
   * Register a callback to sync pending answers when socket reconnects
   * This is typically called from StudentRoomPage to handle offline submissions
   */
  registerSyncPendingAnswersCallback: (callback) => {
    set({ onSyncPendingAnswers: callback })
  },

  /**
   * Unregister the sync callback (e.g., when leaving the room)
   */
  unregisterSyncPendingAnswersCallback: () => {
    set({ onSyncPendingAnswers: null })
  }
}))

export default useSocketStore