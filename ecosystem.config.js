module.exports = {
  apps: [
    {
      name: 'spandan-backend',
      script: 'backend/src/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      },
      exp_backoff_restart_delay: 100,
      listen_timeout: 10000,
      kill_timeout: 5000,
      // Graceful shutdown
      shutdown_with_message: true,
      // Logging
      error_file: '/var/log/pm2/spandan-backend-error.log',
      out_file: '/var/log/pm2/spandan-backend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'spandan-proxy',
      script: 'server.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production'
      },
      exp_backoff_restart_delay: 100,
      listen_timeout: 10000,
      kill_timeout: 5000,
      error_file: '/var/log/pm2/spandan-proxy-error.log',
      out_file: '/var/log/pm2/spandan-proxy-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
}
