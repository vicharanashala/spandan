import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,

  connect: (token) => {
    const { socket: existingSocket } = get()
    if (existingSocket?.connected) {
      console.log('Socket already connected, skipping')
      return
    }

    const socket = io(SOCKET_URL, {
      auth: { token, serverOffset: null },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      // TODO: Must remove in porduction.
      reconnectionDelay: 30000, 
      reconnectionDelayMax: 30000 
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      set({ isConnected: true })
      socket.emit('authenticate', { token })
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
  
  // TODO: Must remove in porduction.
  // Implement forceDisconnect function to demonstrate recovery of lost event due to socket disconnect.
  forceDisconnect: ()=>{
    const { socket } = get()
    if (socket.io.engine) {
      // close the low-level connection and trigger a reconnection
      socket.io.engine.close();
      console.log("socket connection is forcefull closed.")
    } else {
      console.log("failed to close socket connection forcefull.")
    }
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
  }
}))

export default useSocketStore