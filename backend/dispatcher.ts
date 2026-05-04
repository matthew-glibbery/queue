/**
 * Queue dispatcher — runs on Railway.
 * Manages rate limits, assigns phases, and signals the local daemon when to dispatch.
 *
 * Deploy: Railway → connect repo → root directory → set env vars → start command: npm run dispatcher
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { assignPhases, getAvailableTokens } from '../src/lib/taskBundler'
import type { Task, RateLimitState } from '../shared/types'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Per-device in-memory rate limit state ────────────────────────────────

const WINDOW_DURATION = 5 * 60 * 60 * 1000 // 5 hours

interface DeviceWindow {
  usedTokens: number
  windowStart: number
  resetAt: number
}

const deviceWindows = new Map<string, DeviceWindow>()

function getDeviceWindow(deviceId: string): DeviceWindow {
  if (!deviceWindows.has(deviceId)) {
    const windowStart = Date.now()
    deviceWindows.set(deviceId, {
      usedTokens: 0,
      windowStart,
      resetAt: windowStart + WINDOW_DURATION,
    })
  }
  const win = deviceWindows.get(deviceId)!
  if (Date.now() > win.resetAt) {
    const newStart = win.resetAt
    win.usedTokens = 0
    win.windowStart = newStart
    win.resetAt = newStart + WINDOW_DURATION
    console.log(`[dispatcher] Rate limit window reset for device ${deviceId}`)
  }
  return win
}

// ─── Settings ─────────────────────────────────────────────────────────────

interface Settings {
  maxTokens: number
  gitBufferEnabled: boolean
  gitBufferTokens: number
}

let cachedSettings: Settings = {
  maxTokens: 100000,
  gitBufferEnabled: true,
  gitBufferTokens: 5000,
}

async function loadSettings(): Promise<void> {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['maxTokensPerWindow', 'gitBufferEnabled', 'gitBufferTokens'])
  if (!data) return
  const map = Object.fromEntries(data.map((r: { key: string; value: string }) => [r.key, r.value]))
  cachedSettings = {
    maxTokens: map.maxTokensPerWindow ? Number(map.maxTokensPerWindow) : cachedSettings.maxTokens,
    gitBufferEnabled:
      map.gitBufferEnabled !== undefined
        ? map.gitBufferEnabled === 'true'
        : cachedSettings.gitBufferEnabled,
    gitBufferTokens: map.gitBufferTokens
      ? Number(map.gitBufferTokens)
      : cachedSettings.gitBufferTokens,
  }
}

function buildRateLimitState(deviceId: string): RateLimitState {
  const win = getDeviceWindow(deviceId)
  return {
    usedTokens: win.usedTokens,
    maxTokens: cachedSettings.maxTokens,
    resetAt: win.resetAt,
    gitBufferEnabled: cachedSettings.gitBufferEnabled,
    gitBufferTokens: cachedSettings.gitBufferTokens,
  }
}

// ─── Task row helpers ─────────────────────────────────────────────────────

interface TaskRow {
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
}

function rowToTask(row: TaskRow): Task {
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
    tags: [],
    createdAt: 0,
  }
}

// ─── Phase assignment ──────────────────────────────────────────────────────

async function rebundleDevice(deviceId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('id, device_id, project_id, title, claude_prompt, status, phase, queue_position, estimated_tokens, actual_tokens')
    .eq('device_id', deviceId)
    .order('queue_position')

  if (!data || data.length === 0) return []

  const tasks = data.map((r) => rowToTask(r as TaskRow))
  const rateLimitState = buildRateLimitState(deviceId)
  const rephasedTasks = assignPhases(tasks, rateLimitState)

  // Batch-write phase updates only for tasks that changed
  const updates = rephasedTasks.filter((t, i) => t.phase !== tasks[i].phase)
  await Promise.all(
    updates.map((t) => supabase.from('tasks').update({ phase: t.phase }).eq('id', t.id))
  )

  return rephasedTasks
}

// ─── Dispatch logic ────────────────────────────────────────────────────────

const dispatching = new Set<string>() // task IDs currently being dispatched

async function attemptDispatch(deviceId: string): Promise<void> {
  const tasks = await rebundleDevice(deviceId)
  const rateLimitState = buildRateLimitState(deviceId)
  const available = getAvailableTokens(rateLimitState)

  if (available <= 0) {
    const win = getDeviceWindow(deviceId)
    const waitMs = win.resetAt - Date.now()
    console.log(
      `[dispatcher] Device ${deviceId} at rate limit — next window in ${Math.round(waitMs / 60000)}m`
    )
    return
  }

  const nextTask = tasks.find(
    (t) =>
      t.status === 'queued' &&
      t.phase === 'current_window' &&
      !dispatching.has(t.id)
  )

  if (!nextTask) return

  dispatching.add(nextTask.id)
  console.log(`[dispatcher] Dispatching task ${nextTask.id} "${nextTask.title}" to device ${deviceId}`)

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'dispatching' })
    .eq('id', nextTask.id)

  if (error) {
    dispatching.delete(nextTask.id)
    console.error(`[dispatcher] Failed to update task status:`, error)
  }
}

// ─── On task completion ────────────────────────────────────────────────────

async function handleTaskComplete(row: TaskRow): Promise<void> {
  dispatching.delete(row.id)

  const tokens = row.actual_tokens ?? row.estimated_tokens
  const win = getDeviceWindow(row.device_id)
  win.usedTokens += tokens

  await supabase.from('rate_limit_snapshots').insert({
    device_id: row.device_id,
    used_tokens: tokens,
    max_tokens: cachedSettings.maxTokens,
    reset_at: win.resetAt,
    recorded_at: Date.now(),
  })

  console.log(
    `[dispatcher] Task ${row.id} complete — ${tokens} tokens used, ` +
    `${win.usedTokens}/${cachedSettings.maxTokens} total for device ${row.device_id}`
  )

  await attemptDispatch(row.device_id)
}

// ─── Startup: reconstruct window state from recent snapshots ───────────────

async function reconstructWindowState(): Promise<void> {
  const windowStart = Date.now() - WINDOW_DURATION
  const { data } = await supabase
    .from('rate_limit_snapshots')
    .select('device_id, used_tokens, reset_at')
    .gt('recorded_at', windowStart)

  if (!data) return

  for (const row of data as { device_id: string; used_tokens: number; reset_at: number }[]) {
    const win = getDeviceWindow(row.device_id)
    win.usedTokens += row.used_tokens
    if (row.reset_at > win.resetAt) win.resetAt = row.reset_at
  }

  console.log(`[dispatcher] Reconstructed window state for ${deviceWindows.size} device(s)`)
}

// ─── Realtime subscription ─────────────────────────────────────────────────

function subscribeToTasks(): RealtimeChannel {
  return supabase
    .channel('dispatcher:tasks')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'tasks' },
      (payload) => {
        const row = payload.new as TaskRow
        if (row.status === 'queued') {
          attemptDispatch(row.device_id).catch(console.error)
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tasks' },
      (payload) => {
        const row = payload.new as TaskRow
        if (row.status === 'done' || row.status === 'failed') {
          handleTaskComplete(row).catch(console.error)
        }
      }
    )
    .subscribe((status) => {
      console.log(`[dispatcher] Realtime status: ${status}`)
    })
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[dispatcher] Starting Queue dispatcher...')
  await loadSettings()
  await reconstructWindowState()
  subscribeToTasks()

  // Attempt dispatch for any devices with pending queued tasks on startup
  const { data } = await supabase
    .from('tasks')
    .select('device_id')
    .eq('status', 'queued')
  if (data) {
    const deviceIds = [...new Set((data as { device_id: string }[]).map((r) => r.device_id))]
    for (const deviceId of deviceIds) {
      await attemptDispatch(deviceId)
    }
  }

  console.log('[dispatcher] Ready')
  // Keep process alive
  process.on('SIGINT', () => {
    console.log('[dispatcher] Shutting down')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[dispatcher] Fatal error:', err)
  process.exit(1)
})
