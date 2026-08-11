import { create } from 'zustand'

// Stores the live risk-score state for the currently authenticated student.
// Emitted by the backend's `risk-score:self-update` socket event.
// IMPORTANT: only this student's score lives here. Other students' scores
// are NEVER aggregated on the client (kept server-side, only sent to hosts).

export const useRiskScoreStore = create((set) => ({
  // { currentScore: number, zone: 'safe'|'warning'|'risk', correctStreakNeeded: number }
  self: { currentScore: 100, zone: 'safe', correctStreakNeeded: 0 },
  // Host-only: array of { studentId, studentName, currentScore, zone }
  // Always empty for students, even if the event sneaks in.
  allInRoom: [],

  setSelf: (payload) => set((state) => {
    const next = {
      currentScore: payload?.currentScore ?? state.self.currentScore,
      zone: payload?.zone ?? state.self.zone,
      correctStreakNeeded: payload?.correctStreakNeeded ?? state.self.correctStreakNeeded
    }
    console.log('[riskScoreStore] setSelf:', { prev: state.self, next })
    return { self: next }
  }),

  setAllInRoom: (snapshot) => set({ allInRoom: Array.isArray(snapshot) ? snapshot : [] }),

  reset: () => set({ self: { currentScore: 100, zone: 'safe', correctStreakNeeded: 0 }, allInRoom: [] })
}))
