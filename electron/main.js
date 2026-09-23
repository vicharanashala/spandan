const { app, BrowserWindow, shell, session, desktopCapturer, Notification, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { fork } = require('child_process');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

let prodServer = null;
let backendProcess = null;
let mainWindow = null;

function getTunnelUrl() {
  try {
    const tunnelFile = path.join(app.getAppPath(), 'tunnel-link.txt');
    if (fs.existsSync(tunnelFile)) {
      const link = fs.readFileSync(tunnelFile, 'utf8').trim();
      if (link.startsWith('http')) return link;
    }
  } catch (e) { }
  return null;
}

function ensureBackendServer() {
  return new Promise((resolve) => {
    const checkReq = http.get('http://127.0.0.1:3001/api/health', () => {
      console.log('[Electron] Express backend is already running on port 3001.');
      resolve();
    });

    checkReq.on('error', () => {
      const backendScript = path.join(app.getAppPath(), 'backend/src/index.js');
      const backendCwd = path.join(app.getAppPath(), 'backend');

      if (fs.existsSync(backendScript)) {
        try {
          backendProcess = fork(backendScript, [], {
            cwd: backendCwd,
            env: { ...process.env, PORT: '3001' }
          });

          backendProcess.on('error', (err) => {
            console.error('[Electron] Backend process error:', err);
          });
        } catch (e) {
          console.error('[Electron] Failed to fork backend process:', e);
        }
      }
      resolve();
    });

    checkReq.end();
  });
}

function startProdServer(distPath) {
  return new Promise((resolve) => {
    if (prodServer) {
      return resolve({ port: prodServer.address().port });
    }

    const server = http.createServer((req, res) => {
      // Proxy /api and /spandan/socket.io requests to local Express backend on port 3001
      if (req.url.startsWith('/api') || req.url.startsWith('/spandan/socket.io')) {
        const tunnelUrlStr = getTunnelUrl();

        const sendProxy = (targetHost, targetPort, isHttps = false) => {
          const transport = isHttps ? https : http;
          const headers = { ...req.headers };
          if (isHttps) {
            headers.host = targetHost;
          }

          const proxyReq = transport.request(
            {
              hostname: targetHost,
              port: targetPort,
              path: req.url,
              method: req.method,
              headers: headers
            },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res, { end: true });
            }
          );

          proxyReq.on('error', (err) => {
            console.error('[ProdServer Proxy Error]:', err.message);
            if (!isHttps && tunnelUrlStr) {
              try {
                const parsed = new URL(tunnelUrlStr);
                sendProxy(parsed.hostname, parsed.port || 443, parsed.protocol === 'https:');
                return;
              } catch (e) { }
            }
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Backend server unavailable. Please start backend or tunnel.' }));
          });

          req.pipe(proxyReq, { end: true });
        };

        sendProxy('127.0.0.1', 3001, false);
        return;
      }

      let reqPath = req.url.split('?')[0];

      if (reqPath.startsWith('/spandan')) {
        reqPath = reqPath.replace(/^\/spandan/, '');
      }
      if (reqPath === '' || reqPath === '/') {
        reqPath = '/index.html';
      }

      let filePath = path.join(distPath, reqPath);

      if (!filePath.startsWith(distPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          filePath = path.join(distPath, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, data) => {
          if (readErr) {
            console.error('[ProdServer] Read error:', readErr.message, 'file:', filePath);
            res.writeHead(500);
            res.end('Error loading file');
            return;
          }
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      });
    });

    server.listen(0, '127.0.0.1', () => {
      prodServer = server;
      resolve({ port: server.address().port });
    });
  });
}

async function createWindow() {
  const iconInPublicIco = path.join(__dirname, '../frontend/public/spandan-icon.ico');
  const iconInDist = path.join(app.getAppPath(), 'dist/spandan-icon.png');
  const iconInPublicPng = path.join(__dirname, '../frontend/public/spandan-icon.png');

  const appIcon = fs.existsSync(iconInPublicIco)
    ? iconInPublicIco
    : (fs.existsSync(iconInDist) ? iconInDist : iconInPublicPng);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    await ensureBackendServer();
    const distPath = path.join(app.getAppPath(), 'dist');
    const { port } = await startProdServer(distPath);
    win.loadURL(`http://127.0.0.1:${port}/spandan/`);
  }
}

// --- IPC handlers (registered once, before any window is created) ---

// Native desktop notifications (Change 2)
ipcMain.handle('notification:show', (_event, payload) => {
  if (!Notification.isSupported()) {
    return { ok: false, reason: 'not-supported' };
  }

  const title = String(payload?.title ?? '').slice(0, 200);
  const body = String(payload?.body ?? '').slice(0, 500);

  if (!title) {
    return { ok: false, reason: 'missing-title' };
  }

  const notif = new Notification({ title, body });
  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  notif.show();
  return { ok: true };
});

// Native file dialogs (Change 3)
ipcMain.handle('dialog:openFile', async (_event, options) => {
  const title = String(options?.title ?? 'Open File').slice(0, 200);
  const filters = Array.isArray(options?.filters) && options.filters.length > 0
    ? options.filters
    : [{ name: 'All Files', extensions: ['*'] }];

  const result = await dialog.showOpenDialog(mainWindow, { title, filters });
  return { canceled: result.canceled, filePaths: result.filePaths };
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const title = String(options?.title ?? 'Save File').slice(0, 200);
  const defaultPath = options?.defaultPath ? String(options.defaultPath) : undefined;
  const filters = Array.isArray(options?.filters) && options.filters.length > 0
    ? options.filters
    : [{ name: 'All Files', extensions: ['*'] }];

  const result = await dialog.showSaveDialog(mainWindow, { title, defaultPath, filters });
  return { canceled: result.canceled, filePath: result.filePath };
});

app.whenReady().then(() => {
  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({ video: null, audio: null });
        }
      }).catch((err) => {
        console.error('[DisplayMedia] Error fetching desktop capturer sources:', err);
        callback({ video: null, audio: null });
      });
    }, { useSystemPicker: true }); // <-- ADDED: required on macOS so getDisplayMedia's
                                    //     audio: 'loopback' request routes through Apple's
                                    //     native ScreenCaptureKit picker. Without this,
                                    //     macOS silently returns video with no audio track,
                                    //     even after Screen Recording permission is granted.
                                    //     Harmless / mostly no-op on Windows.
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    try { backendProcess.kill(); } catch (e) { }
  }
  if (prodServer) {
    prodServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});