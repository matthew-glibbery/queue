export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'
export type TaskPhase = 'current_window' | 'next_window' | 'future'
export type ProgressStep = 'reading' | 'planning' | 'editing' | 'testing' | 'done'

export interface TaskProgress {
  percentage: number
  currentStep: ProgressStep
  milestones: ProgressMilestone[]
  currentFile?: string
}

export interface ProgressMilestone {
  step: ProgressStep
  label: string
  completed: boolean
  active: boolean
}

export interface Task {
  id: string
  projectId: string
  title: string
  claudePrompt: string
  status: TaskStatus
  phase: TaskPhase
  queuePosition: number
  estimatedTokens: number
  actualTokens?: number
  progress?: TaskProgress
  annotation?: BrowserAnnotation
  tags: string[]
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface Project {
  id: string
  name: string
  path: string
  description?: string
  activeTaskCount: number
  hasRunningTask: boolean
  lastSyncedAt: number
}

export interface RateLimitState {
  usedTokens: number
  maxTokens: number
  resetAt: number
  gitBufferEnabled: boolean
  gitBufferTokens: number
}

export interface BrowserAnnotation {
  url: string
  elementSelector: string
  elementLabel: string
  screenshotDataUrl: string
  consoleErrors: string[]
  networkErrors: string[]
  userNote: string
  capturedAt: number
}

export interface PhaseBundle {
  phase: TaskPhase
  tasks: Task[]
  totalEstimatedTokens: number
  fitsInCurrentWindow: boolean
}
