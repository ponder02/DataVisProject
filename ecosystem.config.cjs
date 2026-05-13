module.exports = {
  apps: [
    {
      name: 'crypto-matrix',
      script: 'src/run-matrix.mjs',
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 5000    // wait 5s before restarting after crash
    }
  ]
};
