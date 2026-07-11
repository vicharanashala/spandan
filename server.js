const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env from frontend/.env to get BASE_PATH
const envPath = path.join(__dirname, 'frontend', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.substring(0, eqIdx).trim();
      const val = line.substring(eqIdx + 1).trim();
      if (key) process.env[key] = val;
    }
  }
}

const BASE_PATH = process.env.VITE_BASE_PATH || '/spandan';

const app = express();
const DIST_DIR = path.join(__dirname, 'dist');

function proxyReq(req, res, targetPath) {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: 'localhost:3001',
      'X-Forwarded-For': req.ip,
      'X-Forwarded-Proto': 'https'
    }
  };

  const proxyRequest = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  req.pipe(proxyRequest);
  proxyRequest.on('error', (e) => {
    // FIX: guard against writing after headers already sent
    if (!res.headersSent) {
      res.status(502).json({ error: e.message });
    }
  });
}

// API proxy: BASE_PATH/api/* -> localhost:3001/api/*
app.use(BASE_PATH + '/api', (req, res) => {
  proxyReq(req, res, '/api' + req.url);
});

// Socket.IO HTTP polling proxy: BASE_PATH/socket.io/* -> localhost:3001/spandan/socket.io/*
// (WebSocket upgrades are handled separately via server.on('upgrade') below)
app.use(BASE_PATH + '/socket.io', (req, res) => {
  proxyReq(req, res, '/spandan/socket.io' + req.url);
});

// Static assets
app.use(BASE_PATH + '/assets', express.static(DIST_DIR));

// Static files: BASE_PATH/*
app.use(BASE_PATH, express.static(DIST_DIR));

// SPA fallback
app.get(BASE_PATH + '/*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.get('/', (req, res) => res.redirect(BASE_PATH + '/'));

// FIX: store server reference so we can attach WebSocket upgrade handler
const server = http.createServer(app);

// FIX: WebSocket upgrades bypass Express app.use() entirely in Node.js — they
// fire the 'upgrade' event on the raw HTTP server. Without this, Socket.IO
// silently falls back to HTTP long-polling only (the WS path in proxyReq was
// unreachable dead code).
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  const socketIoPrefix = BASE_PATH + '/socket.io';

  if (!url.startsWith(socketIoPrefix)) {
    socket.destroy();
    return;
  }

  const targetPath = '/spandan/socket.io' + url.slice(socketIoPrefix.length);
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: targetPath,
    headers: {
      ...req.headers,
      host: 'localhost:3001',
      'X-Forwarded-For': socket.remoteAddress,
      'X-Forwarded-Proto': 'https'
    }
  };

  const proxyRequest = http.request(options);
  proxyRequest.on('upgrade', (proxyRes, proxySocket) => {
    if (socket.destroyed) { proxySocket.destroy(); return; }
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });
  proxyRequest.on('error', (e) => {
    console.error('WebSocket proxy error:', e.message);
    socket.destroy();
  });
  req.pipe(proxyRequest);
});

server.listen(5002, '127.0.0.1', () => {
  console.log('Spandan server running on port 5002 (BASE_PATH=' + BASE_PATH + ')');
});