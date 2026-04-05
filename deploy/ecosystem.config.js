// =============================================================================
// MAMALI PM2 Ecosystem Configuration
// Usage:
//   pm2 start ecosystem.config.js --env production
//   pm2 save && pm2 startup
// =============================================================================

module.exports = {
  apps: [
    // ─── Backend API ──────────────────────────────────────────────────────
    {
      name: 'mamali-backend',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 'max',      // one per CPU core
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        LOG_TO_FILE: 'true',
        ENABLE_DB_LOGS: 'true',
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      // Health check
      exp_backoff_restart_delay: 100,
    },

    // ─── Customer Storefront ──────────────────────────────────────────────
    {
      name: 'mamali-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
    },

    // ─── Admin Dashboard ──────────────────────────────────────────────────
    {
      name: 'mamali-admin',
      cwd: './admin',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/admin-error.log',
      out_file: './logs/admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
