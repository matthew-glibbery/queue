import { createClient } from '@supabase/supabase-js'
import type { Task, Project } from '@shared/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

// ─── Row types (Supabase returns snake_case) ────────────────────────────────

export interface TaskRow {
  id: string
  device_id: string
  project_id: string
  title: string
  claude_prompt: string
  status: string
  phase: string
  queue_position: number
  estimated_tokens: number
  actual_tokens: number | null
  progress: unknown | null
  annotation: unknown | null
  tags: string[]
  created_at: number
  started_at: number | null
  completed_at: number | null
}

export interface ProjectRow {
  id: string
  device_id: string
  name: string
  path: string
  description?: string | null
  active_task_count: number
  has_running_task: boolean
  last_synced_at: number
}

// ─── Converters ─────────────────────────────────────────────────────────────

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    claudePrompt: row.claude_prompt,
    status: row.status as Task['status'],
    phase: row.phase as Task['phase'],
    queuePosition: row.queue_position,
    estimatedTokens: row.estimated_tokens,
    actualTokens: row.actual_tokens ?? undefined,
    progress: (row.progress as Task['progress']) ?? undefined,
    annotation: (row.annotation as Task['annotation']) ?? undefined,
    tags: row.tags,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

export function taskToRow(task: Task, deviceId: string): TaskRow {
  return {
    id: task.id,
    device_id: deviceId,
    project_id: task.projectId,
    title: task.title,
    claude_prompt: task.claudePrompt,
    status: task.status,
    phase: task.phase,
    queue_position: task.queuePosition,
    estimated_tokens: task.estimatedTokens,
    actual_tokens: task.actualTokens ?? null,
    progress: task.progress ?? null,
    annotation: task.annotation ?? null,
    tags: task.tags,
    created_at: task.createdAt,
    started_at: task.startedAt ?? null,
    completed_at: task.completedAt ?? null,
  }
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description ?? undefined,
    activeTaskCount: row.active_task_count,
    hasRunningTask: row.has_running_task,
    lastSyncedAt: row.last_synced_at,
  }
}

export function projectToRow(project: Project, deviceId: string): ProjectRow {
  return {
    id: project.id,
    device_id: deviceId,
    name: project.name,
    path: project.path,
    description: project.description ?? null,
    active_task_count: project.activeTaskCount,
    has_running_task: project.hasRunningTask,
    last_synced_at: project.lastSyncedAt,
  }
}
