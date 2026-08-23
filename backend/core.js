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
const ok = body => ({ status: 200, body });
const newToken = () => crypto.randomBytes(32).toString('hex');

async function register(driver, login, password) {
  login = String(login || '').trim().toLowerCase();
  password = String(password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(login))
    throw new HttpError(400, 'Логин: 3–30 символов — латиница, цифры, . _ -');
  if (password.length < 4)
    throw new HttpError(400, 'Пароль: минимум 4 символа');
  if (await driver.getUserByLogin(login))
    throw new HttpError(409, 'Такой логин уже занят');
  const salt = crypto.randomBytes(16).toString('hex');
  const userId = await driver.createUser(login, hash(password, salt), salt);
  const token = newToken();
  await driver.createSession(token, userId, Date.now() + SESSION_TTL);
  return ok({ token });
}

async function login(driver, loginName, password) {
  const user = await driver.getUserByLogin(String(loginName || '').trim().toLowerCase());
  if (!user || user.pass_hash !== hash(password, user.salt))
    throw new HttpError(401, 'Неверный логин или пароль');
  const token = newToken();
  await driver.createSession(token, user.id, Date.now() + SESSION_TTL);
  return ok({ token });
}

/* Единая точка входа: handle(driver, { method, path, body, token }) → { status, body } */
async function handle(driver, { method, path, body = {}, token = '' }) {
  try {
    if (driver.init) await driver.init();
    const route = method + ' ' + path.replace(/^\/?api\//, '');

    if (route === 'GET ping') return ok({ ok: true });
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
      await driver.putState(session.user_id, body);
      return ok({ ok: true });
    }

    throw new HttpError(404, 'Неизвестный маршрут');
  } catch (e) {
    return { status: e.status || 500, body: { error: e.message || 'Внутренняя ошибка' } };
  }
}

module.exports = { handle };
