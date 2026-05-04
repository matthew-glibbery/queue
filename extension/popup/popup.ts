// Extension popup — shows captured annotation and lets user add a note before sending to Queue.

interface Annotation {
  url: string
  elementSelector: string
  elementLabel: string
  screenshotDataUrl: string
  consoleErrors: string[]
  networkErrors: string[]
  userNote: string
  capturedAt: number
}

const root = document.getElementById('root')!

function render(html: string): void {
  root.innerHTML = html
}

function renderEmpty(): void {
  render(`
    <div class="empty">
      Click the Queue button on a localhost page<br>to capture an element.
    </div>
  `)
}

function renderSent(): void {
  render(`<div class="status">✓ Added to Queue</div>`)
  setTimeout(() => window.close(), 1200)
}

function renderError(msg: string): void {
  render(`<div class="empty" style="color:#ff453a">${msg}</div>`)
}

function renderAnnotation(annotation: Annotation): void {
  const errorCount = annotation.consoleErrors.length + annotation.networkErrors.length
  const hostname = (() => { try { return new URL(annotation.url).hostname } catch { return annotation.url } })()

  render(`
    <div class="annotation">
      ${annotation.screenshotDataUrl
        ? `<img class="screenshot" src="${annotation.screenshotDataUrl}" alt="Element screenshot" />`
        : `<div class="screenshot" style="display:flex;align-items:center;justify-content:center;color:#636366;font-size:11px;">No screenshot</div>`
      }
      <div class="meta">
        <div class="url">${hostname}${new URL(annotation.url).pathname}</div>
        <div class="element-label">${annotation.elementLabel}</div>
        ${errorCount > 0 ? `
          <div class="errors">
            ${annotation.consoleErrors.length > 0
              ? `<span class="error-badge">${annotation.consoleErrors.length} console error${annotation.consoleErrors.length > 1 ? 's' : ''}</span>`
              : ''
            }
            ${annotation.networkErrors.length > 0
              ? `<span class="error-badge">${annotation.networkErrors.length} network error${annotation.networkErrors.length > 1 ? 's' : ''}</span>`
              : ''
            }
          </div>
        ` : ''}
      </div>
      <div class="note-label">Add a note (optional)</div>
      <textarea id="note" rows="3" placeholder="Describe the issue or what you want done..."></textarea>
      <div class="actions">
        <button class="btn-secondary" id="btn-discard">Discard</button>
        <button class="btn-primary" id="btn-add">Add to Queue</button>
      </div>
    </div>
  `)

  document.getElementById('btn-discard')!.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'annotation:pending:clear' })
    window.close()
  })

  document.getElementById('btn-add')!.addEventListener('click', () => {
    const note = (document.getElementById('note') as HTMLTextAreaElement).value.trim()
    const final: Annotation = { ...annotation, userNote: note }

    chrome.runtime.sendMessage({ type: 'annotation:capture', payload: final }, (res: { ok: boolean; error?: string } | undefined) => {
      if (res?.ok) {
        chrome.runtime.sendMessage({ type: 'annotation:pending:clear' })
        renderSent()
      } else {
        renderError(res?.error ?? 'Queue app not connected. Is it running?')
      }
    })
  })
}

// Load pending annotation from session storage
chrome.runtime.sendMessage({ type: 'annotation:pending:get' }, (annotation: Annotation | null) => {
  if (annotation) {
    renderAnnotation(annotation)
  } else {
    renderEmpty()
  }
})
