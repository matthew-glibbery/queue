/**
 * Queue CC bridge daemon — runs locally as a launchd service.
 * Watches ~/.claude/projects/, subscribes to dispatching tasks, invokes claude CLI.
 *
 * Start: npm run daemon
 * Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, QUEUE_DEVICE_ID
 *
 * Register as launchd service (macOS):
 *   cp daemon/com.queue.daemon.plist ~/Library/LaunchAgents/
 *   launchctl load ~/Library/LaunchAgents/com.queue.daemon.plist
 */

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import { readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import chokidar from 'chokidar'
import { scanProjectFiles } from './fileScanner'
import { estimateTaskTokens } from '../src/lib/tokenEstimator'
import type { Task, Project, TaskProgress, ProgressStep } from '../shared/types'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

const DEVICE_ID = process.env.QUEUE_DEVICE_ID!
if (!DEVICE_ID) {
  console.error('[daemon] QUEUE_DEVICE_ID not set. Copy it from the Electron app DevTools → Local Storage → queue:device_id')
  process.exit(1)
}

const CC_PROJECTS_DIR = join(homedir(), '.claude', 'projects')

// ─── Project sync ──────────────────────────────────────────────────────────

async function readProjectPath(projectDir: string): Promise<string | null> {
  try {
    // Claude Code stores the mapped path as the directory name (URL-encoded)
    // e.g. -Users-dev-Documents-myproject → /Users/dev/Documents/myproject
    const dirName = basename(projectDir)
    return '/' + dirName.replace(/-/g, '/').replace(/^\//, '')
  } catch {
    return null
  }
}

async function syncProjects(): Promise<void> {
  let entries: string[]
  try {
    const dirents = await readdir(CC_PROJECTS_DIR, { withFileTypes: true })
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    console.warn(`[daemon] Cannot read ${CC_PROJECTS_DIR} — Claude Code not installed or no projects`)
    return
  }

  for (const entry of entries) {
    const projectPath = await readProjectPath(join(CC_PROJECTS_DIR, entry))
    if (!projectPath) continue

    const project: Omit<Project, 'activeTaskCount' | 'hasRunningTask'> & {
      active_task_count: number
      has_running_task: boolean
      device_id: string
    } = {
      id: `cc-${entry}`,
      device_id: DEVICE_ID,
      name: basename(projectPath),
      path: projectPath,
      active_task_count: 0,
      has_running_task: false,
      lastSyncedAt: Date.now(),
    }

    await supabase.from('projects').upsert(
      { ...project, last_synced_at: project.lastSyncedAt },
      { onConflict: 'id' }
    )
  }

  console.log(`[daemon] Synced ${entries.length} project(s)`)
}

function watchProjects(): void {
  const watcher = chokidar.watch(CC_PROJECTS_DIR, {
    depth: 0,
    ignoreInitial: false,
    persistent: true,
  })

  watcher.on('addDir', () => syncProjects().catch(console.error))
  watcher.on('unlinkDir', () => syncProjects().catch(console.error))
  watcher.on('error', (err) => console.error('[daemon] Watcher error:', err))
}

// ─── Progress parsing ──────────────────────────────────────────────────────

const MILESTONES: { step: ProgressStep; label: string; patterns: RegExp[] }[] = [
  {
    step: 'reading',
    label: 'Reading files',
    patterns: [/\breading\b/i, /\bopening\b/i, /\bexamining\b/i, /\blocating\b/i],
  },
  {
    step: 'planning',
    label: 'Planning',
    patterns: [/\bI'?ll\b/i, /\blet me\b/i, /\bI will\b/i, /\bmy plan\b/i, /\bapproach\b/i],
  },
  {
    step: 'editing',
    label: 'Editing',
    patterns: [/\bwriting\b/i, /\bediting\b/i, /\breplacing\b/i, /\bupdating\b/i, /\bmodifying\b/i],
  },
  {
    step: 'testing',
    label: 'Testing',
    patterns: [/\brunning\b/i, /\bexecuting\b/i, /\btesting\b/i, /\bverifying\b/i],
  },
  {
    step: 'done',
    label: 'Done',
    patterns: [/\bdone\b/i, /\bcomplete\b/i, /\bfinished\b/i, /\bsuccess\b/i],
  },
]

const FILE_PATTERN = /(?:writing|editing|updating|modifying|creating)\s+(?:file\s+)?`?([^\s`'"]+\.[a-z]{2,5})`?/i
const TOKEN_PATTERN = /(\d[\d,]+)\s+tokens?/i

interface ProgressState {
  percentage: number
  currentStep: ProgressStep
  currentFile?: string
  milestones: TaskProgress['milestones']
  completedSteps: Set<ProgressStep>
  activeStep: ProgressStep | null
  tokenCount: number
}

function makeInitialProgress(): ProgressState {
  return {
    percentage: 0,
    currentStep: 'reading',
    milestones: MILESTONES.map((m) => ({
      step: m.step,
      label: m.label,
      completed: false,
      active: m.step === 'reading',
    })),
    completedSteps: new Set(),
    activeStep: 'reading',
    tokenCount: 0,
  }
}

function parseLine(line: string, state: ProgressState, estimatedTokens: number): ProgressState {
  const next = { ...state, milestones: state.milestones.map((m) => ({ ...m })) }

  // Token count
  const tokenMatch = line.match(TOKEN_PATTERN)
  if (tokenMatch) {
    next.tokenCount = parseInt(tokenMatch[1].replace(/,/g, ''), 10)
  }

  // File being edited
  const fileMatch = line.match(FILE_PATTERN)
  if (fileMatch) next.currentFile = fileMatch[1]

  // Milestone detection
  for (const milestone of MILESTONES) {
    if (next.completedSteps.has(milestone.step)) continue
    if (milestone.patterns.some((p) => p.test(line))) {
      if (next.activeStep && next.activeStep !== milestone.step) {
        const prevIdx = next.milestones.findIndex((m) => m.step === next.activeStep)
        if (prevIdx !== -1) {
          next.milestones[prevIdx].completed = true
          next.milestones[prevIdx].active = false
          next.completedSteps = new Set([...next.completedSteps, next.activeStep])
        }
      }
      next.activeStep = milestone.step
      next.currentStep = milestone.step
      const idx = next.milestones.findIndex((m) => m.step === milestone.step)
      if (idx !== -1) {
        next.milestones[idx].active = true
        next.milestones[idx].completed = false
      }
      break
    }
  }

  // Progress percentage from token count, capped at 95% until done
  if (estimatedTokens > 0 && next.tokenCount > 0) {
    next.percentage = Math.min(Math.round((next.tokenCount / estimatedTokens) * 100), 95)
  }

  return next
}

// ─── Task dispatch ─────────────────────────────────────────────────────────

const runningTasks = new Set<string>()

async function getProjectPath(projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from('projects')
    .select('path')
    .eq('id', projectId)
    .single()
  return (data as { path: string } | null)?.path ?? null
}

async function executeTask(task: Task): Promise<void> {
  if (runningTasks.has(task.id)) return
  runningTasks.add(task.id)

  const projectPath = await getProjectPath(task.projectId)
  if (!projectPath) {
    await supabase.from('tasks').update({ status: 'failed' }).eq('id', task.id)
    runningTasks.delete(task.id)
    return
  }

  // Update estimated tokens with file context now that we're about to run
  const fileContext = await scanProjectFiles(projectPath, task.claudePrompt)
  const refined = estimateTaskTokens(task, fileContext)
  await supabase
    .from('tasks')
    .update({ status: 'running', started_at: Date.now(), estimated_tokens: refined })
    .eq('id', task.id)

  console.log(`[daemon] Running task "${task.title}" in ${projectPath}`)

  const proc = spawn('claude', ['-p', task.claudePrompt], {
    cwd: projectPath,
    env: process.env,
  })

  let progressState = makeInitialProgress()
  let outputBuffer = ''
  let finalTokens: number | null = null

  const flushProgress = async (state: ProgressState) => {
    const progress: TaskProgress = {
      percentage: state.percentage,
      currentStep: state.currentStep,
      currentFile: state.currentFile,
      milestones: state.milestones,
    }
    await supabase.from('tasks').update({ progress }).eq('id', task.id)
    await supabase.from('task_progress').insert({
      task_id: task.id,
      device_id: DEVICE_ID,
      percentage: state.percentage,
      current_step: state.currentStep,
      current_file: state.currentFile ?? null,
      milestones: state.milestones,
      recorded_at: Date.now(),
    })
  }

  // Throttled progress flush — at most once per second
  let flushTimer: NodeJS.Timeout | null = null
  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(async () => {
      flushTimer = null
      await flushProgress(progressState).catch(console.error)
    }, 1000)
  }

  proc.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    outputBuffer += text
    const lines = text.split('\n')
    for (const line of lines) {
      progressState = parseLine(line, progressState, refined)
      const tokenMatch = line.match(TOKEN_PATTERN)
      if (tokenMatch) finalTokens = parseInt(tokenMatch[1].replace(/,/g, ''), 10)
    }
    scheduleFlush()
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    console.error(`[daemon] claude stderr: ${chunk.toString()}`)
  })

  proc.on('close', async (code) => {
    if (flushTimer) clearTimeout(flushTimer)

    const status = code === 0 ? 'done' : 'failed'
    const actualTokens = finalTokens ?? refined

    // Mark final milestone done
    if (status === 'done') {
      progressState = parseLine('Done complete finished', progressState, refined)
      progressState.percentage = 100
      progressState.milestones = progressState.milestones.map((m) => ({
        ...m,
        completed: true,
        active: false,
      }))
    }

    await flushProgress(progressState).catch(console.error)
    await supabase
      .from('tasks')
      .update({
        status,
        actual_tokens: actualTokens,
        completed_at: Date.now(),
        progress: {
          percentage: progressState.percentage,
          currentStep: progressState.currentStep,
          currentFile: progressState.currentFile,
          milestones: progressState.milestones,
        },
      })
      .eq('id', task.id)

    runningTasks.delete(task.id)
    console.log(`[daemon] Task "${task.title}" ${status} (${actualTokens} tokens)`)
  })

  proc.on('error', async (err) => {
    console.error(`[daemon] Failed to spawn claude:`, err)
    await supabase.from('tasks').update({ status: 'failed' }).eq('id', task.id)
    runningTasks.delete(task.id)
  })
}

