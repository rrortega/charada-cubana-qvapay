// Entry point: `npm start`

import { createServer, getSync } from './server.js';
import { startScheduler } from '../sync/resultsSync.js';

const port = Number(process.env.PORT ?? 3000);
const server = createServer();

server.listen(port, () => {
  console.log(`charada-cubana listening on http://localhost:${port}`);
});

// Keep results fresh even with no traffic. On-demand reads also trigger a
// refresh, but the timer guarantees the data is warm when the first visitor
// arrives right after a draw is published.
const sync = getSync();
const stopScheduler = startScheduler(sync);
sync.refresh({ force: true }).catch(() => {});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopScheduler();
    server.close(() => process.exit(0));
  });
}
