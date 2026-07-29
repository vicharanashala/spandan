import { app, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let orbWindow = null

const isDev = process.env.NODE_ENV !== 'production'
const VITE_URL = 'http://localhost:5173'

// ═══════════════════════════════════════════════════════════════════════
// SpandanGPT Orb — Small Desktop Overlay (NOT full-screen)
// The crash was caused by a full-screen transparent window.
// This version uses a small window that only covers the orb + chat area.
// ═══════════════════════════════════════════════════════════════════════

const ORB_SIZE = 140       // Size of the orb window when chat is closed
const PANEL_W = 360        // Width of chat panel
const PANEL_H = 520        // Height of chat panel
const GAP = 12             // Gap between panel and orb
const EXPANDED_MARGIN = 16 // Margin around the expanded window
const MARGIN = 16          // Initial margin from screen edge

const EXPANDED_W = EXPANDED_MARGIN + PANEL_W + GAP + 64 + EXPANDED_MARGIN // 528
const EXPANDED_H = EXPANDED_MARGIN + PANEL_H + EXPANDED_MARGIN            // 632

function createOrbWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize

  console.log(`[SpandanGPT] ✓ Creating small overlay (${ORB_SIZE}x${ORB_SIZE})...`)

  orbWindow = new BrowserWindow({
    width: ORB_SIZE,
    height: ORB_SIZE,
    x: screenW - ORB_SIZE - MARGIN,
    y: screenH - ORB_SIZE - MARGIN,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    type: 'toolbar', // Helps with staying on top
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  })

  // Allow clicks to pass through transparent areas ONLY
  // This is safe on a small window (80x80), NOT on a full-screen window
  orbWindow.setIgnoreMouseEvents(true, { forward: true })

  const orbUrl = isDev
    ? `${VITE_URL}/?mode=companion`
    : `file://${path.join(__dirname, '../dist/index.html')}?mode=companion`

  console.log(`[SpandanGPT] ✓ Loading overlay: ${orbUrl}`)
  orbWindow.loadURL(orbUrl)
  
  // Highest level always on top to survive Snipping Tool
  orbWindow.setAlwaysOnTop(true, 'screen-saver')

  orbWindow.once('ready-to-show', () => {
    console.log('[SpandanGPT] ✓ Overlay ready — orb is now visible on desktop!')
    orbWindow.show()
  })

  orbWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log(`[SpandanGPT] ✗ Failed to load (${errorCode}: ${errorDescription}). Retrying in 2s...`)
    setTimeout(() => {
      if (orbWindow && !orbWindow.isDestroyed()) {
        orbWindow.loadURL(orbUrl)
      }
    }, 2000)
  })

  orbWindow.webContents.on('did-finish-load', () => {
    console.log('[SpandanGPT] ✓ Overlay page loaded successfully')
  })

  orbWindow.on('closed', () => {
    console.log('[SpandanGPT] Overlay closed.')
    orbWindow = null
  })
}

// ═══════════════════════════════════════════════════════════════════════
// App Lifecycle
// ═══════════════════════════════════════════════════════════════════════

// Hardware acceleration is required for true transparent windows on Windows DWM.
// Since we are no longer using a full-screen click-through window, this is safe.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

app.whenReady().then(() => {
  console.log('[SpandanGPT] ═══════════════════════════════════════')
  console.log('[SpandanGPT] SpandanGPT Desktop Overlay Starting...')
  console.log(`[SpandanGPT] Website available at: ${VITE_URL}`)
  console.log('[SpandanGPT] ═══════════════════════════════════════')

  createOrbWindow()

  // IPC: Allow renderer to toggle click-through
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setIgnoreMouseEvents(ignore, options || {})
    }
  })

  // IPC: Smooth dragging logic using absolute coordinates
  let dragStartWindowPos = { x: 0, y: 0 }
  let dragStartMousePos = { x: 0, y: 0 }

  ipcMain.on('drag-start', (event, mouseX, mouseY) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const [x, y] = win.getPosition()
      dragStartWindowPos = { x, y }
      dragStartMousePos = { x: mouseX, y: mouseY }
    }
  })

  ipcMain.on('drag-move', (event, mouseX, mouseY) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const dx = mouseX - dragStartMousePos.x
      const dy = mouseY - dragStartMousePos.y
      win.setPosition(dragStartWindowPos.x + dx, dragStartWindowPos.y + dy)
    }
  })

  // IPC: Resize window when chat opens/closes
  ipcMain.on('resize-window', (event, isOpen, layout) => {
    if (!orbWindow || orbWindow.isDestroyed()) return
    const [currentX, currentY] = orbWindow.getPosition()

    if (isOpen) {
      // The orb's physical screen position when closed
      // In JSX, orbX = 38, orbY = 38 when closed
      const targetScreenX = currentX + 38
      const targetScreenY = currentY + 38

      let orbX_expanded, orbY_expanded
      
      // Calculate orb position inside the expanded window based on layout from React
      if (layout && layout.panelOnRight) {
        orbX_expanded = EXPANDED_MARGIN
      } else {
        orbX_expanded = EXPANDED_MARGIN + PANEL_W + GAP
      }

      if (layout && layout.panelGoesUp) {
        orbY_expanded = EXPANDED_MARGIN + PANEL_H - 64
      } else {
        orbY_expanded = EXPANDED_MARGIN
      }

      // Shift the window so the orb perfectly overlaps its old physical screen position
      let newX = targetScreenX - orbX_expanded
      let newY = targetScreenY - orbY_expanded
      
      // We no longer strictly clamp to screen bounds because the React layout logic
      // ALREADY guarantees that this orientation perfectly fits on the screen.
      // Clamping here might break the visual stillness of the orb.
      
      // Save pre-open position
      orbWindow.preOpenPos = { x: currentX, y: currentY }
      
      orbWindow.setBounds({ x: newX, y: newY, width: EXPANDED_W, height: EXPANDED_H })
    } else {
      // Restore to exact original orb position
      let newX = currentX
      let newY = currentY
      if (orbWindow.preOpenPos) {
        newX = orbWindow.preOpenPos.x
        newY = orbWindow.preOpenPos.y
      }
      
      orbWindow.setBounds({ x: newX, y: newY, width: ORB_SIZE, height: ORB_SIZE })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOrbWindow()
    }
  })

  // Global hotkey to rescue the orb
  const rescueOrb = () => {
    if (orbWindow && !orbWindow.isDestroyed()) {
      orbWindow.setIgnoreMouseEvents(false)
      
      // If lost off screen, center it
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenW, height: screenH } = primaryDisplay.workAreaSize
      orbWindow.setPosition(screenW / 2 - ORB_SIZE / 2, screenH / 2 - ORB_SIZE / 2)
      
      orbWindow.show()
      orbWindow.focus()
      orbWindow.setAlwaysOnTop(true, 'screen-saver')
      orbWindow.webContents.send('global-hotkey-triggered')
    }
  }

  globalShortcut.register('Alt+S', rescueOrb)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