// ─── Subscribe to dispatching tasks ───────────────────────────────────────

function subscribeToDispatch(): void {
  supabase
    .channel('daemon:tasks')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'tasks',
        filter: `device_id=eq.${DEVICE_ID}`,
      },
      (payload) => {
        const row = payload.new as { id: string; status: string; [key: string]: unknown }
        if (row.status === 'dispatching') {
          const task: Task = {
            id: row.id as string,
            projectId: row.project_id as string,
            title: row.title as string,
            claudePrompt: row.claude_prompt as string,
            status: 'dispatching' as Task['status'],
            phase: row.phase as Task['phase'],
            queuePosition: row.queue_position as number,
            estimatedTokens: row.estimated_tokens as number,
            tags: [],
            createdAt: row.created_at as number,
          }
          executeTask(task).catch(console.error)
        }
      }
    )
    .subscribe((status) => {
      console.log(`[daemon] Realtime status: ${status}`)
    })
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[daemon] Starting Queue daemon for device ${DEVICE_ID}`)

  await syncProjects()
  watchProjects()
  subscribeToDispatch()

  // Pick up any tasks already in 'dispatching' state (e.g. after daemon restart)
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .eq('status', 'dispatching')

  if (data) {
    for (const row of data) {
      const task = row as unknown as Task & { claude_prompt: string; project_id: string; estimated_tokens: number; created_at: number; queue_position: number }
      executeTask({
        id: task.id,
        projectId: task.project_id,
        title: task.title,
        claudePrompt: task.claude_prompt,
        status: 'dispatching',
        phase: task.phase,
        queuePosition: task.queue_position,
        estimatedTokens: task.estimated_tokens,
        tags: [],
        createdAt: task.created_at,
      }).catch(console.error)
    }
  }

  console.log('[daemon] Ready')
  process.on('SIGINT', () => {
    console.log('[daemon] Shutting down')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[daemon] Fatal error:', err)
  process.exit(1)
})
