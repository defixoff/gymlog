/* Проверка подключения к PostgreSQL из .env.local (DATABASE_URL) */
const fs = require('node:fs');
const path = require('node:path');
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL не найден в .env.local'); process.exit(1); }

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const { rows } = await pool.query('SELECT version()');
  console.log('CONNECTED:', rows[0].version);
  await pool.end();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
