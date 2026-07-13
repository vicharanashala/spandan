// PM2 cluster mode — run one backend worker per CPU core instead of a single process.
// This is half of the login-surge fix: native bcrypt (see models/User.js) keeps each hash off the
// event loop, and cluster mode spreads the hashing + request load across every core.
//
//   Prereq: REDIS_URL must be set. In cluster mode, Socket.IO broadcasts (io.to(room).emit) only
//   reach clients on the SAME worker unless a shared adapter is used — index.js enables the Redis
//   adapter when REDIS_URL is present. Running cluster WITHOUT Redis will silently break real-time
//   delivery across workers.
//
//   Start:  REDIS_URL=redis://localhost:6379 pm2 start ecosystem.config.cjs
//   Logs:   pm2 logs spandan-backend
//   Reload: pm2 reload spandan-backend   (zero-downtime)
//
// Stickiness note: the browser client connects websocket-first (single long-lived connection that
// stays pinned to one worker), so cluster round-robin is fine for it. If you must support HTTP
// long-polling fallback at scale, add sticky sessions at nginx or force websocket-only transport.

module.exports = {
  apps: [
    {
      name: 'spandan-backend',
      script: 'src/index.js',
      cwd: './backend',
      exec_mode: 'cluster',
      instances: process.env.WEB_CONCURRENCY || 'max', // one worker per core
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Native bcrypt hashes on libuv's threadpool; give it room so a login burst hashes in
        // parallel instead of queueing behind the default 4 threads.
        UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || 16
      },
      max_memory_restart: '600M',
      kill_timeout: 5000,
      wait_ready: false
    }
  ]
}
