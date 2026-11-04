// Minimal HTTP server for the mini-app.
//
// Deliberately dependency-free for now: the surface is two routes plus static
// files. QvaPay's WebView requirements drive the headers:
//   * https only in production (the simulator accepts http://localhost)
//   * the simulator embeds us in an iframe, so frame-ancestors must allow
//     qvapay.com or the simulator pane renders blank
//   * no shared cookies and no window.open; the page never sees a QvaPay token

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool } from '../db/pool.js';
import { handleApi } from './routes.js';
import { createSync } from '../sync/resultsSync.js';

// One sync instance for the process. Reads use it to refresh opportunistically,
// the scheduler uses it periodically, and both share the same single-flight lock.
let sync = null;
export function getSync() {
  if (!sync) sync = createSync({ pool: getPool() });
  return sync;
}

const ROOT = resolve(fileURLToPath(new URL('../../public', import.meta.url)));

// Browser-facing ES modules under src/ that the page imports. Whitelisted by
// exact path: the server never exposes src/ generally, so DB and ingest code
// cannot be fetched.
const EXPOSED_SRC = new Map([
  ['/src/sdk/qvapay.js', resolve(fileURLToPath(new URL('../sdk/qvapay.js', import.meta.url)))],
  ['/src/ui/ripple.js', resolve(fileURLToPath(new URL('../ui/ripple.js', import.meta.url)))],
  ['/src/ui/calendar.js', resolve(fileURLToPath(new URL('../ui/calendar.js', import.meta.url)))],
  ['/src/ui/scrollLock.js', resolve(fileURLToPath(new URL('../ui/scrollLock.js', import.meta.url)))],
  ['/src/ui/icons.js', resolve(fileURLToPath(new URL('../ui/icons.js', import.meta.url)))],
  ['/src/ui/motion.js', resolve(fileURLToPath(new URL('../ui/motion.js', import.meta.url)))],
  ['/src/ui/session.js', resolve(fileURLToPath(new URL('../ui/session.js', import.meta.url)))],
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  // The simulator embeds the page; allow qvapay.com and localhost for dev.
  'content-security-policy':
    "default-src 'self'; script-src 'self' https://www.qvapay.com; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'self' https://www.qvapay.com https://qvapay.com " +
    'http://localhost:* http://127.0.0.1:*',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

async function serveStatic(pathname, res) {
  // Whitelisted source modules first.
  const exposed = EXPOSED_SRC.get(pathname);
  if (exposed) {
    try {
      const body = await readFile(exposed);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': MIME['.js'],
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, SECURITY_HEADERS).end();
    }
    return;
  }

  // Resolve then verify containment: never serve outside public/.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(join(ROOT, normalize(rel)));
  if (!filePath.startsWith(`${ROOT}/`) && filePath !== ROOT) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      // Images and fonts rarely change; HTML and JS must never be stale.
      'cache-control': /\.(png|jpe?g|webp|svg|ico)$/.test(filePath)
        ? 'public, max-age=86400'
        : 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export function createServer({ pool = getPool() } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    const sync = getSync();
    // Reads of draw data kick a background refresh. It never blocks: the
    // response is built from whatever is stored, and the next request is fresh.
    if (req.method === 'GET' && (url.pathname === '/api/tiro' || url.pathname === '/api/dias')) {
      sync.refresh().catch(() => {});
    }

    if (await handleApi(req, res, url, pool)) return;

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }

    await serveStatic(url.pathname, res);
  });
}
