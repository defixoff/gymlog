'use strict';
/* Общая логика API: авторизация + состояние каждого пользователя.
   Работает одинаково с любым драйвером БД:
   локально — SQLite (backend/db-sqlite.js), на Vercel — PostgreSQL (backend/db-postgres.js).

   Интерфейс драйвера:
     init?, getUserByLogin, createUser, createSession,
     getSession, deleteSession, getState, putState            */
const crypto = require('node:crypto');

const SESSION_TTL = 30 * 24 * 3600 * 1000; // сессия живёт 30 дней

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const hash = (password, salt) => crypto.scryptSync(String(password), salt, 64).toString('hex');
/* сравнение хешей за постоянное время — без утечки по таймингу */
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* простой rate-limit на вход/регистрацию: 10 попыток в минуту на логин */
const attempts = new Map();
function throttle(key) {
  const now = Date.now(), a = attempts.get(key) || [];
  const recent = a.filter(t => now - t < 60_000);
  if (recent.length >= 10) throw new HttpError(429, 'Слишком много попыток — подождите минуту');
  recent.push(now); attempts.set(key, recent);
  if (attempts.size > 5000) attempts.clear();
}
const MAX_STATE = 2 * 1024 * 1024; // 2 МБ на состояние
const ok = body => ({ status: 200, body });
const newToken = () => crypto.randomBytes(32).toString('hex');

async function register(driver, login, password) {
  login = String(login || '').trim().toLowerCase();
  password = String(password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(login))
    throw new HttpError(400, 'Логин: 3–30 символов — латиница, цифры, . _ -');
  if (password.length < 6)
    throw new HttpError(400, 'Пароль: минимум 6 символов');
  if (password.length > 200) throw new HttpError(400, 'Пароль слишком длинный');
  throttle('reg:' + login);
  if (await driver.getUserByLogin(login))
    throw new HttpError(409, 'Такой логин уже занят');
  const salt = crypto.randomBytes(16).toString('hex');
  const userId = await driver.createUser(login, hash(password, salt), salt);
  const token = newToken();
  await driver.createSession(token, userId, Date.now() + SESSION_TTL);
  return ok({ token });
}

async function login(driver, loginName, password) {
  loginName = String(loginName || '').trim().toLowerCase();
  throttle('login:' + loginName);
  const user = await driver.getUserByLogin(loginName);
  // при отсутствии пользователя всё равно считаем хеш — одинаковое время ответа
  const ok_ = user ? safeEq(user.pass_hash, hash(password, user.salt)) : (hash(password, 'dummy'), false);
  if (!ok_) throw new HttpError(401, 'Неверный логин или пароль');
  if (driver.purgeSessions && Math.random() < 0.1) driver.purgeSessions(Date.now()).catch(() => {});
  const token = newToken();
  await driver.createSession(token, user.id, Date.now() + SESSION_TTL);
  return ok({ token });
}

/* Единая точка входа: handle(driver, { method, path, body, token }) → { status, body } */
async function handle(driver, { method, path, body = {}, token = '' }) {
  try {
    const route = method + ' ' + path.replace(/^\/?api\//, '');

    // ping отвечает мгновенно, без подключения к БД — иначе холодный старт
    // serverless-функции уводит фронтенд в гостевой режим
    if (route === 'GET ping') return ok({ ok: true });

    if (driver.init) await driver.init();
    if (route === 'POST register') return await register(driver, body.login, body.password);
    if (route === 'POST login') return await login(driver, body.login, body.password);
    if (route === 'POST logout') {
      if (token) await driver.deleteSession(token);
      return ok({ ok: true });
    }

    const session = token ? await driver.getSession(token) : null;
    if (!session || +session.expires < Date.now())
      throw new HttpError(401, 'Не авторизован');

    if (route === 'GET me') return ok({ login: session.login });
    if (route === 'GET state') return ok({ state: await driver.getState(session.user_id) });
    if (route === 'PUT state') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Некорректное состояние');
      if (JSON.stringify(body).length > MAX_STATE) throw new HttpError(413, 'Состояние слишком большое');
      await driver.putState(session.user_id, body);
      return ok({ ok: true });
    }

    throw new HttpError(404, 'Неизвестный маршрут');
  } catch (e) {
    return { status: e.status || 500, body: { error: e.message || 'Внутренняя ошибка' } };
  }
}

module.exports = { handle };
