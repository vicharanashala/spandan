import { create } from 'zustand'

const useSidebarStore = create((set) => ({
  isCollapsed: false,
  toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  expand: () => set({ isCollapsed: false }),
  collapse: () => set({ isCollapsed: true }),
}))

export default useSidebarStore