'use strict';
/* Драйвер SQLite на встроенном node:sqlite (Node ≥ 22) — ноль зависимостей.
   Используется локальным server.js. */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function create(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return {
    async getUserByLogin(login) {
      return db.prepare('SELECT id, login, pass_hash, salt FROM users WHERE login = ?').get(login) || null;
    },
    async createUser(login, passHash, salt) {
      const r = db.prepare('INSERT INTO users (login, pass_hash, salt, created_at) VALUES (?,?,?,?)')
        .run(login, passHash, salt, Date.now());
      return Number(r.lastInsertRowid);
    },
    async createSession(token, userId, expires) {
      db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?,?,?)').run(token, userId, expires);
    },
    async getSession(token) {
      return db.prepare(`SELECT s.user_id, u.login, s.expires
                         FROM sessions s JOIN users u ON u.id = s.user_id
                         WHERE s.token = ?`).get(token) || null;
    },
    async deleteSession(token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },
    async purgeSessions(now) {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
    },
    async getState(userId) {
      const row = db.prepare('SELECT state FROM states WHERE user_id = ?').get(userId);
      return row ? JSON.parse(row.state) : null;
    },
    async putState(userId, state) {
      db.prepare(`INSERT INTO states (user_id, state, updated_at) VALUES (?,?,?)
                  ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`)
        .run(userId, JSON.stringify(state), Date.now());
    },
  };
}

module.exports = { create };
