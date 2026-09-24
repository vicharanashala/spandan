import { create } from 'zustand'

// A simple event-ish store so any page can request the teacher portal tour to start
// (the replay "❔" button on the dashboard). PortalTour watches `requestId`.
const useTourStore = create((set) => ({
  requestId: 0,
  requestTour: () => set((state) => ({ requestId: state.requestId + 1 }))
}))

export { useTourStore }