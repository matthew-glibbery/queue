import type { Task } from '@shared/types'

export interface FileContext {
  fileCount: number
  totalLines: number
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Pure token estimate from a prompt + file context.
 * File context comes from the daemon (fileScanner.ts) which has filesystem access.
 * Call with no fileContext when running in the renderer — estimate will be conservative.
 */
export function estimateTaskTokens(
  task: Task,
  fileContext: FileContext = { fileCount: 0, totalLines: 0 }
): number {
  const inputEstimate = Math.round(wordCount(task.claudePrompt) * 1.4)
  const fileContextEstimate = Math.round(fileContext.totalLines * 0.6)
  const outputEstimate = 800 + fileContext.fileCount * 400
  return inputEstimate + fileContextEstimate + outputEstimate
}
