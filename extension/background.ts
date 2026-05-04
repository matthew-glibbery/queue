// Service worker — maintains WS connection to the Electron app.

const WS_URL = 'ws://127.0.0.1:54321'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

let socket: WebSocket | null = null
let reconnectDelay = RECONNECT_BASE_MS

function connect(): void {
  socket = new WebSocket(WS_URL)

  socket.addEventListener('open', () => {
    console.log('[queue-ext] Connected to Queue app')
    reconnectDelay = RECONNECT_BASE_MS
    socket!.send(JSON.stringify({ type: 'ping' }))
  })

  socket.addEventListener('message', (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as { type: string; payload?: unknown }
      if (msg.type === 'annotation:received') {
        chrome.storage.session.set({ annotationSent: true })
      }
    } catch {
      // ignore malformed messages
    }
  })

  socket.addEventListener('close', () => {
    console.log(`[queue-ext] Disconnected — reconnecting in ${reconnectDelay}ms`)
    setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
  })

  socket.addEventListener('error', () => {
    socket?.close()
  })
}

connect()

// Relay annotation from content script → WebSocket → Electron
chrome.runtime.onMessage.addListener(
  (msg: { type: string; payload?: unknown }, _sender, sendResponse) => {
    if (msg.type === 'annotation:capture') {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg))
        sendResponse({ ok: true })
      } else {
        sendResponse({ ok: false, error: 'Queue app not connected' })
      }
    }
    if (msg.type === 'annotation:pending:get') {
      chrome.storage.session.get('pendingAnnotation', (result) => {
        sendResponse(result.pendingAnnotation ?? null)
      })
      return true // async
    }
    if (msg.type === 'annotation:pending:clear') {
      chrome.storage.session.remove('pendingAnnotation')
    }
    return false
  }
)

// Store captured annotation so popup can read it
chrome.runtime.onMessage.addListener((msg: { type: string; payload?: unknown }) => {
  if (msg.type === 'annotation:store') {
    chrome.storage.session.set({ pendingAnnotation: msg.payload })
    chrome.action.openPopup?.()
  }
})
