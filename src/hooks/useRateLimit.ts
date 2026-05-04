import { useRateLimitStore } from '../store/rateLimitStore'
import { getAvailableTokens } from '../lib/taskBundler'

export function useRateLimit() {
  const state = useRateLimitStore()
  const availableTokens = getAvailableTokens(state)

  return {
    ...state,
    availableTokens,
    isAtLimit: availableTokens <= 0,
    // Git buffer is the only thing blocking dispatch when there's buffer headroom
    // but no general headroom. Phase 2 dispatcher sets actual status.
    gitBufferIsBlocking:
      availableTokens <= 0 &&
      getAvailableTokens({ ...state, gitBufferEnabled: false }) > 0,
    usagePct: Math.min((state.usedTokens / state.maxTokens) * 100, 100),
    gitMarkerPct: ((state.maxTokens - state.gitBufferTokens) / state.maxTokens) * 100,
  }
}
