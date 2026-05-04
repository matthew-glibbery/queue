import React from 'react'
import { useQueueStore } from '../store/queueStore'
import { useProjectStore } from '../store/projectStore'
import { useDragReorder } from '../hooks/useDragReorder'
import { NowRunning } from './NowRunning'
import { PhaseRow } from './PhaseRow'
import { QueueItem } from './QueueItem'
import type { TaskPhase } from '@shared/types'

const PHASE_ORDER: TaskPhase[] = ['current_window', 'next_window', 'future']

interface QueueListProps {
  showCompleted?: boolean
}

export function QueueList({ showCompleted = false }: QueueListProps) {
  const tasks = useQueueStore((s) => s.tasks)
  const { activeProjectId } = useProjectStore()
  const drag = useDragReorder()

  // Filter by active project when one is selected
  const allQueued = tasks
    .filter((t) => t.status === 'queued')
    .sort((a, b) => a.queuePosition - b.queuePosition)

  const queuedTasks = activeProjectId
    ? allQueued.filter((t) => t.projectId === activeProjectId)
    : allQueued

  // Apply live preview reorder during drag
  const displayTasks = drag.getPreviewOrder(queuedTasks)

  const tasksByPhase = PHASE_ORDER.reduce<Record<TaskPhase, typeof displayTasks>>(
    (acc, phase) => {
      acc[phase] = displayTasks.filter((t) => t.phase === phase)
      return acc
    },
    { current_window: [], next_window: [], future: [] }
  )

  const completedTasks = showCompleted && activeProjectId
    ? tasks
        .filter((t) => t.projectId === activeProjectId && (t.status === 'done' || t.status === 'failed' || t.status === 'skipped'))
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    : []

  return (
    <div className="flex-1 overflow-y-auto">
      <NowRunning />

      {PHASE_ORDER.map((phase) => {
        const phaseTasks = tasksByPhase[phase]
        if (phaseTasks.length === 0) return null

        return (
          <React.Fragment key={phase}>
            <PhaseRow phase={phase} />
            {phaseTasks.map((task, idx) => (
              <QueueItem
                key={task.id}
                task={task}
                index={idx}
                allTasks={queuedTasks}
                drag={drag}
              />
            ))}
          </React.Fragment>
        )
      })}

      {queuedTasks.length === 0 && !showCompleted && (
        <div className="flex items-center justify-center h-24 text-text-dim text-sm">
          Queue is empty
        </div>
      )}

      {completedTasks.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 mt-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium text-text-dim tracking-wide">Completed</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {completedTasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2 px-3 py-2 opacity-50">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 mt-0.5">
                <circle cx="6" cy="6" r="5.5" stroke="#30d158" />
                <path d="M3.5 6L5.5 8L8.5 4" stroke="#30d158" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="flex-1 text-xs text-text line-through leading-snug">{task.title}</span>
              {task.actualTokens && (
                <span className="text-xs text-text-dim flex-shrink-0">
                  {(task.actualTokens / 1000).toFixed(1)}k
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {showCompleted && completedTasks.length === 0 && queuedTasks.length === 0 && (
        <div className="flex items-center justify-center h-24 text-text-dim text-sm">
          No completed tasks
        </div>
      )}
    </div>
  )
}
