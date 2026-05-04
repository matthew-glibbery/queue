# Queue — Technical Specification
*Claude Code companion for task queuing, rate-limit management, and project orchestration*

---

## Goal

A frameless Electron overlay that floats above all windows, manages a queue of Claude Code tasks, automatically dispatches them within rate-limit windows, and syncs state across devices via Supabase. Includes a Chrome extension for browser annotation capture and a voice-to-task pipeline.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Electron app (thin client)                         │
│  React + Zustand → reads/writes Supabase directly  │
└───────────────────────┬─────────────────────────────┘
                        │ Supabase Realtime
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
┌──────────────┐  ┌──────────┐  ┌──────────────────┐
│  Railway     │  │ Supabase │  │ launchd daemon   │
│  dispatcher  │  │ Postgres │  │ (ccBridge.ts)    │
│  (rate limit │  │ Realtime │  │ invokes claude-p │
│   + phases)  │  └──────────┘  └──────────────────┘
└──────────────┘
```

**Electron app** — renderer talks directly to Supabase. No SQLite. No local server.

**Supabase** — shared Postgres state. Tables: `tasks`, `projects`, `task_progress`, `rate_limit_snapshots`, `settings`. All tables have open anon RLS policies and are added to the Realtime publication.

**Railway dispatcher** (`backend/dispatcher.ts`) — stateless service. Manages per-device rate limit windows in memory (reconstructed from `rate_limit_snapshots` on startup). Assigns task phases, sets `status='dispatching'` when headroom exists. Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**launchd daemon** (`daemon/ccBridge.ts`) — local service. Watches `~/.claude/projects/`, subscribes to Supabase Realtime for tasks with `status='dispatching'`, invokes `claude -p <prompt>`, streams progress back. Compiled to `out/daemon/ccBridge.js` via esbuild for launchd compatibility. Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `QUEUE_DEVICE_ID`.

**Chrome extension** (`extension/`) — MV3. Content script + popup. Sends annotations to Electron via WebSocket on port 54321.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron 31.7.7, `electron-vite` |
| Frontend | React 18 + Zustand + Tailwind CSS |
| Persistence | Supabase (`@supabase/supabase-js ^2.45.0`) |
| Claude API | `@anthropic-ai/sdk ^0.32.0` |
| File watching | `chokidar ^3.6.0` |
| Extension ↔ app | `ws ^8.18.0` on port 54321 |
| Daemon bundling | esbuild (`--external:fsevents`) → `out/daemon/ccBridge.js` |
| Voice | Web Speech API (`webkitSpeechRecognition`) |

---

## Repo Structure

```
queue/
├── electron/
│   ├── main.ts              # Window creation, IPC handlers, safeStorage
│   ├── preload.ts           # Context bridge
│   ├── tray.ts
│   ├── windowManager.ts     # Always-on-top, workspace pinning, position save
│   └── wsServer.ts          # WS server port 54321 for extension
├── src/
│   ├── App.tsx              # View routing: queue | describe-project | overview
│   ├── store/
│   │   ├── queueStore.ts    # Tasks, Supabase sync, rebundle()
│   │   ├── projectStore.ts  # Projects, Supabase sync
│   │   ├── rateLimitStore.ts
│   │   └── sessionStore.ts
│   ├── components/
│   │   ├── TitleBar.tsx
│   │   ├── SlideMenu.tsx
│   │   ├── ProjectHeader.tsx  # Shown when project selected: description, completed toggle
│   │   ├── RateLimitBar.tsx
│   │   ├── NowRunning.tsx
│   │   ├── QueueList.tsx      # Accepts showCompleted prop
│   │   ├── QueueItem.tsx      # Phase menu (···), project pill, drag handles
│   │   ├── PhaseRow.tsx
│   │   ├── Overview.tsx       # Multi-project view with phase grouping
│   │   ├── AnnotationPill.tsx
│   │   ├── DescribeProject.tsx
│   │   ├── TaskInput.tsx
│   │   └── VoiceButton.tsx
│   ├── hooks/
│   │   ├── useRateLimit.ts
│   │   ├── useVoiceInput.ts
│   │   └── useDragReorder.ts
│   └── lib/
│       ├── supabase.ts        # Client, row types, camelCase↔snake_case converters
│       ├── deviceId.ts        # UUID in localStorage key 'queue:device_id'
│       ├── taskBundler.ts
│       ├── tokenEstimator.ts
│       ├── projectParser.ts   # Calls IPC claude:parse-project
│       └── mockData.ts        # Used when Supabase returns empty (dev)
├── daemon/
│   ├── ccBridge.ts            # launchd service source
│   └── fileScanner.ts
├── backend/
│   └── dispatcher.ts          # Railway service
├── extension/
│   ├── manifest.json          # MV3, localhost only
│   ├── background.ts          # WS reconnect with exponential backoff
│   ├── content.ts             # Element picker, getCSSPath()
│   └── popup/
├── shared/
│   └── types.ts
├── context/
│   ├── spec.md
│   └── working.md
└── supabase/migrations/001_initial_schema.sql
```

---

## Data Models

```typescript
type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'
type TaskPhase = 'current_window' | 'next_window' | 'future'

