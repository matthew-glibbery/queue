import { create } from 'zustand'
import type { Task, RateLimitState } from '@shared/types'
import { supabase, rowToTask, taskToRow, type TaskRow } from '../lib/supabase'
import { getDeviceId } from '../lib/deviceId'
import { assignPhases } from '../lib/taskBundler'
import { MOCK_TASKS } from '../lib/mockData'

interface QueueState {
  tasks: Task[]
  initialized: boolean
  initialize: () => Promise<void>
  rebundle: (rateLimitState: RateLimitState) => void
  addTask: (task: Task) => Promise<void>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  removeTask: (id: string) => Promise<void>
  reorderTasks: (taskIds: string[]) => Promise<void>
}

export const useQueueStore = create<QueueState>((set, get) => ({
  tasks: [],
  initialized: false,

  rebundle: (rateLimitState) => {
    set((state) => ({ tasks: assignPhases(state.tasks, rateLimitState) }))
  },

  initialize: async () => {
    if (get().initialized) return

    if (!supabase) {
      set({ tasks: MOCK_TASKS, initialized: true })
      return
    }

    const deviceId = getDeviceId()
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('device_id', deviceId)
      .order('queue_position')

    const hasTasks = data && data.length > 0
    set({ tasks: hasTasks ? data.map((r) => rowToTask(r as TaskRow)) : MOCK_TASKS, initialized: true })

    supabase
      .channel('queue:tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            set((state) => ({ tasks: [...state.tasks, rowToTask(payload.new as TaskRow)] }))
          } else if (payload.eventType === 'UPDATE') {
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === (payload.new as TaskRow).id ? rowToTask(payload.new as TaskRow) : t
              ),
            }))
          } else if (payload.eventType === 'DELETE') {
            set((state) => ({
              tasks: state.tasks.filter((t) => t.id !== (payload.old as TaskRow).id),
            }))
          }
        }
      )
      .subscribe()
  },

  addTask: async (task) => {
    set((state) => ({ tasks: [...state.tasks, task] }))
    if (supabase) {
      await supabase.from('tasks').insert(taskToRow(task, getDeviceId()))
    }
  },

  updateTask: async (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
    if (supabase) {
      const row: Partial<TaskRow> = {}
      if (updates.status !== undefined) row.status = updates.status
      if (updates.phase !== undefined) row.phase = updates.phase
      if (updates.queuePosition !== undefined) row.queue_position = updates.queuePosition
      if (updates.estimatedTokens !== undefined) row.estimated_tokens = updates.estimatedTokens
      if (updates.actualTokens !== undefined) row.actual_tokens = updates.actualTokens
      if (updates.progress !== undefined) row.progress = updates.progress
      if (updates.annotation !== undefined) row.annotation = updates.annotation
      if (updates.startedAt !== undefined) row.started_at = updates.startedAt
      if (updates.completedAt !== undefined) row.completed_at = updates.completedAt
      await supabase.from('tasks').update(row).eq('id', id)
    }
  },

  removeTask: async (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))
    if (supabase) {
      await supabase.from('tasks').delete().eq('id', id)
    }
  },

  reorderTasks: async (taskIds) => {
    set((state) => {
      const taskMap = new Map(state.tasks.map((t) => [t.id, t]))
      const reordered = taskIds
        .map((id, idx) => {
          const task = taskMap.get(id)
          return task ? { ...task, queuePosition: idx } : null
        })
        .filter(Boolean) as Task[]
      return { tasks: reordered }
    })
    if (supabase) {
      await Promise.all(
        taskIds.map((id, idx) =>
          supabase!.from('tasks').update({ queue_position: idx }).eq('id', id)
        )
      )
    }
  },
}))
