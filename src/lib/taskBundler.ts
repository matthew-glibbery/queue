import type { Task, TaskPhase, RateLimitState, PhaseBundle } from '@shared/types'

export function getAvailableTokens(state: RateLimitState): number {
  const buffer = state.gitBufferEnabled ? state.gitBufferTokens : 0
  return Math.max(0, state.maxTokens - state.usedTokens - buffer)
}

/**
 * Assigns current_window / next_window / future phases to queued tasks.
 * Non-queued tasks (running, done, failed, skipped) are returned unchanged.
 *
 * Bin-packing logic:
 *   current_window — tasks that fit in remaining tokens this window
 *   next_window    — tasks that fit in a fresh full window (after reset)
 *   future         — tasks that exceed even a full window
 */
export function assignPhases(tasks: Task[], state: RateLimitState): Task[] {
  const available = getAvailableTokens(state)

  const queued = tasks
    .filter((t) => t.status === 'queued')
    .sort((a, b) => a.queuePosition - b.queuePosition)
  const nonQueued = tasks.filter((t) => t.status !== 'queued')

  let currentAccum = 0
  let nextAccum = 0

  const rephasedQueued = queued.map((task) => {
    if (currentAccum + task.estimatedTokens <= available) {
      currentAccum += task.estimatedTokens
      return { ...task, phase: 'current_window' as TaskPhase }
    }
    if (nextAccum + task.estimatedTokens <= state.maxTokens) {
      nextAccum += task.estimatedTokens
      return { ...task, phase: 'next_window' as TaskPhase }
    }
    return { ...task, phase: 'future' as TaskPhase }
  })

  return [...nonQueued, ...rephasedQueued]
}

/**
 * Returns tasks grouped into PhaseBundle objects for rendering.
 * Call assignPhases first to get correctly phased tasks, then pass them here.
 */
export function bundleTasks(tasks: Task[], state: RateLimitState): PhaseBundle[] {
  const phasedTasks = assignPhases(tasks, state)
  const available = getAvailableTokens(state)

  const phases: TaskPhase[] = ['current_window', 'next_window', 'future']
  return phases.map((phase) => {
    const phaseTasks = phasedTasks
      .filter((t) => t.phase === phase && t.status === 'queued')
      .sort((a, b) => a.queuePosition - b.queuePosition)

    const totalEstimatedTokens = phaseTasks.reduce((sum, t) => sum + t.estimatedTokens, 0)

    return {
      phase,
      tasks: phaseTasks,
      totalEstimatedTokens,
      fitsInCurrentWindow: totalEstimatedTokens <= available,
    }
  })
}
