import React from 'react'
import { useProjectStore } from '../store/projectStore'

interface SlideMenuProps {
  isOpen: boolean
  onClose: () => void
  onDescribeProject: () => void
  onOverview: () => void
}

export function SlideMenu({ isOpen, onClose, onDescribeProject, onOverview }: SlideMenuProps) {
  const { projects, activeProjectId, setActiveProject } = useProjectStore()

  const handleProjectSelect = (id: string) => {
    setActiveProject(id)
    setTimeout(onClose, 160)
  }

  return (
    <>
      {isOpen && (
        <div className="absolute inset-0 bg-black/40 z-10" onClick={onClose} />
      )}

      <div
        className="absolute inset-y-0 left-0 w-[200px] bg-surface border-r border-border z-20 flex flex-col"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-200px)',
          transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Overview */}
        <button
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors border-b border-border"
          onClick={onOverview}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0" y="0" width="5" height="5" rx="1" fill="currentColor" />
            <rect x="7" y="0" width="5" height="5" rx="1" fill="currentColor" />
            <rect x="0" y="7" width="5" height="5" rx="1" fill="currentColor" />
            <rect x="7" y="7" width="5" height="5" rx="1" fill="currentColor" />
          </svg>
          Overview
        </button>

        {/* Projects */}
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
            Projects
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                project.id === activeProjectId
                  ? 'text-accent bg-accent/10'
                  : 'text-text hover:bg-surface-hover'
              }`}
              onClick={() => handleProjectSelect(project.id)}
            >
              <div className="flex items-center gap-2">
                {project.hasRunningTask ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 flex-shrink-0" />
                )}
                <span className="truncate font-medium">{project.name}</span>
              </div>
              <div className="text-text-dim text-xs mt-0.5 pl-3.5">
                {project.activeTaskCount} task{project.activeTaskCount !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-border py-1">
          <button
            className="w-full text-left px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            onClick={onDescribeProject}
          >
            + Describe new project
          </button>
        </div>
      </div>
    </>
  )
}
