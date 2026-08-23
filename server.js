'use strict';
/* Локальный сервер GymLog: статика + API.
   Ноль обязательных зависимостей (node:http + встроенный node:sqlite, Node ≥ 22).

   Выбор базы:
   • есть DATABASE_URL (в .env.local или окружении) → PostgreSQL (нужен npm i pg)
   • нет → SQLite в data/gymlog.db

   Запуск:  node server.js   →   http://localhost:3000 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./backend/core.js');

/* --- загрузка .env.local (простой парсер, без зависимостей) --- */
try {
  const envText = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

/* --- выбор драйвера БД --- */
let driver, dbLabel;
if (process.env.DATABASE_URL) {
  driver = require('./backend/db-postgres.js').create(process.env.DATABASE_URL);
  dbLabel = 'PostgreSQL (DATABASE_URL)';
} else {
  driver = require('./backend/db-sqlite.js')
    .create(process.env.GYMLOG_DB || path.join(__dirname, 'data', 'gymlog.db'));
  dbLabel = 'SQLite (data/gymlog.db)';
}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  /* --- API --- */
  if (url.pathname.startsWith('/api/')) {
    try {
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const out = await core.handle(driver, { method: req.method, path: url.pathname, body, token });
      res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out.body));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }

  /* --- статика --- */
  const file = path.normalize(path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(ROOT) || file === ROOT) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' || err.code === 'EISDIR' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`GymLog: http://localhost:${PORT}  (база: ${dbLabel})`));
