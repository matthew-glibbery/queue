# Queue — Technical Specification
*Claude Code companion for intelligent task queuing, rate limit management, and project orchestration*

---

## Overview

Queue is a cross-platform Electron desktop app that floats above all other windows. It connects to Claude Code, reads active projects, manages a task queue, and automatically dispatches work while staying within Claude's rate limits. It includes a Chrome/Safari browser extension for annotating locally-running apps, and a voice-to-task input pipeline.

This document is structured for incremental delivery. Each phase is independently shippable and testable.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | Electron 30+ | Always-on-top overlay, system tray, IPC, cross-platform |
| Frontend | React 18 + Vite | Fast dev loop, component model |
| Styling | Tailwind CSS + CSS vars | Utility-first, consistent tokens |
| State | Zustand | Lightweight, no boilerplate |
| Persistence | SQLite via `better-sqlite3` | Local, fast, no server needed |
| Claude Code bridge | Node `chokidar` file watcher + stdout pipe | Watch CC session files and stream output |
| Claude API | Anthropic SDK (`@anthropic-ai/sdk`) | Task dispatch, project description parsing |
| Voice | Web Speech API (primary) / Whisper API (fallback) | In-Electron mic access |
| Browser extension | Chrome Manifest V3 + Safari Web Extension | Annotation capture |
| Extension ↔ App IPC | Local WebSocket server (`ws`) on port 54321 | Extension connects to Electron app |
| Git | `simple-git` npm package | Commit buffer trigger |

---

## Repository Structure

```
queue/
├── electron/
│   ├── main.ts               # Electron entry, window creation, IPC handlers
│   ├── preload.ts            # Context bridge (renderer ↔ main)
│   ├── tray.ts               # System tray icon + menu
│   ├── windowManager.ts      # Always-on-top, workspace pinning
│   ├── wsServer.ts           # WebSocket server for browser extension
│   └── claudeCodeBridge.ts   # Reads CC project state, pipes output
├── src/
│   ├── App.tsx
│   ├── store/
│   │   ├── queueStore.ts     # Tasks, ordering, phase assignment
│   │   ├── projectStore.ts   # Projects synced from Claude Code
│   │   ├── rateLimitStore.ts # Token tracking, reset timer
│   │   └── sessionStore.ts   # Current running task, progress
│   ├── components/
│   │   ├── TitleBar.tsx
│   │   ├── SlideMenu.tsx
│   │   ├── RateLimitBar.tsx
│   │   ├── NowRunning.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── QueueList.tsx
│   │   ├── QueueItem.tsx
│   │   ├── PhaseRow.tsx
│   │   ├── AnnotationPill.tsx
│   │   ├── TaskInput.tsx
│   │   ├── VoiceButton.tsx
│   │   └── DescribeProject.tsx
│   ├── hooks/
│   │   ├── useRateLimit.ts
│   │   ├── useVoiceInput.ts
│   │   ├── useDragReorder.ts
│   │   └── useClaudeCodeSync.ts
│   └── lib/
│       ├── taskBundler.ts    # Groups tasks into phases by token budget
│       ├── tokenEstimator.ts # Pre-run token cost estimation
│       ├── projectParser.ts  # NL description → structured tasks via Claude API
│       └── db.ts             # SQLite read/write helpers
├── extension/
│   ├── manifest.json
│   ├── background.ts         # Service worker, WS connection to app
│   ├── content.ts            # Injected overlay, element picker
│   └── popup/                # Extension popup UI
├── shared/
│   └── types.ts              # Shared types across electron/src/extension
└── package.json
```

---

## Data Models

