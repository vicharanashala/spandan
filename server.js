const express = require('express');
const { createServer } = require('http');
const http = require('http');
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

function proxyReq(req, res, targetPath, isSocketIO = false) {
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

  if (isSocketIO && req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
    const proxyReq = http.request(options);
    proxyReq.on('error', (e) => {
      console.error('WebSocket proxy error:', e.message);
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const clientSocket = req.socket;
      if (!clientSocket || clientSocket.destroyed) { proxySocket.destroy(); return; }
      clientSocket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
      proxySocket.on('error', (e) => { clientSocket.destroy(); });
      clientSocket.on('error', (e) => { proxySocket.destroy(); });
    });
    proxyReq.on('response', (proxyRes) => {
      proxyRes.on('data', () => {});
      proxyRes.on('end', () => {});
    });
    req.pipe(proxyReq);
  } else {
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    req.pipe(proxyReq);
    proxyReq.on('error', (e) => { res.status(502).json({ error: e.message }); });
  }
}

// API proxy: BASE_PATH/api/* -> localhost:3001/api/*
app.use(BASE_PATH + '/api', (req, res) => {
  const targetPath = '/api' + req.url.replace(BASE_PATH + '/api', '');
  proxyReq(req, res, targetPath);
});

// Socket.IO proxy: BASE_PATH/socket.io/* -> backend socket path
app.use(BASE_PATH + '/socket.io', (req, res) => {
  const backendBase = (process.env.BASE_PATH || BASE_PATH || '').replace(/\/+$/, '');
  const backendSocketPath = backendBase + '/socket.io';
  const targetPath = backendSocketPath + req.url.replace(BASE_PATH + '/socket.io', '');
  proxyReq(req, res, targetPath, true);
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

createServer(app).listen(5002, '127.0.0.1', () => {
  console.log('Spandan server running on port 5002 (BASE_PATH=' + BASE_PATH + ')');
});