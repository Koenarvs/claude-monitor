module.exports = {
  apps: [{
    name: 'claude-monitor',
    script: 'dist/server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
    },
  }],
};
