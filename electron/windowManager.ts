import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import Store from 'electron-store'

interface WindowState {
  x?: number
  y?: number
  height: number
}

const store = new Store<{ window: WindowState }>()

export function createWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const winWidth = 300
  const savedState = store.get('window', { height: 560 })
  const winHeight = savedState.height

  const defaultX = screenWidth - winWidth - 16
  const defaultY = screenHeight - winHeight - 16

  const x = savedState.x ?? defaultX
  const y = savedState.y ?? defaultY

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minHeight: 400,
    maxWidth: winWidth,
    minWidth: winWidth,
    x,
    y,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.setAlwaysOnTop(true, 'floating')
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.setWindowButtonVisibility(false)
  }

  // Save position/size on move/resize
  win.on('moved', saveWindowState(win, store))
  win.on('resized', saveWindowState(win, store))

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function saveWindowState(win: BrowserWindow, store: Store<{ window: WindowState }>) {
  return () => {
    const [x, y] = win.getPosition()
    const [, height] = win.getSize()
    store.set('window', { x, y, height })
  }
}
