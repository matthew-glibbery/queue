import React from 'react'
import type { VoiceState } from '../hooks/useVoiceInput'

interface VoiceButtonProps {
  state: VoiceState
  isSupported: boolean
  onToggle: () => void
}

export function VoiceButton({ state, isSupported, onToggle }: VoiceButtonProps) {
  if (!isSupported) return null

  return (
    <button
      type="button"
      onClick={onToggle}
      title={state === 'idle' ? 'Start voice input' : 'Stop recording'}
      className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
        state === 'listening'
          ? 'text-danger bg-danger/10'
          : state === 'processing'
          ? 'text-accent bg-accent/10'
          : 'text-text-dim hover:text-text hover:bg-surface-hover'
      }`}
    >
      {state === 'listening' ? (
        // Pulsing mic
        <span className="relative flex items-center justify-center">
          <span className="absolute w-5 h-5 rounded-full bg-danger/30 animate-ping" />
          <MicIcon />
        </span>
      ) : (
        <MicIcon />
      )}
    </button>
  )
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4.5" y="1" width="5" height="7" rx="2.5" fill="currentColor" />
      <path
        d="M2 7C2 9.76 4.24 12 7 12C9.76 12 12 9.76 12 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <line x1="7" y1="12" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
