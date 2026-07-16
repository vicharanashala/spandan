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
const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

const app = express();
const DIST_DIR = path.join(__dirname, 'dist');

// Connection pooling agent — reuses TCP connections to the backend
const proxyAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 200,
  maxFreeSockets: 30,
  timeout: 60000,
  keepAliveMsecs: 30000
});

function proxyReq(req, res, targetPath, isSocketIO = false) {
  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: targetPath,
    method: req.method,
    agent: proxyAgent,
    headers: {
      ...req.headers,
      host: `${BACKEND_HOST}:${BACKEND_PORT}`,
      'X-Forwarded-For': req.ip,
      'X-Forwarded-Proto': 'https'
    }
  };

  if (isSocketIO && req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
    const proxyReq = http.request(options);
    proxyReq.on('error', (e) => {
      console.error('WebSocket proxy error:', e.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'WebSocket proxy error' });
      }
    });
    proxyReq.setTimeout(86400, () => {
      proxyReq.destroy();
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const clientSocket = req.socket;
      if (!clientSocket || clientSocket.destroyed) { proxySocket.destroy(); return; }
      clientSocket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      if (proxyHead.length > 0) clientSocket.write(proxyHead);
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
      if (res.headersSent) return;
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    req.pipe(proxyReq);
    proxyReq.on('error', (e) => {
      if (!res.headersSent) {
        res.status(502).json({ error: e.message });
      }
    });
  }
}

// API proxy: BASE_PATH/api/* -> localhost:3001/api/*
app.use(BASE_PATH + '/api', (req, res) => {
  const targetPath = '/api' + req.url.replace(BASE_PATH + '/api', '');
  proxyReq(req, res, targetPath);
});

// Socket.IO proxy: BASE_PATH/socket.io/* -> localhost:3001/socket.io/*
app.use(BASE_PATH + '/socket.io', (req, res) => {
  const targetPath = '/socket.io' + req.url.replace(BASE_PATH + '/socket.io', '');
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

const httpServer = createServer(app);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  httpServer.close(() => {
    proxyAgent.destroy();
    console.log('Server shut down.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

httpServer.listen(5002, '127.0.0.1', () => {
  console.log(`Spandan proxy running on port 5002 (BASE_PATH=${BASE_PATH})`);
});
