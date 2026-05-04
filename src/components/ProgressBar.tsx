import React from 'react'
import type { TaskProgress } from '@shared/types'

interface ProgressBarProps {
  progress: TaskProgress
}

export function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="mt-2">
      <div className="relative h-1 bg-surface-hover rounded-full overflow-hidden mb-1.5">
        <div
          className="absolute inset-y-0 left-0 bg-accent rounded-full"
          style={{
            width: `${progress.percentage}%`,
            transition: 'width 400ms ease',
          }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        {progress.milestones.map((milestone) => (
          <div key={milestone.step} className="flex items-center gap-1">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                milestone.completed
                  ? 'bg-accent'
                  : milestone.active
                  ? 'border border-accent bg-transparent'
                  : 'bg-surface-hover'
              }`}
            />
          </div>
        ))}
        {progress.currentFile && (
          <span className="text-xs text-text-dim truncate ml-1">{progress.currentFile}</span>
        )}
      </div>
    </div>
  )
}
