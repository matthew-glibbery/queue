import React, { useState } from 'react'
import type { BrowserAnnotation } from '@shared/types'

interface AnnotationPillProps {
  annotation: BrowserAnnotation
}

export function AnnotationPill({ annotation }: AnnotationPillProps) {
  const [expanded, setExpanded] = useState(false)

  const hostname = (() => {
    try { return new URL(annotation.url).hostname } catch { return annotation.url }
  })()

  const errorCount = annotation.consoleErrors.length + annotation.networkErrors.length

  return (
    <div className="mt-1.5">
      {/* Compact pill */}
      <button
        className="flex items-center gap-1.5 w-full text-left rounded-md bg-surface border border-border px-2 py-1.5 hover:bg-surface-hover transition-colors group"
        onClick={() => setExpanded((v) => !v)}
      >
        {annotation.screenshotDataUrl && (
          <img
            src={annotation.screenshotDataUrl}
            alt=""
            className="w-7 h-5 object-cover rounded flex-shrink-0 border border-border"
          />
        )}
        <span className="text-xs text-text-dim truncate flex-1">
          {annotation.elementLabel} — {hostname}
        </span>
        {errorCount > 0 && (
          <span className="text-xs text-danger flex-shrink-0">{errorCount} err</span>
        )}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`flex-shrink-0 text-text-dim transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-1 border border-border rounded-md bg-surface overflow-hidden">
          {annotation.screenshotDataUrl && (
            <img
              src={annotation.screenshotDataUrl}
              alt="Element screenshot"
              className="w-full object-cover border-b border-border"
              style={{ maxHeight: 120 }}
            />
          )}
          <div className="px-2 py-2 space-y-1.5">
            <div>
              <span className="text-xs text-text-dim block">Element</span>
              <code className="text-xs text-text font-mono break-all">{annotation.elementSelector}</code>
            </div>
            <div>
              <span className="text-xs text-text-dim block">Page</span>
              <span className="text-xs text-text break-all">{annotation.url}</span>
            </div>
            {annotation.userNote && (
              <div>
                <span className="text-xs text-text-dim block">Note</span>
                <span className="text-xs text-text">{annotation.userNote}</span>
              </div>
            )}
            {annotation.consoleErrors.length > 0 && (
              <div>
                <span className="text-xs text-danger block mb-0.5">Console errors</span>
                {annotation.consoleErrors.map((err, i) => (
                  <p key={i} className="text-xs text-text-dim font-mono break-all">{err}</p>
                ))}
              </div>
            )}
            {annotation.networkErrors.length > 0 && (
              <div>
                <span className="text-xs text-danger block mb-0.5">Network errors</span>
                {annotation.networkErrors.map((err, i) => (
                  <p key={i} className="text-xs text-text-dim font-mono break-all">{err}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
