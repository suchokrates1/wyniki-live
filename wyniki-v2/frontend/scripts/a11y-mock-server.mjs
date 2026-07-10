/* Static + mock-API server for the public a11y scan (CI-friendly, no backend).
   Serves the built frontend from ../../wyniki/static and answers the public
   API endpoints from scripts/a11y-fixtures/*.json so data-dependent routes
   (live scores with an active match, tournaments, bracket, schedule) render. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC = normalize(join(__dirname, '..', '..', 'wyniki', 'static'));
const FIXTURES = join(__dirname, 'a11y-fixtures');

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon', '.woff2':'font/woff2', '.map':'application/json' };

// Public API path -> fixture file
const API_MAP = {
  '/api/snapshot': 'snapshot.json',
  '/api/history': 'history.json',
  '/api/tournament/list': 'tournament-list.json',
  '/api/tournament/bracket': 'tournament-bracket.json',
  '/api/tournament/schedule': 'tournament-schedule.json',
  '/api/tournament/info': 'tournament-info.json',
  '/api/players/all': 'players-all.json',
};

async function serveFixture(res, file) {
  try {
    const body = await readFile(join(FIXTURES, file));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('null');
  }
}

export function start(port = 8811) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/api/')) {
      if (p === '/api/stream') { // SSE: keep open, send nothing (app falls back to polling)
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(':ok\n\n');
        return; // intentionally left open
      }
      if (API_MAP[p]) return serveFixture(res, API_MAP[p]);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('null');
      return;
    }

    const file = normalize(join(STATIC, p === '/' ? '/index.html' : p));
    if (!file.startsWith(STATIC)) { res.writeHead(403); res.end('forbidden'); return; }
    try {
      const s = await stat(file);
      if (s.isDirectory()) throw new Error('dir');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      try { // SPA fallback
        const body = await readFile(join(STATIC, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    }
  });
  return new Promise((resolve) => server.listen(port, () => {
    console.log(`a11y mock server: http://localhost:${port} (static: ${STATIC})`);
    resolve(server);
  }));
}

// Run standalone: `node scripts/a11y-mock-server.mjs [port]`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('a11y-mock-server.mjs')) {
  start(Number(process.argv[2]) || 8811);
}
