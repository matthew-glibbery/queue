import React, { useState, useRef, useEffect } from 'react'
import { useQueueStore } from '../store/queueStore'
import { useProjectStore } from '../store/projectStore'
import { useRateLimitStore } from '../store/rateLimitStore'
import {
  parseProjectDescription,
  parsedTaskToTask,
  type ParsedPhase,
  type ProjectParseResult,
} from '../lib/projectParser'

interface Message {
  role: 'user' | 'assistant'
  content: string
  result?: ProjectParseResult
}

interface DescribeProjectProps {
  onBack: () => void
}

const COMPLEXITY_LABEL: Record<string, string> = {
  low: '~4k tokens',
  medium: '~9k tokens',
  high: '~18k tokens',
}

export function DescribeProject({ onBack }: DescribeProjectProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([0, 1]))
  const scrollRef = useRef<HTMLDivElement>(null)

  const addTask = useQueueStore((s) => s.addTask)
  const rebundle = useQueueStore((s) => s.rebundle)
  const tasks = useQueueStore((s) => s.tasks)
  const rateLimitState = useRateLimitStore()
  const { activeProjectId } = useProjectStore()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const conversationHistory = messages.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' && m.result
      ? JSON.stringify(m.result)
      : m.content,
  }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const result = await parseProjectDescription(trimmed, conversationHistory)
      const assistantMsg: Message = {
        role: 'assistant',
        content: `Here's the plan — ${result.phases.reduce((n, p) => n + p.tasks.length, 0)} tasks across ${result.phases.length} phases.`,
        result,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setExpandedPhases(new Set([0, 1]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse project description')
    } finally {
      setLoading(false)
    }
  }

  async function addAllToQueue(result: ProjectParseResult) {
    if (!activeProjectId) return
    let position = tasks.length

    for (const phase of result.phases) {
      for (const parsed of phase.tasks) {
        const task = parsedTaskToTask(parsed, activeProjectId, position++)
        await addTask(task)
      }
    }
    rebundle(rateLimitState)
    onBack()
  }

  function togglePhase(idx: number) {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const lastResult = messages.findLast((m) => m.result)?.result

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <button
          onClick={onBack}
          className="text-text-dim hover:text-text transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-xs font-semibold text-text tracking-wide">Describe a project</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-text-dim text-center mt-8 px-4 leading-relaxed">
            Describe what you want to build and I'll break it into a task queue.
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-accent/20 border border-accent/30 rounded-lg px-3 py-2 max-w-[85%]">
                  <p className="text-sm text-text">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-text-muted mb-2">{msg.content}</p>
                {msg.result && (
                  <PhaseCards
                    result={msg.result}
                    expandedPhases={expandedPhases}
                    onToggle={togglePhase}
                    onAddAll={() => addAllToQueue(msg.result!)}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-text-dim text-sm">
            <span className="animate-pulse">Planning...</span>
          </div>
        )}

        {error && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Add to queue button — shown after first successful parse */}
      {lastResult && (
        <div className="px-3 pb-1">
          <button
            onClick={() => addAllToQueue(lastResult)}
            className="w-full py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            Add {lastResult.phases.reduce((n, p) => n + p.tasks.length, 0)} tasks to queue
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-3 py-2.5 border-t border-border">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={messages.length === 0 ? 'Describe your project...' : 'Add more or clarify...'}
          disabled={loading}
          className="w-full bg-surface text-text text-sm px-3 py-2 rounded-lg border border-border focus:border-accent/60 focus:outline-none placeholder-text-dim transition-colors disabled:opacity-50"
        />
      </form>
    </div>
  )
}

interface PhaseCardsProps {
  result: ProjectParseResult
  expandedPhases: Set<number>
  onToggle: (idx: number) => void
  onAddAll: () => void
}

function PhaseCards({ result, expandedPhases }: PhaseCardsProps) {
  return (
    <div className="space-y-2">
      {result.phases.map((phase, phaseIdx) => {
        const isExpanded = expandedPhases.has(phaseIdx)
        const totalTasks = phase.tasks.length
        const showFull = phaseIdx < 2

        return (
          <div key={phaseIdx} className="border border-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-hover transition-colors"
              onClick={() => !showFull && undefined}
            >
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                {phase.name}
              </span>
              <span className="text-xs text-text-dim">{totalTasks} tasks</span>
            </button>

            {(isExpanded || showFull) && (
              <div className="border-t border-border divide-y divide-border">
                {phase.tasks.map((task, taskIdx) => (
                  <div key={taskIdx} className="px-3 py-2">
                    <p className="text-sm text-text leading-snug">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {task.tags.map((tag) => (
                        <span key={tag} className="text-xs text-text-dim bg-surface px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                      <span className="text-xs text-text-dim ml-auto">
                        {COMPLEXITY_LABEL[task.estimatedComplexity]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!showFull && !isExpanded && (
              <div className="border-t border-border px-3 py-2">
                <button
                  className="text-xs text-text-dim hover:text-text transition-colors"
                  onClick={() => undefined}
                >
                  + {totalTasks} tasks
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
