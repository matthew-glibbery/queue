import React, { useEffect, useState } from 'react'
import { useRateLimit } from '../hooks/useRateLimit'

export function RateLimitBar() {
  const {
    usedTokens,
    maxTokens,
    resetAt,
    gitBufferEnabled,
    gitBufferIsBlocking,
    usagePct,
    gitMarkerPct,
    setGitBuffer,
  } = useRateLimit()
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const tick = () => {
      const ms = resetAt - Date.now()
      if (ms <= 0) {
        setCountdown('Resetting...')
        return
      }
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setCountdown(`${m}m ${s.toString().padStart(2, '0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [resetAt])

  return (
    <div className="px-3 py-2 border-t border-border">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-dim">
          {gitBufferIsBlocking
            ? 'Saving tokens for commit'
            : `${(usedTokens / 1000).toFixed(0)}k / ${(maxTokens / 1000).toFixed(0)}k tokens`}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={`text-xs flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
              gitBufferEnabled
                ? 'bg-accent/15 text-accent'
                : 'bg-surface text-text-dim hover:text-text'
            }`}
            onClick={() => setGitBuffer(!gitBufferEnabled)}
            title="Reserve tokens for git push at end of window"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <circle cx="4.5" cy="4.5" r="1.8" fill="currentColor" />
              <line x1="4.5" y1="0" x2="4.5" y2="2.4" stroke="currentColor" strokeWidth="1.3" />
              <line x1="4.5" y1="6.6" x2="4.5" y2="9" stroke="currentColor" strokeWidth="1.3" />
              <line x1="0" y1="4.5" x2="2.4" y2="4.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="6.6" y1="4.5" x2="9" y2="4.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Git buffer
          </button>
          <span className="text-xs text-text-dim">{countdown}</span>
        </div>
      </div>

      <div className="relative h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-accent rounded-full"
          style={{ width: `${usagePct}%`, transition: 'width 300ms ease' }}
        />
        {gitBufferEnabled && (
          <div
            className="absolute inset-y-0 w-px bg-text-dim opacity-50"
            style={{ left: `${gitMarkerPct}%` }}
          />
        )}
      </div>
    </div>
  )
}
