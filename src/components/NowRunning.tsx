import React from 'react'
import { useQueueStore } from '../store/queueStore'
import { useProjectStore } from '../store/projectStore'
import { ProgressBar } from './ProgressBar'

export function NowRunning() {
  const tasks = useQueueStore((s) => s.tasks)
  const projects = useProjectStore((s) => s.projects)

  const runningTask = tasks.find((t) => t.status === 'running')
  if (!runningTask) return null

  const project = projects.find((p) => p.id === runningTask.projectId)

  return (
    <div className="mx-3 mt-3 p-3 rounded-lg bg-surface border border-accent/30">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
            <span className="text-xs text-accent font-medium">Running</span>
          </div>
          <p className="text-sm text-text font-medium leading-snug">{runningTask.title}</p>
          {project && (
            <span className="text-xs text-text-dim">{project.name}</span>
          )}
        </div>
      </div>

      {runningTask.progress && <ProgressBar progress={runningTask.progress} />}
    </div>
  )
}