interface Task {
  id: string
  projectId: string
  title: string           // Lay-person summary ("Fix checkout button on mobile")
  claudePrompt: string    // Full technical prompt sent to claude -p
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

interface Project {
  id: string
  name: string
  path: string
  description?: string    // Editable inline in ProjectHeader
  activeTaskCount: number
  hasRunningTask: boolean
  lastSyncedAt: number
}

interface RateLimitState {
  usedTokens: number
  maxTokens: number       // Default 100k
  resetAt: number
  gitBufferEnabled: boolean
  gitBufferTokens: number // Default 5k
}
```

---

## Key Implementation Rules

**Device identity** — `crypto.randomUUID()` stored in `localStorage['queue:device_id']`. The daemon must have the same UUID in `QUEUE_DEVICE_ID` env var. Never auto-generate on the daemon side.

**Phase assignment** — client-side via `taskBundler.assignPhases()`. `rebundle(rateLimitState)` is called after every task mutation and whenever rate limit fields change. The Railway dispatcher also re-assigns phases server-side as a source of truth.

**Token estimation** — `words × 1.4 + lines × 0.6 + (800 + fileCount × 400)`. File context comes from `daemon/fileScanner.ts` at dispatch time; the renderer uses `{fileCount:0, totalLines:0}` defaults.

**API key storage** — Anthropic key stored encrypted via `safeStorage.encryptString`. All Claude API calls proxied through IPC handler `claude:parse-project` in main process. Key never touches `.env` or renderer.

**Drag reorder** — uses `useState` (not `useRef`) for `draggedId`/`dragOverId` so state changes trigger re-renders. `getPreviewOrder` adjusts `insertAt = toIdx - 1` when dragging downward (compensates for index shift after splice) so the `border-t` indicator correctly marks where the card will land.

**Fallback to mock data** — `queueStore` uses `MOCK_TASKS`/`MOCK_PROJECTS` when Supabase returns an empty array (tables not yet populated). Condition: `data && data.length > 0`, not just `data`.

**Daemon deployment** — compile with esbuild before registering with launchd: `npx esbuild daemon/ccBridge.ts --bundle --platform=node --outfile=out/daemon/ccBridge.js --external:fsevents`. The plist points to `out/daemon/ccBridge.js`, not the `.ts` source. Use `launchctl bootstrap gui/$(id -u)` (not the deprecated `launchctl load`).

**Voice** — requires both `setPermissionRequestHandler` and `setPermissionCheckHandler` in main process. If `error === 'not-allowed'`, user must grant microphone access in System Settings → Privacy → Microphone.

**Window** — `frame: false` plus `win.setWindowButtonVisibility(false)` on macOS. `setAlwaysOnTop(true, 'floating')`. `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.

---

## IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `claude:parse-project` | renderer → main | Call Claude API (decrypts key, returns text) |
| `settings:set-anthropic-key` | renderer → main | Encrypt + store via safeStorage |
| `settings:has-anthropic-key` | renderer → main | Check if key is stored |
| `annotation:received` | main → renderer | Forwarded from WS server |

---

## Non-Goals / Rejected Approaches

- **SQLite / better-sqlite3** — removed. Supabase is the only persistence layer.
- **Dispatching from Electron main process** — Railway handles rate limit logic; Electron is a thin client.
- **Storing Anthropic key in `.env`** — must use safeStorage.
- **Running daemon as a shell script via launchd** — macOS blocks `/bin/bash` scripts in user directories on this OS version. Compile to JS and run with node directly.
- **`launchctl load`** — deprecated. Use `launchctl bootstrap gui/$(id -u)`.
- **`useRef` for drag state** — refs don't trigger re-renders; drag visual feedback requires `useState`.

---

## Build & Dev

```bash
npm run dev          # electron-vite dev (main + preload + renderer)
npm run build        # electron-vite build
npm run daemon       # ts-node daemon/ccBridge.ts (dev only)
npm run dispatcher   # ts-node backend/dispatcher.ts (dev only)

# Compile daemon for launchd
npx esbuild daemon/ccBridge.ts --bundle --platform=node \
  --outfile=out/daemon/ccBridge.js --external:fsevents

# Build extension
npx esbuild extension/background.ts  --bundle --outfile=extension/background.js  --format=esm  --platform=browser
npx esbuild extension/content.ts     --bundle --outfile=extension/content.js     --format=iife --platform=browser
npx esbuild extension/popup/popup.ts --bundle --outfile=extension/popup/popup.js --format=iife --platform=browser
```

### Color tokens
```
bg: #1c1c1e  surface: #2c2c2e  surface-hover: #3a3a3c  border: #3a3a3c
text: #f2f2f7  text-muted: #8e8e93  text-dim: #636366
accent: #c45f28  accent-hover: #d4772f
success: #30d158  warning: #ffd60a  danger: #ff453a
```
