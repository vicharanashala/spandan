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
      const currentToken = useAuthStore.getState().token || token
      socket.emit('authenticate', { token: currentToken })
      const { joinedRoom } = get()
      if (joinedRoom?.roomCode) {
        socket.emit('room:join', { roomCode: joinedRoom.roomCode, userId: joinedRoom.userId, token: currentToken })
      }
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      set({ isConnected: false, currentRoom: null })
    })

    socket.on('authenticated', (data) => {
      if (data.success) {
        const { joinedRoom } = get()
        if (joinedRoom?.roomCode) {
          const currentToken = useAuthStore.getState().token || token
          socket.emit('room:join', { roomCode: joinedRoom.roomCode, userId: joinedRoom.userId, token: currentToken })
        }
      } else {
        console.error('Socket authentication failed:', data.error)
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

  joinRoom: (roomCode, userId) => {
    const { socket } = get()
    // Remember the room so the socket auto-rejoins after a reconnect (see the 'connect' handler).
    set({ joinedRoom: { roomCode, userId } })
    if (socket) {
      const token = useAuthStore.getState().token
      socket.emit('room:join', { roomCode, userId, token })
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