```typescript
// shared/types.ts

type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'
type TaskPhase = 'current_window' | 'next_window' | 'future'

interface Task {
  id: string
  projectId: string
  title: string              // Lay-person summary, e.g. "Fix checkout button on mobile"
  claudePrompt: string       // Full technical prompt sent to Claude Code
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

interface TaskProgress {
  percentage: number         // 0–100, derived from token stream
  currentStep: ProgressStep
  milestones: ProgressMilestone[]
  currentFile?: string
}

type ProgressStep = 'reading' | 'planning' | 'editing' | 'testing' | 'done'

interface ProgressMilestone {
  step: ProgressStep
  label: string
  completed: boolean
  active: boolean
}

interface Project {
  id: string
  name: string
  path: string               // Local filesystem path, from Claude Code
  activeTaskCount: number
  hasRunningTask: boolean
  lastSyncedAt: number
}

interface RateLimitState {
  usedTokens: number
  maxTokens: number          // Default 100k, configurable
  resetAt: number            // Unix ms timestamp
  gitBufferEnabled: boolean
  gitBufferTokens: number    // Tokens reserved for commit (default 5k)
}

interface BrowserAnnotation {
  url: string
  elementSelector: string    // CSS selector path
  elementLabel: string       // Human-readable, e.g. "Checkout button"
  screenshotDataUrl: string  // Base64 PNG of cropped area
  consoleErrors: string[]
  networkErrors: string[]
  userNote: string
  capturedAt: number
}

interface PhaseBundle {
  phase: TaskPhase
  tasks: Task[]
  totalEstimatedTokens: number
  fitsInCurrentWindow: boolean
}
```

---

## Phase 1 — Foundation

**Goal:** Working Electron shell with queue UI, manual task entry, Claude Code project sync.

### 1.1 Electron window

- `windowManager.ts`: Create `BrowserWindow` with `alwaysOnTop: true`, level `'floating'`
- `setVisibleOnAllWorkspaces(true)` on macOS so window persists across Spaces
- Window size: 300×560px default. Resizable vertically only
- Position: bottom-right corner, 16px inset from screen edge
- Save/restore position across restarts via `electron-store`
- Frameless window. Custom titlebar rendered in React
- System tray icon with menu: Show/Hide, Quit

### 1.2 Slide menu

- Menu panel renders as a sibling layer to main content in the DOM
- On open: panel translates `+200px` on X, main content shifts `+200px` simultaneously using CSS transitions (`cubic-bezier(0.4, 0, 0.2, 1), 250ms`)
- Dim overlay renders between menu and content (pointer-events catch clicks to close)
- Page title in titlebar updates to selected project name on selection; menu closes 160ms after tap
- "Describe new project" option routes to `DescribeProject` view

### 1.3 Queue UI

- `QueueList.tsx`: renders `NowRunning` card + phase-divided list of `QueueItem` components
- `QueueItem.tsx`: drag handle (opacity 0.3), title, project tag, token estimate, queue number
- `useDragReorder.ts`: HTML5 drag API. On drop, write new `queuePosition` values to SQLite and update Zustand store
- Phase rows: centered label with lines either side. Active phase uses accent color, future phases use muted gray
- Items in future phases render at 45% opacity

### 1.4 Claude Code project sync

Claude Code stores session state in `~/.claude/` (verify exact path on target platform).

- `claudeCodeBridge.ts`:
  - On startup, scan `~/.claude/projects/` for project directories
  - Use `chokidar` to watch for new/removed projects
  - Parse project metadata (name, path) from CC config files
  - Expose projects to renderer via IPC: `ipcMain.handle('cc:get-projects', ...)`
- `useClaudeCodeSync.ts`: calls IPC on mount, polls every 30s, updates `projectStore`

### 1.5 SQLite persistence

- `db.ts` wraps `better-sqlite3`
- Tables: `tasks`, `projects`, `rate_limit_snapshots`, `settings`
- All Zustand stores hydrate from SQLite on app start
- Writes are synchronous (better-sqlite3 is sync-only) — wrap in `try/catch`

### 1.6 Task input

- `TaskInput.tsx`: text field at bottom of window, placeholder "Add a task or describe a project..."
- On submit: detect if input is a single-task addition (short, imperative) or project description (multi-sentence)
- Single task: create `Task` record directly, append to queue
- Project description: route to `DescribeProject` view

**Deliverable:** App launches, floats on top, shows mock queue, syncs real Claude Code projects into the slide menu.

---

## Phase 2 — Rate Limit Engine

