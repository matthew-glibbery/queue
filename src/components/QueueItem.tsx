import React, { useState } from 'react'
import type { Task, TaskPhase } from '@shared/types'
import { useProjectStore } from '../store/projectStore'
import { useQueueStore } from '../store/queueStore'
import { useRateLimitStore } from '../store/rateLimitStore'
import { AnnotationPill } from './AnnotationPill'
import type { useDragReorder } from '../hooks/useDragReorder'

const PHASE_LABELS: Record<TaskPhase, string> = {
  current_window: 'This window',
  next_window: 'Next window',
  future: 'Future',
}
const PHASES: TaskPhase[] = ['current_window', 'next_window', 'future']

interface QueueItemProps {
  task: Task
  index: number
  allTasks: Task[]
  drag: ReturnType<typeof useDragReorder>
}

export function QueueItem({ task, index, allTasks, drag }: QueueItemProps) {
  const projects = useProjectStore((s) => s.projects)
  const { setActiveProject } = useProjectStore()
  const updateTask = useQueueStore((s) => s.updateTask)
  const rebundle = useQueueStore((s) => s.rebundle)
  const rateLimitState = useRateLimitStore()
  const project = projects.find((p) => p.id === task.projectId)
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false)

  const isFuture = task.phase === 'future'
  const isDragging = drag.draggedId === task.id
  const isDropTarget = drag.dragOverId === task.id && drag.draggedId !== task.id

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2.5 group transition-all ${
        isFuture ? 'opacity-45' : ''
      } ${isDragging ? 'opacity-30' : 'hover:bg-surface/50'} ${
        isDropTarget ? 'border-t-2 border-accent' : 'border-t-2 border-transparent'
      }`}
      draggable
      onDragStart={drag.onDragStart(task.id)}
      onDragEnter={drag.onDragEnter(task.id)}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop(allTasks)}
      onDragEnd={drag.onDragEnd}
    >
      {/* Drag handle */}
      <div className="flex-shrink-0 mt-1 opacity-30 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing">
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
          <circle cx="2" cy="2" r="1.5" fill="#8e8e93" />
          <circle cx="6" cy="2" r="1.5" fill="#8e8e93" />
          <circle cx="2" cy="6" r="1.5" fill="#8e8e93" />
          <circle cx="6" cy="6" r="1.5" fill="#8e8e93" />
          <circle cx="2" cy="10" r="1.5" fill="#8e8e93" />
          <circle cx="6" cy="10" r="1.5" fill="#8e8e93" />
        </svg>
      </div>

      {/* Queue number */}
      <span className="flex-shrink-0 w-4 text-xs text-text-dim mt-0.5">{index + 1}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text leading-snug">{task.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {project && (
            <button
              className="text-xs text-text-dim bg-surface hover:bg-surface-hover px-1.5 py-0.5 rounded transition-colors"
              onClick={() => setActiveProject(task.projectId)}
              title={`Show ${project.name} tasks`}
            >
              {project.name}
            </button>
          )}
          <span className="text-xs text-text-dim">
            ~{(task.estimatedTokens / 1000).toFixed(1)}k
          </span>

          {/* Phase menu */}
          <div className="relative ml-auto">
            <button
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-text-dim text-xs px-1 py-0.5 rounded hover:bg-surface-hover transition-all"
              onClick={(e) => { e.stopPropagation(); setPhaseMenuOpen((v) => !v) }}
              title="Move to window"
            >
              ···
            </button>
            {phaseMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPhaseMenuOpen(false)} />
                <div className="absolute right-0 top-5 bg-surface border border-border rounded-md shadow-lg z-50 py-1 min-w-[120px]">
                  <div className="px-2.5 py-1 text-xs text-text-dim font-medium">Move to</div>
                  {PHASES.map((phase) => (
                    <button
                      key={phase}
                      className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${
                        task.phase === phase
                          ? 'text-accent'
                          : 'text-text hover:bg-surface-hover'
                      }`}
                      onClick={() => {
                        updateTask(task.id, { phase }).then(() => rebundle(rateLimitState))
                        setPhaseMenuOpen(false)
                      }}
                    >
                      {PHASE_LABELS[phase]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {task.annotation && <AnnotationPill annotation={task.annotation} />}
      </div>
    </div>
  )
}
