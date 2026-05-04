import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

export function createTray(win: BrowserWindow): void {
  // Use a default icon — in production this would be a proper icon file
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAC9SURBVDiNpZMxDsIwDEXfr2SBgYWFI3AFjoAEB+ASHIErcAROwhVYWFhYkFoJKUlJHDs2H1VV1dpOLD/ZsiWAiADgnHPW2ntrrQ0hhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCH+FwBaax0AKKUscs4pIldEVADgnDPW2mettfcQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYTwA7oAMUpMh7IlAAAAAElFTkSuQmCC'
  )

  tray = new Tray(icon)
  tray.setToolTip('Queue')

  const updateMenu = () => {
    const isVisible = win.isVisible()
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Hide Queue' : 'Show Queue',
        click: () => {
          if (win.isVisible()) {
            win.hide()
          } else {
            win.show()
            win.focus()
          }
          updateMenu()
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ])
    tray!.setContextMenu(contextMenu)
  }

  updateMenu()

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
    updateMenu()
  })
}
