import type { Project, Task } from '@shared/types'

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'queue',
    path: '/Users/dev/Documents/queue',
    description: 'Claude Code companion for task queuing and rate-limit management with mobile sync.',
    activeTaskCount: 3,
    hasRunningTask: true,
    lastSyncedAt: Date.now(),
  },
  {
    id: 'proj-2',
    name: 'portfolio',
    path: '/Users/dev/Documents/portfolio',
    description: 'Personal portfolio site with case studies and project showcases.',
    activeTaskCount: 1,
    hasRunningTask: false,
    lastSyncedAt: Date.now(),
  },
  {
    id: 'proj-3',
    name: 'ai-writing-editor',
    path: '/Users/dev/Documents/ai-writing-editor',
    description: 'AI-assisted writing tool with dark mode and real-time suggestions.',
    activeTaskCount: 1,
    hasRunningTask: false,
    lastSyncedAt: Date.now(),
  },
]

export const MOCK_TASKS: Task[] = [
  {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Add drag-to-reorder for queue items',
    claudePrompt:
      'Implement HTML5 drag-and-drop reordering for QueueItem components. On drop, update queuePosition values in SQLite and sync Zustand store. Use useDragReorder hook.',
    status: 'running',
    phase: 'current_window',
    queuePosition: 0,
    estimatedTokens: 8400,
    progress: {
      percentage: 62,
      currentStep: 'editing',
      currentFile: 'src/hooks/useDragReorder.ts',
      milestones: [
        { step: 'reading', label: 'Reading files', completed: true, active: false },
        { step: 'planning', label: 'Planning', completed: true, active: false },
        { step: 'editing', label: 'Editing', completed: false, active: true },
        { step: 'testing', label: 'Testing', completed: false, active: false },
        { step: 'done', label: 'Done', completed: false, active: false },
      ],
    },
    tags: ['ui', 'interaction'],
    createdAt: Date.now() - 120000,
    startedAt: Date.now() - 60000,
  },
  {
    id: 'task-2',
    projectId: 'proj-1',
    title: 'Wire up rate limit bar to live token data',
    claudePrompt:
      'Connect RateLimitBar component to rateLimitStore. Animate bar width on token updates. Add reset countdown timer.',
    status: 'queued',
    phase: 'current_window',
    queuePosition: 1,
    estimatedTokens: 5200,
    tags: ['ui', 'rate-limit'],
    createdAt: Date.now() - 90000,
  },
  {
    id: 'task-3',
    projectId: 'proj-2',
    title: 'Fix mobile layout on case study pages',
    claudePrompt:
      'The case study grid breaks on screens below 640px. Fix responsive layout in CaseStudyGrid.tsx. Use CSS grid with auto-fill columns.',
    status: 'queued',
    phase: 'current_window',
    queuePosition: 2,
    estimatedTokens: 3800,
    tags: ['bug', 'responsive'],
    createdAt: Date.now() - 80000,
  },
  {
    id: 'task-4',
    projectId: 'proj-1',
    title: 'Build slide menu with project switcher',
    claudePrompt:
      'Implement SlideMenu component. Panel slides in from left with CSS transform, main content shifts right. 200ms cubic-bezier transition.',
    status: 'queued',
    phase: 'next_window',
    queuePosition: 3,
    estimatedTokens: 12000,
    tags: ['ui', 'navigation'],
    createdAt: Date.now() - 70000,
  },
  {
    id: 'task-5',
    projectId: 'proj-3',
    title: 'Add dark mode toggle with system preference detection',
    claudePrompt:
      'Add dark/light mode toggle. Detect system preference via prefers-color-scheme. Persist to localStorage. Apply CSS variables for theme tokens.',
    status: 'queued',
    phase: 'future',
    queuePosition: 4,
    estimatedTokens: 6500,
    tags: ['ui', 'theming'],
    createdAt: Date.now() - 60000,
  },
]