**Goal:** Accurate token tracking, phase bundling, automatic pause/resume, git buffer toggle.

### 2.1 Token tracking

- `rateLimitStore.ts` holds `usedTokens`, `maxTokens`, `resetAt`
- Claude API responses include `usage.input_tokens` + `usage.output_tokens` — sum these per task
- On each task completion, write a `rate_limit_snapshot` row to SQLite
- On app start, reconstruct current window usage from snapshots newer than last reset time

### 2.2 Token estimation

`tokenEstimator.ts`:
```typescript
function estimateTaskTokens(task: Task, project: Project): number
```
- Base estimate: count words in `claudePrompt` × 1.4 (rough tokenization)
- Add file context estimate: scan project directory for files likely touched (by keywords in prompt), sum their line counts × 0.6
- Add output estimate: 800 tokens base + (file count × 400)
- Store estimate as `task.estimatedTokens`

### 2.3 Phase bundling

`taskBundler.ts`:
```typescript
function assignPhases(tasks: Task[], rateLimitState: RateLimitState): PhaseBundle[]
```
- Available tokens = `maxTokens - usedTokens - (gitBufferEnabled ? gitBufferTokens : 0)`
- Bin-pack queued tasks into `current_window` until available tokens would be exceeded
- Remaining tasks → `next_window`, then `future`
- Re-run on every task add, remove, reorder, or token usage update
- Update each task's `phase` field in SQLite and store

### 2.4 Auto-dispatch

Core dispatch loop in `main.ts`:
```
while queue has tasks:
  if rate limit has headroom:
    pop next task
    dispatch to Claude Code
    stream output → update progress
    update usedTokens on completion
  else:
    set timer for resetAt
    wait
    reset usedTokens to 0
    continue
```
- Dispatch means: pipe the `claudePrompt` to Claude Code's stdin or write to its input file (verify CC's actual input mechanism)
- Pause/resume state held in `sessionStore`

### 2.5 Git buffer toggle

- `RateLimitBar.tsx` renders toggle + git icon
- When enabled: `gitBufferTokens = 5000` is subtracted from available headroom in bundler
- When buffer is the only thing keeping a task from running: show "Saving tokens for commit" state on rate bar
- Toggle persists to `settings` table

### 2.6 Rate limit bar UI

- Bar width = `usedTokens / maxTokens * 100%`
- Git buffer marker = thin vertical line at `(maxTokens - gitBufferTokens) / maxTokens * 100%`
- Fills in accent color; transitions smoothly on token updates (`transition: width 300ms ease`)
- Reset countdown: `useEffect` with `setInterval(1000)`, shows `Mm Ss` format

**Deliverable:** Queue automatically dispatches tasks, pauses at limit, resumes on reset, git toggle works.

---

## Phase 3 — Progress + Voice + Project Description

### 3.1 Task progress

`claudeCodeBridge.ts` streams Claude Code stdout. Parse the stream for signals:

| Signal pattern | Milestone |
|---|---|
| Reading / opening file | `reading` |
| "I'll" / "Let me" / "I will" | `planning` |
| Writing / editing / replacing | `editing` (extract filename) |
| Running / executing / testing | `testing` |
| "Done" / "Complete" / task ends | `done` |

- Progress percentage = `receivedTokens / estimatedTokens * 100`, capped at 95% until done signal
- `ProgressBar.tsx`: filled bar + milestone dots with labels. Active milestone dot is hollow with colored border. Completed dots are filled. Current file name shown in label row
- Animate bar fill with `transition: width 400ms ease`

### 3.2 Voice input

