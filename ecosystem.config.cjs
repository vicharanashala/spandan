// PM2 cluster mode — run one backend worker per CPU core instead of a single process.
// This is half of the login-surge fix: native bcrypt (see models/User.js) keeps each hash off the
// event loop, and cluster mode spreads the hashing + request load across every core.
//
// Config comes from the app's own environment (backend/.env, loaded by dotenv in index.js) — this
// file does NOT hardcode PORT, NODE_ENV, REDIS_URL, etc. Set those where you already set them so
// the backend keeps listening on your deployment's port. The one exception is UV_THREADPOOL_SIZE:
// libuv reads it at process startup, before dotenv runs, so it must be set in the launch env here.
//
//   Prereq: REDIS_URL must be set (in backend/.env). In cluster mode, Socket.IO broadcasts only
//   reach clients on the SAME worker unless a shared adapter is used — index.js enables the Redis
//   adapter when REDIS_URL is present. Running cluster WITHOUT Redis silently breaks cross-worker
//   real-time delivery (the app logs a warning if REDIS_URL is unset).
//
//   Start:  pm2 start ecosystem.config.cjs
//   Logs:   pm2 logs spandan-backend
//   Reload: pm2 reload spandan-backend   (zero-downtime)
//
// Stickiness note: the browser client connects websocket-first (a single long-lived connection
// pinned to one worker), so cluster round-robin is fine. To support HTTP long-polling fallback at
// scale, add sticky sessions at nginx or force websocket-only transport.

module.exports = {
  apps: [
    {
      name: 'spandan-backend',
      script: 'src/index.js',
      cwd: './backend',
      exec_mode: 'cluster',
      // Worker count: override with WEB_CONCURRENCY, else one per core.
      instances: process.env.WEB_CONCURRENCY || 'max',
      env: {
        // Only variable set here — it must exist before the process boots (libuv reads it at
        // startup, so backend/.env is too late). Overridable; sensible default. Everything else
        // (PORT, NODE_ENV, MONGODB_URI, REDIS_URL, JWT_SECRET, ...) comes from backend/.env.
        UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || 16
      },
      max_memory_restart: '600M',
      kill_timeout: 5000,
      wait_ready: false
    }
  ]
}
