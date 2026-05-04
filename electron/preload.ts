import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserAnnotation } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  // Claude Code project sync
  getProjects: () => ipcRenderer.invoke('cc:get-projects'),
  onProjectsUpdated: (cb: (projects: unknown[]) => void) => {
    ipcRenderer.on('cc:projects-updated', (_event, projects) => cb(projects))
    return () => ipcRenderer.removeAllListeners('cc:projects-updated')
  },

  // Browser extension annotation
  onAnnotationReceived: (cb: (annotation: BrowserAnnotation) => void) => {
    ipcRenderer.on('annotation:received', (_event, annotation) => cb(annotation))
    return () => ipcRenderer.removeAllListeners('annotation:received')
  },

  // Claude API (proxied through main for key security)
  parseProject: (messages: { role: string; content: string }[]) =>
    ipcRenderer.invoke('claude:parse-project', messages),

  // Settings
  setAnthropicKey: (key: string) => ipcRenderer.invoke('settings:set-anthropic-key', key),
  hasAnthropicKey: () => ipcRenderer.invoke('settings:has-anthropic-key'),

  platform: process.platform,
})
