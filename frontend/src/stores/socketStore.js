import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL, SOCKET_PATH } from '../config.js'
import { useTeamStore } from './teamStore.js'
import useAuthStore from './authStore.js'

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
      auth: { token },
      path: SOCKET_PATH,
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      set({ isConnected: true })
      socket.emit('authenticate', { token })

      // Auto-rejoin room if we were in one
      const { currentRoom } = get()
      const userId = useAuthStore.getState().user?._id
      if (currentRoom && userId) {
        console.log(`Auto-rejoining room ${currentRoom} after socket reconnect`)
        socket.emit('room:join', { roomCode: currentRoom, userId })
      }

      // Auto-rejoin team channel if we were in one
      const myTeam = useTeamStore.getState().myTeam
      if (myTeam?._id) {
        console.log(`Auto-rejoining team channel team:${myTeam._id} after socket reconnect`)
        socket.emit('team:join_channel', { teamId: myTeam._id })
      }
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      set({ isConnected: false })
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

    // Team Battle socket listeners
    socket.on('team:message_received', (data) => {
      useTeamStore.getState().addMessage(data)
    })

    socket.on('team:partner_selected', (data) => {
      useTeamStore.getState().setPartnerChoice(data.studentId, data.selectedOption)
    })

    socket.on('team:score_updated', (data) => {
      useTeamStore.getState().updateTeamScore(data.teamId, data.points, data.streakCount, data.consensusBonus)
    })

    socket.on('team:consensus_success', (data) => {
      console.log('🎉 Consensus bonus!', data)
    })

    socket.on('team:battle_started', (data) => {
      console.log('Team Battle started:', data)
    })

    socket.on('team:assigned', (data) => {
      console.log('Assigned to team:', data.team?.name)
      useTeamStore.setState({ myTeam: data.team })
    })

    socket.on('team:updated', (data) => {
      console.log('Teams updated:', data.teams)
      const studentId = useAuthStore.getState().user?._id
      if (studentId) {
        useTeamStore.getState().setTeamsAndFindMyTeam(data.teams, studentId)
      } else {
        useTeamStore.setState({ teams: data.teams })
      }
    })

    socket.on('team:joined_successfully', (data) => {
      console.log('Successfully joined team:', data.team)
      useTeamStore.setState({ myTeam: data.team })
    })

    socket.on('team:left_successfully', () => {
      console.log('Successfully left team')
      useTeamStore.setState({ myTeam: null })
    })

    socket.on('rate_limit_exceeded', (data) => {
      console.warn('Rate limited:', data.message)
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

  // Team Battle socket methods
  joinTeamChannel: (teamId) => {
    const { socket } = get()
    if (socket) socket.emit('team:join_channel', { teamId })
  },

  sendTeamMessage: (teamId, text) => {
    const { socket } = get()
    if (socket) socket.emit('team:message', { teamId, text })
  },

  sendTeamOptionSelect: (teamId, selectedOption) => {
    const { socket } = get()
    if (socket) socket.emit('team:select_option', { teamId, selectedOption })
  },

  checkTeamConsensus: (roomId, questionId) => {
    const { socket } = get()
    if (socket) socket.emit('team:check_consensus', { roomId, questionId })
  },

  joinManualTeam: (roomId, teamId) => {
    const { socket } = get()
    if (socket) socket.emit('team:join', { roomId, teamId })
  },

  leaveManualTeam: (roomId) => {
    const { socket } = get()
    if (socket) socket.emit('team:leave', { roomId })
  }
}))

export default useSocketStore