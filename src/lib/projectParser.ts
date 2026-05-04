import type { Task, TaskPhase } from '@shared/types'

export interface ParsedPhase {
  name: string
  tasks: ParsedTask[]
}

export interface ParsedTask {
  title: string
  claudePrompt: string
  estimatedComplexity: 'low' | 'medium' | 'high'
  tags: string[]
}

const COMPLEXITY_TOKENS: Record<ParsedTask['estimatedComplexity'], number> = {
  low: 4000,
  medium: 9000,
  high: 18000,
}

const SYSTEM_PROMPT = `You are a technical project planner.
Convert a project description into structured tasks for a developer.

Rules:
- Task titles must be lay-person summaries — what is being done, not how
- Good: "Make the login page remember users between sessions"
- Bad: "Implement JWT refresh token persistence in localStorage"
- Group tasks into logical phases (Foundation, Core Features, Polish, etc.)
- Each task needs: title, claudePrompt (full technical prompt for Claude Code), estimatedComplexity (low/medium/high), tags

Return ONLY valid JSON matching this shape, no markdown:
{
  "phases": [
    {
      "name": "Foundation",
      "tasks": [
        {
          "title": "...",
          "claudePrompt": "...",
          "estimatedComplexity": "low" | "medium" | "high",
          "tags": ["..."]
        }
      ]
    }
  ]
}`

export interface ProjectParseResult {
  phases: ParsedPhase[]
}

/**
 * Called via IPC from the renderer — actual API call happens in main process
 * so the API key stays in the secure main process context.
 * See electron/main.ts handler: 'claude:parse-project'
 */
export async function parseProjectDescription(
  description: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<ProjectParseResult> {
  const result = await (window as Window & { electronAPI: { parseProject: (messages: { role: string; content: string }[]) => Promise<string> } }).electronAPI.parseProject([
    ...conversationHistory,
    { role: 'user', content: description },
  ])

  try {
    const json = JSON.parse(result) as { phases: ParsedPhase[] }
    return json
  } catch {
    // Try to extract JSON from response if it includes extra text
    const match = result.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as { phases: ParsedPhase[] }
    throw new Error('Failed to parse project description response')
  }
}

export function parsedTaskToTask(
  parsed: ParsedTask,
  projectId: string,
  queuePosition: number
): Omit<Task, 'phase'> & { phase: TaskPhase } {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId,
    title: parsed.title,
    claudePrompt: parsed.claudePrompt,
    status: 'queued',
    phase: 'future',
    queuePosition,
    estimatedTokens: COMPLEXITY_TOKENS[parsed.estimatedComplexity],
    tags: parsed.tags,
    createdAt: Date.now(),
  }
}
