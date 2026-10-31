import { create } from 'zustand'

// Open/close state for the ⓘ help drawer (components/HelpDrawer.jsx). Any component can open it,
// optionally on a specific section id; the drawer itself picks the section for the current page.
export const useHelpStore = create((set) => ({
  isOpen: false,
  sectionId: null,
  open: (sectionId = null) => set({ isOpen: true, sectionId }),
  close: () => set({ isOpen: false }),
}))

export default useHelpStore
