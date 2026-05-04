import React, { useState, useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { SlideMenu } from './components/SlideMenu'
import { QueueList } from './components/QueueList'
import { RateLimitBar } from './components/RateLimitBar'
import { TaskInput } from './components/TaskInput'
import { DescribeProject } from './components/DescribeProject'
import { Overview } from './components/Overview'
import { ProjectHeader } from './components/ProjectHeader'
import { useQueueStore } from './store/queueStore'
import { useProjectStore } from './store/projectStore'
import { useRateLimitStore } from './store/rateLimitStore'

type View = 'queue' | 'describe-project' | 'overview'

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<View>('queue')
  const [showCompleted, setShowCompleted] = useState(false)

  const initQueue = useQueueStore((s) => s.initialize)
  const initProjects = useProjectStore((s) => s.initialize)
  const initRateLimit = useRateLimitStore((s) => s.initialize)
  const rebundle = useQueueStore((s) => s.rebundle)
  const rateLimitState = useRateLimitStore()

  useEffect(() => {
    initQueue()
    initProjects()
    initRateLimit()
  }, [])

  useEffect(() => {
    rebundle(rateLimitState)
  }, [rateLimitState.usedTokens, rateLimitState.maxTokens, rateLimitState.gitBufferEnabled, rateLimitState.gitBufferTokens])

  const closeMenu = () => setMenuOpen(false)

  const handleDescribeProject = () => {
    closeMenu()
    setView('describe-project')
  }

  const handleOverview = () => {
    closeMenu()
    setView('overview')
  }

  if (view === 'describe-project') {
    return (
      <div className="flex flex-col h-screen bg-bg text-text overflow-hidden select-none">
        <DescribeProject onBack={() => setView('queue')} />
      </div>
    )
  }

  if (view === 'overview') {
    return (
      <div className="flex flex-col h-screen bg-bg text-text overflow-hidden select-none">
        <Overview onBack={() => setView('queue')} onSelectProject={() => setView('queue')} />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-screen bg-bg text-text overflow-hidden select-none">
      <SlideMenu
        isOpen={menuOpen}
        onClose={closeMenu}
        onDescribeProject={handleDescribeProject}
        onOverview={handleOverview}
      />

      <div
        className="flex flex-col h-full"
        style={{
          transform: menuOpen ? 'translateX(200px)' : 'translateX(0)',
          transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <TitleBar onMenuToggle={() => setMenuOpen((v) => !v)} />
        <ProjectHeader
          showCompleted={showCompleted}
          onToggleCompleted={() => setShowCompleted((v) => !v)}
        />
        <QueueList showCompleted={showCompleted} />
        <RateLimitBar />
        <TaskInput onDescribeProject={handleDescribeProject} />
      </div>
    </div>
  )
}