`useVoiceInput.ts`:
```typescript
function useVoiceInput(onResult: (transcript: string) => void)
```
- Use `window.SpeechRecognition` (available in Electron's Chromium)
- `continuous: false`, `interimResults: true`
- On interim result: show live transcript in input field (grayed out)
- On final result: populate input field, focus, let user confirm before submitting
- `VoiceButton.tsx`: mic icon, pulsing ring animation while recording, waveform SVG on interim

Fallback to Whisper if Web Speech unavailable:
- Record via `MediaRecorder` API
- On silence (>1.2s of audio below RMS threshold): stop, POST audio blob to `https://api.openai.com/v1/audio/transcriptions`
- Requires OpenAI key in settings

### 3.3 Project description → structured tasks

`DescribeProject.tsx` is a chat-style view (matching the mockup):
- User types or speaks a free-form project description
- On submit, call Claude API:

```typescript
const response = await anthropic.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 2000,
  system: `You are a technical project planner. 
Convert a project description into structured tasks for a developer.
Rules:
- Task titles must be lay-person summaries (no code jargon) — what is being done, not how
- Good: "Make the login page remember users between sessions"
- Bad: "Implement JWT refresh token persistence in localStorage"
- Group tasks into logical phases (Foundation, Core Features, Polish, etc.)
- Each task needs: title, claudePrompt (full technical prompt for Claude Code), estimatedComplexity (low/medium/high), tags
- Return valid JSON only, no markdown`,
  messages: [{ role: 'user', content: userDescription }]
})
```

- Parse JSON response → render phase cards in the chat UI
- Phases 3+ collapsed to summary (count + total tokens)
- "Add to queue" button: bulk-insert all tasks, assign `queuePosition` starting after current last item
- "Edit" button: allow inline editing of task titles before adding
- Conversation continues: user can say "also add a dark mode" and it appends to the plan

**Deliverable:** Voice works, project descriptions generate task lists, progress shows on running task.

---

## Phase 4 — Browser Extension + Annotation

### 4.1 WebSocket bridge

`electron/wsServer.ts`:
- Start `ws` server on `localhost:54321` when app launches
- Messages are JSON: `{ type: string, payload: any }`
- Incoming message types: `annotation:capture`, `ping`
- Outgoing: `pong`, `annotation:received`, `queue:status`
- Reconnect logic on extension side: exponential backoff, max 30s

### 4.2 Chrome extension

`extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "Queue",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["http://localhost/*", "http://127.0.0.1/*"],
  "action": { "default_popup": "popup/index.html" },
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["http://localhost/*", "http://127.0.0.1/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}
```

`extension/content.ts`:
- Inject floating activation button (bottom-right, 48px, Queue icon)
- On click or `⌘⇧Q` shortcut: enter annotation mode
  - Add `cursor: crosshair` to `document.body`
  - On `mouseover`: highlight hovered element with `2px solid #c45f28` outline
  - On `click`: capture element, exit annotation mode, open annotation panel
- Capture payload:
  ```typescript
  {
    url: window.location.href,
    elementSelector: getCSSPath(element),   // walk DOM to build unique selector
    elementLabel: getElementLabel(element), // aria-label, placeholder, text content, tag
    screenshotDataUrl: await captureElement(element), // html2canvas crop
    consoleErrors: capturedConsoleErrors,   // monkey-patched console.error
    networkErrors: capturedNetworkErrors,   // PerformanceObserver resource failures
  }
  ```

`extension/popup/`:
- Shows annotation panel after capture
- User adds a text note
- "Add to Queue" button: sends full payload via `chrome.runtime.sendMessage` → background → WebSocket → Electron

### 4.3 Annotation UI in Queue

`AnnotationPill.tsx`:
- Compact pill below task description (matching mockup)
- Thumbnail (28×20px cropped screenshot), element label, URL
- Click to expand: shows full screenshot, selector, errors, note
- Annotation data stored as JSON blob in `tasks.annotation` column

### 4.4 Context injection into Claude prompt

When a task has an annotation, prepend to `claudePrompt`:
```
BROWSER CONTEXT:
- Page: {url}
- Element: {elementSelector} ("{elementLabel}")
- Console errors: {consoleErrors.join('\n')}
- User note: {userNote}
---
```

**Deliverable:** Click any element in a local app, attach it to a Queue task with full context.

---

## Phase 5 — Multi-Project Overview

### 5.1 Overview page

Activated via "Overview" in slide menu. Full-window view (not the compact overlay):

- Header row: total tasks, active projects, global token usage, reset timer
- Per-project cards arranged in a 2-column grid
  - Project name, running indicator dot, task count
  - Mini queue: first 3 tasks shown, "+ N more" if additional
  - Mini rate bar for per-project token share
- Click project card → navigate to that project's queue view in the compact overlay

### 5.2 Global queue reorder

In Overview, a "Queue" tab shows all tasks across all projects interleaved by `queuePosition`:
- Same drag-to-reorder as per-project view
- Project tag on each item identifies origin
- Reordering here updates global `queuePosition`, which re-runs the bundler across all projects

---

## Settings

Accessible from system tray menu. Persisted to `settings` SQLite table.

| Setting | Type | Default |
|---|---|---|
| `maxTokensPerWindow` | number | 100000 |
| `gitBufferEnabled` | boolean | true |
| `gitBufferTokens` | number | 5000 |
| `autoResumeOnReset` | boolean | true |
| `voiceInputMode` | `'webspeech' \| 'whisper'` | `'webspeech'` |
| `openAiKey` | string (encrypted) | — |
| `anthropicKey` | string (encrypted) | — |
| `windowPosition` | `{x, y}` | bottom-right |
| `windowHeight` | number | 560 |

Store API keys with `safeStorage.encryptString` / `decryptString` (Electron built-in).

---

## IPC Channel Reference

| Channel | Direction | Payload |
|---|---|---|
| `cc:get-projects` | renderer → main | — |
| `cc:projects-updated` | main → renderer | `Project[]` |
| `queue:dispatch-task` | renderer → main | `Task` |
| `queue:task-progress` | main → renderer | `{ taskId, progress: TaskProgress }` |
| `queue:task-complete` | main → renderer | `{ taskId, actualTokens }` |
| `ratelimit:update` | main → renderer | `RateLimitState` |
| `annotation:received` | main → renderer | `BrowserAnnotation` |
| `window:toggle` | tray → main | — |

---

## Build & Dev Setup

```bash
# Install
npm install

# Dev (hot reload)
npm run dev          # starts Vite + Electron concurrently

# Build
npm run build        # Vite build → Electron packager
npm run dist         # electron-builder → .dmg / .exe / .AppImage

# Extension dev
cd extension && npm run build   # esbuild watch
# Load unpacked from chrome://extensions
```

### Key `package.json` scripts
```json
{
  "dev": "concurrently \"vite\" \"electron .\"",
  "build": "vite build && tsc -p electron/tsconfig.json",
  "dist": "npm run build && electron-builder"
}
```

### electron-builder config
```json
{
  "appId": "com.queue.app",
  "mac": { "target": "dmg", "category": "public.app-category.developer-tools" },
  "win": { "target": "nsis" },
  "linux": { "target": "AppImage" }
}
```

---

## Open Questions for First Session

Before starting Phase 1, verify these with a short spike:

1. **Claude Code input mechanism** — Does CC accept tasks via stdin, a socket, a file drop, or CLI flags? This determines how `claudeCodeBridge.ts` dispatches tasks. Run `claude --help` and inspect `~/.claude/` for IPC hints.

2. **Claude Code project paths** — Confirm exact location of project metadata files in `~/.claude/`. The bridge depends on this.

3. **Claude Code output stream** — Can CC stdout be piped when launched as a child process? Test: `const cc = spawn('claude', [...args]); cc.stdout.on('data', ...)`.

4. **Rate limit headers** — Does the Anthropic SDK expose remaining tokens / reset time in response headers? Check `response.headers` on a real API call. If not, track manually with a rolling window.

---

## Suggested First Claude Code Prompt

```
Read SPEC.md in full before starting.

Begin Phase 1. Set up the Electron project with:
- TypeScript throughout
- React 18 + Vite for the renderer
- Tailwind CSS with the color tokens from the spec
- better-sqlite3 with the schema from the Data Models section
- The window configuration from section 1.1 (always-on-top, frameless, bottom-right)
- A hardcoded mock of 3 projects and 5 tasks to verify the UI renders correctly

Do not start Phase 2 until Phase 1 is complete and the window renders the queue UI with mock data.
```
