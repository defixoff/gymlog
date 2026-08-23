/* Vercel serverless: единая точка для всех маршрутов /api/*.
   Использует PostgreSQL (переменная окружения DATABASE_URL).
   Таблицы создаются автоматически при первом запросе. */
const core = require('../backend/core.js');
const dbPostgres = require('../backend/db-postgres.js');

let driver = null;

module.exports = async function handler(req, res) {
  const parts = Array.isArray(req.query.api) ? req.query.api : [req.query.api].filter(Boolean);
  const path = '/api/' + parts.join('/');

  // ping отвечает мгновенно и без DATABASE_URL — фронтенд по нему определяет,
  // что сервер жив (иначе холодный старт уводит приложение в гостевой режим)
  if (req.method === 'GET' && path === '/api/ping') {
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
