import { create } from 'zustand'

// Open/close state for the research opt-out dialog (components/ResearchOptOutDialog.jsx). Opened from the
// sidebar button above the profile card and from the one-time research notice.
export const useResearchOptOutStore = create((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))

export default useResearchOptOutStore
