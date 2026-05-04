import { useState } from 'react'
import { useQueueStore } from '../store/queueStore'
import { useRateLimitStore } from '../store/rateLimitStore'
import type { Task } from '@shared/types'

export function useDragReorder() {
  const reorderTasks = useQueueStore((s) => s.reorderTasks)
  const rebundle = useQueueStore((s) => s.rebundle)
  const rateLimitState = useRateLimitStore()

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function reset() {
    setDraggedId(null)
    setDragOverId(null)
  }

  // Returns tasks reordered to show where the dragged item would land.
  // QueueList passes this to its render loop so items visually shift during drag.
  function getPreviewOrder(tasks: Task[]): Task[] {
    if (!draggedId || !dragOverId || draggedId === dragOverId) return tasks
    const fromIdx = tasks.findIndex((t) => t.id === draggedId)
    const toIdx = tasks.findIndex((t) => t.id === dragOverId)
    if (fromIdx === -1 || toIdx === -1) return tasks
    const reordered = [...tasks]
    const [moved] = reordered.splice(fromIdx, 1)
    // When dragging down, removal shifts later indices by -1; adjust so item
    // inserts immediately before the target (matching the border-t indicator).
    const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx
    reordered.splice(insertAt, 0, moved)
    return reordered
  }

  function onDragStart(taskId: string) {
    return (e: React.DragEvent) => {
      setDraggedId(taskId)
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  function onDragEnter(taskId: string) {
    return (e: React.DragEvent) => {
      e.preventDefault()
      if (taskId !== draggedId) setDragOverId(taskId)
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onDrop(tasks: Task[]) {
    return (e: React.DragEvent) => {
      e.preventDefault()
      if (!draggedId || !dragOverId || draggedId === dragOverId) { reset(); return }
      const preview = getPreviewOrder(tasks)
      reorderTasks(preview.map((t) => t.id)).then(() => rebundle(rateLimitState))
      reset()
    }
  }

  function onDragEnd() {
    reset()
  }

  return {
    draggedId,
    dragOverId,
    getPreviewOrder,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDrop,
    onDragEnd,
  }
}
