import React from 'react'
import { useProjectStore } from '../store/projectStore'

interface TitleBarProps {
  onMenuToggle: () => void
}

export function TitleBar({ onMenuToggle }: TitleBarProps) {
  const { projects, activeProjectId } = useProjectStore()
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <button
        className="flex items-center gap-1.5 text-text-muted hover:text-text transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={onMenuToggle}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2" width="12" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="1" y="6.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="1" y="10.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
      </button>

      <span className="text-xs font-semibold text-text tracking-wide">
        {activeProject?.name ?? 'Queue'}
      </span>

      <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Placeholder for future window controls */}
        <div className="w-5 h-5" />
      </div>
    </div>
  )
}
