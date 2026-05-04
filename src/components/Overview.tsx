import React from 'react'
import { useQueueStore } from '../store/queueStore'
import { useProjectStore } from '../store/projectStore'
import { useRateLimit } from '../hooks/useRateLimit'
import { useDragReorder } from '../hooks/useDragReorder'
import { PhaseRow } from './PhaseRow'
import type { Task, TaskPhase } from '@shared/types'

const PHASE_ORDER: TaskPhase[] = ['current_window', 'next_window', 'future']

interface OverviewProps {
  onBack: () => void
  onSelectProject: (projectId: string) => void
}

export function Overview({ onBack, onSelectProject }: OverviewProps) {
  const tasks = useQueueStore((s) => s.tasks)
  const projects = useProjectStore((s) => s.projects)
  const { setActiveProject } = useProjectStore()
  const { usedTokens, maxTokens, availableTokens, countdown } = useRateLimit() as ReturnType<typeof useRateLimit> & { countdown?: string }
  const drag = useDragReorder()

  const queuedTasks = tasks.filter((t) => t.status === 'queued')
  const runningTasks = tasks.filter((t) => t.status === 'running')
  const totalActive = projects.reduce((n, p) => n + p.activeTaskCount, 0)

  function handleSelectProject(projectId: string) {
    setActiveProject(projectId)
    onSelectProject(projectId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <button onClick={onBack} className="text-text-dim hover:text-text transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-xs font-semibold text-text tracking-wide flex-1">Overview</span>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-3 gap-px bg-border border-b border-border">
        <Stat label="Tasks" value={String(totalActive)} />
        <Stat label="Running" value={String(runningTasks.length)} accent={runningTasks.length > 0} />
        <Stat label="Projects" value={String(projects.length)} />
      </div>

      {/* Global rate bar */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex justify-between text-xs text-text-dim mb-1">
          <span>{(usedTokens / 1000).toFixed(0)}k / {(maxTokens / 1000).toFixed(0)}k tokens</span>
          <span>{(availableTokens / 1000).toFixed(0)}k free</span>
        </div>
        <div className="h-1 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full"
            style={{ width: `${Math.min((usedTokens / maxTokens) * 100, 100)}%`, transition: 'width 300ms ease' }}
          />
        </div>
      </div>

      {/* Project cards */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {projects.map((project) => {
            const projectTasks = queuedTasks.filter((t) => t.projectId === project.id)
            const running = runningTasks.find((t) => t.projectId === project.id)
            const projectTokens = projectTasks.reduce((n, t) => n + t.estimatedTokens, 0)
            const tokenPct = maxTokens > 0 ? (projectTokens / maxTokens) * 100 : 0

            return (
              <button
                key={project.id}
                className="text-left bg-surface border border-border rounded-lg p-2.5 hover:bg-surface-hover transition-colors"
                onClick={() => handleSelectProject(project.id)}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {running && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-text truncate">{project.name}</span>
                </div>

                {/* Mini queue */}
                <div className="space-y-1 mb-2">
                  {projectTasks.slice(0, 3).map((task) => (
                    <p key={task.id} className="text-xs text-text-dim truncate leading-tight">
                      {task.title}
                    </p>
                  ))}
                  {projectTasks.length > 3 && (
                    <p className="text-xs text-text-dim">+{projectTasks.length - 3} more</p>
                  )}
                  {projectTasks.length === 0 && !running && (
                    <p className="text-xs text-text-dim">No queued tasks</p>
                  )}
                </div>

                {/* Mini token bar */}
                <div className="h-0.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/60 rounded-full"
                    style={{ width: `${Math.min(tokenPct, 100)}%` }}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {/* Global queue — grouped by phase */}
        {queuedTasks.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-text-dim font-medium">All tasks</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {(() => {
              const sorted = [...queuedTasks].sort((a, b) => a.queuePosition - b.queuePosition)
              const preview = drag.getPreviewOrder(sorted)
              let globalIdx = 0
              return PHASE_ORDER.map((phase) => {
                const phaseTasks = preview.filter((t) => t.phase === phase)
                if (phaseTasks.length === 0) return null
                return (
                  <React.Fragment key={phase}>
                    <PhaseRow phase={phase} />
                    <div className="space-y-0.5 mb-1">
                      {phaseTasks.map((task) => {
                        const idx = globalIdx++
                        return (
                          <GlobalQueueRow key={task.id} task={task} index={idx} allTasks={sorted} drag={drag} />
                        )
                      })}
                    </div>
                  </React.Fragment>
                )
              })
            })()}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-bg flex flex-col items-center py-2">
      <span className={`text-sm font-semibold ${accent ? 'text-accent' : 'text-text'}`}>{value}</span>
      <span className="text-xs text-text-dim">{label}</span>
    </div>
  )
}

function GlobalQueueRow({
  task,
  index,
  allTasks,
  drag,
}: {
  task: Task
  index: number
  allTasks: Task[]
  drag: ReturnType<typeof useDragReorder>
}) {
  const projects = useProjectStore((s) => s.projects)
  const project = projects.find((p) => p.id === task.projectId)

  const isDragging = drag.draggedId === task.id
  const isDropTarget = drag.dragOverId === task.id && drag.draggedId !== task.id

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors group ${
        isDragging ? 'opacity-30' : 'hover:bg-surface'
      } ${isDropTarget ? 'border-t-2 border-accent' : 'border-t-2 border-transparent'}`}
      draggable
      onDragStart={drag.onDragStart(task.id)}
      onDragEnter={drag.onDragEnter(task.id)}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop(allTasks)}
      onDragEnd={drag.onDragEnd}
    >
      <span className="w-4 text-xs text-text-dim text-right flex-shrink-0">{index + 1}</span>
      <p className="flex-1 text-xs text-text truncate">{task.title}</p>
      {project && (
        <span className="text-xs text-text-dim bg-surface px-1.5 py-0.5 rounded flex-shrink-0">
          {project.name}
        </span>
      )}
    </div>
  )
}
