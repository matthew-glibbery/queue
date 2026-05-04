import { create } from 'zustand'
import type { RateLimitState } from '@shared/types'
import { supabase } from '../lib/supabase'

interface RateLimitStoreState extends RateLimitState {
  initialized: boolean
  initialize: () => Promise<void>
  setUsedTokens: (tokens: number) => void
  setGitBuffer: (enabled: boolean) => Promise<void>
}

const DEFAULTS: RateLimitState = {
  usedTokens: 0,
  maxTokens: 100000,
  resetAt: Date.now() + 60 * 60 * 1000,
  gitBufferEnabled: true,
  gitBufferTokens: 5000,
}

async function loadSettings(): Promise<Partial<RateLimitState>> {
  if (!supabase) return {}
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['maxTokensPerWindow', 'gitBufferEnabled', 'gitBufferTokens'])
  if (!data) return {}
  const map = Object.fromEntries(data.map((r: { key: string; value: string }) => [r.key, r.value]))
  return {
    maxTokens: map.maxTokensPerWindow ? Number(map.maxTokensPerWindow) : undefined,
    gitBufferEnabled: map.gitBufferEnabled !== undefined ? map.gitBufferEnabled === 'true' : undefined,
    gitBufferTokens: map.gitBufferTokens ? Number(map.gitBufferTokens) : undefined,
  }
}

export const useRateLimitStore = create<RateLimitStoreState>((set) => ({
  // Keep mock values so the UI looks right before init
  ...DEFAULTS,
  usedTokens: 47200,
  initialized: false,

  initialize: async () => {
    const loaded = await loadSettings()
    set({ ...loaded, initialized: true })
  },

  setUsedTokens: (tokens) => set({ usedTokens: tokens }),

  setGitBuffer: async (enabled) => {
    set({ gitBufferEnabled: enabled })
    if (supabase) {
      await supabase
        .from('settings')
        .upsert({ key: 'gitBufferEnabled', value: String(enabled) })
    }
  },
}))
