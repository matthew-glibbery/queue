import React, { useState } from 'react'
import { useProjectStore } from '../store/projectStore'

interface ProjectHeaderProps {
  showCompleted: boolean
  onToggleCompleted: () => void
}

export function ProjectHeader({ showCompleted, onToggleCompleted }: ProjectHeaderProps) {
  const { projects, activeProjectId, setActiveProject, upsertProject } = useProjectStore()
  const project = projects.find((p) => p.id === activeProjectId)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')

  if (!project) return null

  const handleSaveDesc = () => {
    const trimmed = descValue.trim()
    upsertProject({ ...project, description: trimmed || undefined })
    setEditingDesc(false)
  }

  return (
    <div className="px-3 py-2 border-b border-border bg-surface/40">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <button
          className="text-xs text-text-dim hover:text-text transition-colors flex items-center gap-1"
          onClick={() => setActiveProject(null)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6 2L3 5L6 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All projects
        </button>
        <button
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            showCompleted ? 'bg-accent/15 text-accent' : 'text-text-dim hover:text-text'
          }`}
          onClick={onToggleCompleted}
        >
          Completed
        </button>
      </div>

      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-text">{project.name}</p>
          {editingDesc ? (
            <input
              autoFocus
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={handleSaveDesc}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDesc() }}
              placeholder="Add a description..."
              className="w-full mt-0.5 bg-surface text-xs text-text-dim px-1.5 py-0.5 rounded border border-accent/60 focus:outline-none"
            />
          ) : (
            <p
              className="text-xs text-text-dim mt-0.5 cursor-pointer hover:text-text-muted transition-colors leading-snug"
              onClick={() => { setDescValue(project.description ?? ''); setEditingDesc(true) }}
            >
              {project.description ?? <span className="opacity-50">Add a description…</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
