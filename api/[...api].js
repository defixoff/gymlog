/* Vercel serverless: единая точка для всех маршрутов /api/*.
   PostgreSQL через DATABASE_URL; таблицы создаются при первом запросе. */
const core = require('../backend/core.js');
const dbPostgres = require('../backend/db-postgres.js');

let driver = null;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // путь берём из req.url: req.query.api на части деплоев приходит пустым
    const rawPath = (req.url || '/').split('?')[0];
    const parts = rawPath.replace(/^\/?api\/?/, '').split('/').filter(Boolean);
    const path = '/api/' + parts.join('/');

    if (req.method === 'GET' && parts[0] === 'ping') return res.status(200).json({ ok: true });

    if (!process.env.DATABASE_URL)
      return res.status(500).json({ error: 'Переменная DATABASE_URL не настроена' });
    driver ||= dbPostgres.create(process.env.DATABASE_URL);

    // тело: Vercel парсит JSON сам, но при нестандартном content-type отдаёт строку
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const out = await core.handle(driver, { method: req.method, path, body, token });
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('API error:', e);
    res.status(500).json({ error: 'Сервер временно недоступен, попробуйте позже' });
  }
};
