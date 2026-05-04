import { app, BrowserWindow, ipcMain, safeStorage, session } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import Store from 'electron-store'
import { createWindow } from './windowManager'
import { createTray } from './tray'
import { startWsServer, stopWsServer } from './wsServer'

interface AppSettings {
  anthropicKey?: string
}

const store = new Store<AppSettings>()
let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  const ALLOWED_PERMISSIONS = ['media', 'microphone', 'audioCapture', 'mediaKeySystem']
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.includes(permission)
  })

  mainWindow = createWindow()
  createTray(mainWindow)
  startWsServer(mainWindow)

  // ── Claude Code project sync stub ────────────────────────────────────────
  ipcMain.handle('cc:get-projects', () => {
    // Projects come from Supabase (synced by daemon) — return empty here
    return []
  })

  // ── Claude API: parse project description ────────────────────────────────
  ipcMain.handle(
    'claude:parse-project',
    async (_event, messages: { role: string; content: string }[]) => {
      let apiKey: string | undefined

      const encrypted = store.get('anthropicKey')
      if (encrypted && safeStorage.isEncryptionAvailable()) {
        try {
          apiKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
        } catch {
          apiKey = undefined
        }
      }

      if (!apiKey) {
        throw new Error('Anthropic API key not configured. Add it in Settings.')
      }

      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 2000,
        system: `You are a technical project planner.
Convert a project description into structured tasks for a developer.

Rules:
- Task titles must be lay-person summaries (no code jargon) — what is being done, not how
- Good: "Make the login page remember users between sessions"
- Bad: "Implement JWT refresh token persistence in localStorage"
- Group tasks into logical phases (Foundation, Core Features, Polish, etc.)
- Each task needs: title, claudePrompt (full technical prompt for Claude Code), estimatedComplexity (low/medium/high), tags
- Return valid JSON only, no markdown

Shape: { "phases": [{ "name": "...", "tasks": [{ "title": "...", "claudePrompt": "...", "estimatedComplexity": "low"|"medium"|"high", "tags": ["..."] }] }] }`,
        messages: messages as Anthropic.MessageParam[],
      })

      const block = response.content[0]
      return block.type === 'text' ? block.text : ''
    }
  )

  // ── API key management ───────────────────────────────────────────────────
  ipcMain.handle('settings:set-anthropic-key', (_event, key: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key).toString('base64')
      store.set('anthropicKey', encrypted)
    }
  })

  ipcMain.handle('settings:has-anthropic-key', () => {
    return !!store.get('anthropicKey')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopWsServer()
  if (process.platform !== 'darwin') app.quit()
})
