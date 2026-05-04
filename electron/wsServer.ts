import { WebSocketServer, WebSocket } from 'ws'
import type { BrowserWindow } from 'electron'
import type { BrowserAnnotation } from '../shared/types'

const PORT = 54321
let wss: WebSocketServer | null = null

interface WsMessage {
  type: string
  payload?: unknown
}

export function startWsServer(mainWindow: BrowserWindow): void {
  wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' })

  wss.on('listening', () => {
    console.log(`[ws] Extension bridge listening on ws://127.0.0.1:${PORT}`)
  })

  wss.on('connection', (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: 'pong' }))

    socket.on('message', (data: Buffer) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(data.toString()) as WsMessage
      } catch {
        return
      }

      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (msg.type === 'annotation:capture') {
        const annotation = msg.payload as BrowserAnnotation
        mainWindow.webContents.send('annotation:received', annotation)
        socket.send(JSON.stringify({ type: 'annotation:received' }))
      }
    })

    socket.on('error', (err) => {
      console.error('[ws] Socket error:', err.message)
    })
  })

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[ws] Port ${PORT} already in use — extension bridge unavailable`)
    } else {
      console.error('[ws] Server error:', err)
    }
  })
}

export function broadcastQueueStatus(status: unknown): void {
  if (!wss) return
  const msg = JSON.stringify({ type: 'queue:status', payload: status })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  })
}

export function stopWsServer(): void {
  wss?.close()
  wss = null
}
