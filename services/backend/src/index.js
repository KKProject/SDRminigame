const { createBackendServer } = require('./server');

createBackendServer()
  .then((app) => app.listen().then(() => {
    console.log(`[backend] listening on ${app.config.port}`);
  }))
  .catch((err) => {
    console.error('[backend] failed to start', err);
    process.exit(1);
  });
