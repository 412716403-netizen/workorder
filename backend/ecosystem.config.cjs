/**
 * PM2 集群（生产环境）。与 systemd 搭配：ExecStart=pm2-runtime start ecosystem.config.cjs
 * @see docs/10-capacity-and-scaling.md
 */
module.exports = {
  apps: [
    {
      name: 'smarttrack-api',
      script: 'dist/backend/src/index.js',
      cwd: __dirname,
      instances: 4,
      exec_mode: 'cluster',
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
