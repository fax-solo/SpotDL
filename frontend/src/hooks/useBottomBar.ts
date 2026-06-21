import { create } from 'zustand'

interface BottomBarState {
  hidden: boolean
  setHidden: (v: boolean) => void
}

export const useBottomBar = create<BottomBarState>(set => ({
  hidden: false,
  setHidden: (v: boolean) => set({ hidden: v }),
}))
