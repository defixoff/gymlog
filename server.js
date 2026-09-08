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
  const file = process.env.GYMLOG_DB || path.join(__dirname, 'data', 'gymlog.db');
  try {
    driver = require('./backend/db-sqlite.js').create(file);
    dbLabel = 'SQLite (data/gymlog.db)';
  } catch (e) {
    // Node < 22 без node:sqlite — падаем на JSON-файл, чтобы проект запускался везде
    driver = require('./backend/db-json.js').create(file.replace(/\.db$/, '.json'));
    dbLabel = 'JSON-файл (data/gymlog.json) — node:sqlite недоступен: ' + e.message.split('\n')[0];
  }
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
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

  /* --- статика: только белый список расширений, никаких скрытых файлов/данных --- */
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const segs = path.relative(ROOT, file).split(path.sep);
  const ext = path.extname(file).toLowerCase();
  const blocked = !file.startsWith(ROOT + path.sep) || segs.some(s => s.startsWith('.') || s === '..')
    || ['data', 'backend', 'api', 'node_modules'].includes(segs[0]) || !MIME[ext]
    || /^(server|test-[a-z]+)\.js$/.test(segs[0]) || segs[0] === 'package.json' || segs[0] === 'package-lock.json';
  if (blocked) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' || err.code === 'EISDIR' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const cache = ext === '.html' || segs[0] === 'sw.js' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}).listen(PORT, HOST, () => console.log(`GymLog: http://localhost:${PORT}  (база: ${dbLabel})`));
