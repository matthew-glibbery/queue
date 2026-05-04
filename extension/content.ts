// Injected into localhost pages — adds annotation activation button and element picker.

const ACCENT = '#c45f28'
let annotationMode = false
let highlightedEl: HTMLElement | null = null
const capturedErrors: string[] = []
const capturedNetworkErrors: string[] = []

// ─── Console error capture ─────────────────────────────────────────────────
const origError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  capturedErrors.push(args.map(String).join(' '))
  origError(...args)
}

// ─── Network error capture ─────────────────────────────────────────────────
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    const re = entry as PerformanceResourceTiming
    if (re.responseStatus >= 400 || re.responseStatus === 0) {
      capturedNetworkErrors.push(`${re.responseStatus} ${re.name}`)
    }
  }
})
observer.observe({ type: 'resource', buffered: true })

// ─── CSS selector path ─────────────────────────────────────────────────────
function getCSSPath(el: HTMLElement): string {
  const path: string[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      selector = `#${current.id}`
      path.unshift(selector)
      break
    }
    const siblings = Array.from(current.parentElement?.children ?? [])
    const idx = siblings.indexOf(current) + 1
    if (siblings.length > 1) selector += `:nth-child(${idx})`
    path.unshift(selector)
    current = current.parentElement
  }
  return path.join(' > ')
}

function getElementLabel(el: HTMLElement): string {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') ||
    el.textContent?.trim().slice(0, 60) ||
    el.tagName.toLowerCase()
  )
}

// ─── Screenshot via background tab capture ────────────────────────────────
async function captureElement(el: HTMLElement): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'capture:tab' }, (dataUrl: string) => {
      if (!dataUrl) { resolve(''); return }
      const rect = el.getBoundingClientRect()
      const img = new Image()
      img.onload = () => {
        const scale = window.devicePixelRatio || 1
        const canvas = document.createElement('canvas')
        canvas.width = rect.width * scale
        canvas.height = rect.height * scale
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(
          img,
          rect.left * scale, rect.top * scale,
          rect.width * scale, rect.height * scale,
          0, 0,
          rect.width * scale, rect.height * scale
        )
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => resolve('')
      img.src = dataUrl
    })
  })
}

// ─── Annotation mode ───────────────────────────────────────────────────────
function enterAnnotationMode(): void {
  if (annotationMode) return
  annotationMode = true
  document.body.style.cursor = 'crosshair'

  document.addEventListener('mouseover', onMouseOver)
  document.addEventListener('click', onElementClick, { once: true })
}

function exitAnnotationMode(): void {
  annotationMode = false
  document.body.style.cursor = ''
  document.removeEventListener('mouseover', onMouseOver)
  if (highlightedEl) {
    highlightedEl.style.outline = ''
    highlightedEl = null
  }
}

function onMouseOver(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (target === activationButton) return
  if (highlightedEl) highlightedEl.style.outline = ''
  highlightedEl = target
  target.style.outline = `2px solid ${ACCENT}`
}

async function onElementClick(e: MouseEvent): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  exitAnnotationMode()

  const el = e.target as HTMLElement
  const screenshotDataUrl = await captureElement(el)

  const annotation = {
    url: window.location.href,
    elementSelector: getCSSPath(el),
    elementLabel: getElementLabel(el),
    screenshotDataUrl,
    consoleErrors: [...capturedErrors],
    networkErrors: [...capturedNetworkErrors],
    userNote: '',
    capturedAt: Date.now(),
  }

  chrome.runtime.sendMessage({ type: 'annotation:store', payload: annotation })
}

// ─── Keyboard shortcut ────────────────────────────────────────────────────
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Q') {
    e.preventDefault()
    annotationMode ? exitAnnotationMode() : enterAnnotationMode()
  }
  if (e.key === 'Escape' && annotationMode) exitAnnotationMode()
})

// ─── Activation button ────────────────────────────────────────────────────
const activationButton = document.createElement('button')
activationButton.id = 'queue-activation-btn'
activationButton.title = 'Queue annotation (⌘⇧Q)'
activationButton.style.cssText = `
  position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
  width: 44px; height: 44px; border-radius: 50%;
  background: ${ACCENT}; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: transform 0.15s ease, opacity 0.15s ease;
  opacity: 0.85;
`
activationButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="5" width="16" height="2" rx="1" fill="white"/>
  <rect x="2" y="9" width="12" height="2" rx="1" fill="white"/>
  <rect x="2" y="13" width="14" height="2" rx="1" fill="white"/>
</svg>`
activationButton.addEventListener('mouseenter', () => {
  activationButton.style.transform = 'scale(1.08)'
  activationButton.style.opacity = '1'
})
activationButton.addEventListener('mouseleave', () => {
  activationButton.style.transform = 'scale(1)'
  activationButton.style.opacity = '0.85'
})
activationButton.addEventListener('click', () => {
  annotationMode ? exitAnnotationMode() : enterAnnotationMode()
})

document.addEventListener('DOMContentLoaded', () => {
  document.body.appendChild(activationButton)
})
if (document.readyState !== 'loading') {
  document.body.appendChild(activationButton)
}
