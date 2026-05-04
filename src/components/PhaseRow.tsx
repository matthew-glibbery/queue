import React from 'react'
import type { TaskPhase } from '@shared/types'

interface PhaseRowProps {
  phase: TaskPhase
}

const PHASE_LABELS: Record<TaskPhase, string> = {
  current_window: 'This window',
  next_window: 'Next window',
  future: 'Future',
}

export function PhaseRow({ phase }: PhaseRowProps) {
  const isActive = phase === 'current_window'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mt-2">
      <div className={`flex-1 h-px ${isActive ? 'bg-accent/40' : 'bg-border'}`} />
      <span
        className={`text-xs font-medium tracking-wide ${
          isActive ? 'text-accent' : 'text-text-dim'
        }`}
      >
        {PHASE_LABELS[phase]}
      </span>
      <div className={`flex-1 h-px ${isActive ? 'bg-accent/40' : 'bg-border'}`} />
    </div>
  )
}
