'use strict';
/* Драйвер PostgreSQL — для деплоя на Vercel.
   Нужен пакет pg (ставится автоматически при деплое) и переменная DATABASE_URL. */
const { Pool } = require('pg');

function create(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    max: 3,                          // serverless: много инстансов × мало соединений
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  pool.on('error', e => console.error('pg pool error:', e.message)); // не роняем процесс
  let ready = null; // таблицы создаются один раз на инстанс

  return {
    init() {
      return ready ||= pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          login TEXT NOT NULL UNIQUE,
          pass_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          expires BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS states (
          user_id INTEGER PRIMARY KEY REFERENCES users(id),
          state JSONB NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires);
      `).catch(e => { ready = null; throw e; });
    },
    async getUserByLogin(login) {
      const { rows } = await pool.query('SELECT id, login, pass_hash, salt FROM users WHERE login = $1', [login]);
      return rows[0] || null;
    },
    async createUser(login, passHash, salt) {
      const { rows } = await pool.query(
        'INSERT INTO users (login, pass_hash, salt, created_at) VALUES ($1,$2,$3,$4) RETURNING id',
        [login, passHash, salt, Date.now()]);
      return rows[0].id;
    },
    async createSession(token, userId, expires) {
      await pool.query('INSERT INTO sessions (token, user_id, expires) VALUES ($1,$2,$3)', [token, userId, expires]);
    },
    async getSession(token) {
      const { rows } = await pool.query(`SELECT s.user_id, u.login, s.expires
                                         FROM sessions s JOIN users u ON u.id = s.user_id
                                         WHERE s.token = $1`, [token]);
      return rows[0] || null;
    },
    async deleteSession(token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    },
    async purgeSessions(now) {
      await pool.query('DELETE FROM sessions WHERE expires < $1', [now]);
    },
    async getState(userId) {
      const { rows } = await pool.query('SELECT state FROM states WHERE user_id = $1', [userId]);
      return rows[0]?.state ?? null;
    },
    async putState(userId, state) {
      await pool.query(`INSERT INTO states (user_id, state, updated_at) VALUES ($1,$2,$3)
                        ON CONFLICT (user_id) DO UPDATE SET state = $2, updated_at = $3`,
        [userId, JSON.stringify(state), Date.now()]);
    },
  };
}

module.exports = { create };
