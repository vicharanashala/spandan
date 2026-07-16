import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  userId: null,
  participants: 0,
  // The room we should belong to. Kept across reconnects (unlike currentRoom, which is cleared
  // on disconnect) so the 'connect' handler can auto-rejoin after a dropped socket. Cleared only
  // on an explicit leaveRoom()/disconnect().
  joinedRoom: null,

  connect: (token, userId) => {
    const { socket: existingSocket } = get()
    if (existingSocket?.connected) {
      return
    }

    // Clean up old socket if it exists but is disconnected
    if (existingSocket) {
      existingSocket.removeAllListeners()
      existingSocket.disconnect()
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      path: '/spandan/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    })

    socket.on('connect', () => {
      set({ isConnected: true })
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

    socket.on('disconnect', () => {
      set({ isConnected: false })
    })

    socket.on('authenticated', (data) => {
      if (!data.success) {
        console.error('Socket authentication failed:', data.error)
      }
    })

    socket.on('room:joined', (data) => {
      set({ 
        currentRoom: data.roomCode,
        participants: data.participants || 0
      })
    })

    socket.on('room:left', (data) => {
      set({ 
        currentRoom: null,
        participants: 0
      })
    })

    set({ socket, userId })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      set({ socket: null, isConnected: false, currentRoom: null, joinedRoom: null })
    }
  },

  joinRoom: (roomCode, userId) => {
    const { socket } = get()
    // Remember the room so the socket auto-rejoins after a reconnect (see the 'connect' handler).
    set({ joinedRoom: { roomCode, userId } })
    if (socket) {
      set({ currentRoom: roomCode, userId })
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
