import React, { useState } from 'react'
import { useQueueStore } from '../store/queueStore'
import { useProjectStore } from '../store/projectStore'
import { useRateLimitStore } from '../store/rateLimitStore'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { estimateTaskTokens } from '../lib/tokenEstimator'
import { VoiceButton } from './VoiceButton'
import type { Task } from '@shared/types'

// Multi-sentence input that contains verbs like "build", "create", "add", "implement"
// across multiple clauses is treated as a project description.
function isProjectDescription(text: string): boolean {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  return sentences.length >= 2 && text.length > 80
}

interface TaskInputProps {
  onDescribeProject: () => void
}

export function TaskInput({ onDescribeProject }: TaskInputProps) {
  const [value, setValue] = useState('')
  const [interimText, setInterimText] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const addTask = useQueueStore((s) => s.addTask)
  const rebundle = useQueueStore((s) => s.rebundle)
  const tasks = useQueueStore((s) => s.tasks)
  const rateLimitState = useRateLimitStore()
  const { activeProjectId } = useProjectStore()

  const voice = useVoiceInput({
    onInterim: (t) => setInterimText(t),
    onResult: (t) => {
      setInterimText('')
      setValue(t)
    },
    onError: (err) => {
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setVoiceError('Microphone access denied. Enable it in System Settings → Privacy → Microphone.')
      } else {
        setVoiceError(`Voice error: ${err}`)
      }
      setTimeout(() => setVoiceError(null), 6000)
    },
  })

  const displayValue = voice.state === 'listening' && interimText ? interimText : value
  const isInterim = voice.state === 'listening' && !!interimText && !value

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || !activeProjectId) return

    if (isProjectDescription(trimmed)) {
      onDescribeProject()
      // Pre-populate isn't supported via prop yet — user sees the DescribeProject view
      setValue('')
      return
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId: activeProjectId,
      title: trimmed,
      claudePrompt: trimmed,
      status: 'queued',
      phase: 'future',
      queuePosition: tasks.length,
      estimatedTokens: estimateTaskTokens({ claudePrompt: trimmed } as Task),
      tags: [],
      createdAt: Date.now(),
    }

    addTask(newTask).then(() => rebundle(rateLimitState))
    setValue('')
  }

  return (
    <div className="border-t border-border">
      {voiceError && (
        <p className="px-3 py-1.5 text-xs text-danger bg-danger/10 leading-snug">{voiceError}</p>
      )}
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 px-3 py-2.5">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          if (!isInterim) setValue(e.target.value)
        }}
        placeholder="Add a task or describe a project..."
        className={`flex-1 bg-surface text-sm px-3 py-2 rounded-lg border border-border focus:border-accent/60 focus:outline-none placeholder-text-dim transition-colors ${
          isInterim ? 'text-text-dim italic' : 'text-text'
        }`}
      />
      <VoiceButton state={voice.state} isSupported={voice.isSupported} onToggle={voice.toggle} />
    </form>
    </div>
  )
}
