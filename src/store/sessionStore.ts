import { create } from 'zustand'

type PauseReason = 'manual' | 'rate_limit'

interface SessionState {
  isPaused: boolean
  pauseReason: PauseReason | null
  pause: (reason: PauseReason) => void
  resume: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  isPaused: false,
  pauseReason: null,
  pause: (reason) => set({ isPaused: true, pauseReason: reason }),
  resume: () => set({ isPaused: false, pauseReason: null }),
}))
