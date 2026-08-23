
/* Vercel serverless: единая точка для всех маршрутов /api/*.
   Использует PostgreSQL (переменная окружения DATABASE_URL).
   Таблицы создаются автоматически при первом запросе. */
const core = require('../backend/core.js');
const dbPostgres = require('../backend/db-postgres.js');

let driver = null;

module.exports = async function handler(req, res) {
  console.log('[DEBUG]', JSON.stringify({ url: req.url, query: req.query, method: req.method }));
  const parts = Array.isArray(req.query.api) ? req.query.api : [req.query.api].filter(Boolean);
  const parts = Array.isArray(req.query.api) ? req.query.api : [req.query.api].filter(Boolean);
  const path = '/api/' + parts.join('/');

  // Очищаем путь от возможной косой черты (слэша) на конце
  const cleanPath = path.replace(/\/$/, ''); 

  // Проверка ping теперь защищена от лишних слэшей и параметров
  if (req.method === 'GET' && (cleanPath === '/api/ping' || parts[0] === 'ping')) {
    return res.status(200).json({ ok: true });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Переменная DATABASE_URL не настроена' });
  }
  driver ||= dbPostgres.create(process.env.DATABASE_URL);

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const out = await core.handle(driver, {
    method: req.method,
    path,
    body: req.body || {},
    token,
  });
  res.status(out.status).json(out.body);
};
