import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config.js'
import useAuthStore from './authStore.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,

  // The room we should belong to.
  // Kept across reconnects so the socket can automatically rejoin.
  joinedRoom: null,

  connect: (token) => {
    const { socket: existingSocket } = get()

    if (existingSocket?.connected) {
      console.log('Socket already connected, skipping')
      return
    }

    const socket = io(SOCKET_URL, {
      auth: { token },

      // IMPORTANT:
      // This must match the Socket.IO path used by the backend/proxy.
      path: '/socket.io',

      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      set({ isConnected: true })

      // Authenticate the socket
      socket.emit('authenticate', { token })

      // Rejoin the previous room after reconnecting
      const { joinedRoom } = get()

      if (joinedRoom?.roomCode) {
        socket.emit('room:join', {
          roomCode: joinedRoom.roomCode,
          userId: joinedRoom.userId
        })
      }
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')

      set({
        isConnected: false,
        currentRoom: null
      })
    })

    socket.on('authenticated', (data) => {
      if (!data.success) {
        console.error(
          'Socket authentication failed:',
          data.error
        )

        // If token expired, send user back to login
        if (data.expired) {
          useAuthStore.getState().handleSessionExpired()
        }
        // The account has not accepted the current Terms of Use: show the accept-terms screen. After
        // acceptance, authStore.acceptTerms() calls reauthenticate() to bring this socket back.
        if (data.termsRequired) {
          useAuthStore.getState().setTermsRequired(true)
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

    // Teacher starts a question
    socket.on('question:started', (data) => {
      console.log('Question started:', data)
    })

    // Teacher ends a question
    socket.on('question:ended', (data) => {
      console.log('Question ended:', data)
    })

    // New student response
    socket.on('response:new', (data) => {
      console.log('New response:', data)
    })

    // Leaderboard update
    socket.on('leaderboard:updated', (data) => {
      console.log('Leaderboard updated:', data)
    })

    // Student receives a new question
    socket.on('new_question', (data) => {
      console.log('New question received:', data)
    })

    set({ socket })
  },

  // Re-run socket authentication on the existing connection (e.g. right after accepting the terms), then
  // re-join the room we belong to, since the earlier join was refused while unauthenticated.
  reauthenticate: (token) => {
    const { socket } = get()
    if (!socket?.connected || !token) return
    // Join only once the server confirms: its authenticate handler is async, so an immediate room:join
    // could arrive while the socket is still unauthenticated and be refused.
    socket.once('authenticated', (data) => {
      const room = get().joinedRoom
      if (data?.success && room?.roomCode) {
        socket.emit('room:join', { roomCode: room.roomCode, userId: room.userId })
      }
    })
    socket.emit('authenticate', { token })
  },

  disconnect: () => {
    const { socket } = get()

    if (socket) {
      socket.disconnect()

      set({
        socket: null,
        isConnected: false,
        currentRoom: null,
        joinedRoom: null
      })
    }
  },

  joinRoom: (roomCode, userId) => {
    const { socket } = get()

    // Remember room for automatic rejoin
    set({
      joinedRoom: {
        roomCode,
        userId
      }
    })

    if (socket) {
      socket.emit('room:join', {
        roomCode,
        userId
      })
    }
  },

  leaveRoom: (roomCode, userId) => {
    const { socket } = get()

    // Deliberate leave, so don't automatically rejoin
    set({
      joinedRoom: null
    })

    if (socket) {
      socket.emit('room:leave', {
        roomCode,
        userId
      })

      set({
        currentRoom: null,
        participants: 0
      })
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