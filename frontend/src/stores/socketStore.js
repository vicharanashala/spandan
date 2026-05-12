import { create } from 'zustand'
import { io } from 'socket.io-client'

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin 
  : 'http://localhost:3001'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,

  connect: (token) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      set({ isConnected: true })
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

    // Authenticate the socket
    socket.emit('authenticate', { token })

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

  leaveRoom: (roomCode) => {
    const { socket } = get()
    if (socket) {
      socket.emit('room:leave', { roomCode })
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