'use strict';
/* Резервный драйвер: один JSON-файл. Включается, когда node:sqlite недоступен
   (Node < 22). Для локальной разработки и небольших личных инсталляций. */
const fs = require('node:fs');
const path = require('node:path');

function create(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db = { users: [], sessions: {}, states: {}, seq: 0 };
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
  let t = null;
  const persist = () => { clearTimeout(t); t = setTimeout(() => {
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, file);
  }, 50); };

  return {
    async getUserByLogin(login) { return db.users.find(u => u.login === login) || null; },
    async createUser(login, pass_hash, salt) {
      const id = ++db.seq; db.users.push({ id, login, pass_hash, salt, created_at: Date.now() }); persist(); return id;
    },
    async createSession(token, user_id, expires) { db.sessions[token] = { user_id, expires }; persist(); },
    async getSession(token) {
      const s = db.sessions[token]; if (!s) return null;
      const u = db.users.find(x => x.id === s.user_id); return u ? { user_id: u.id, login: u.login, expires: s.expires } : null;
    },
    async deleteSession(token) { delete db.sessions[token]; persist(); },
    async purgeSessions(now) { for (const [k, v] of Object.entries(db.sessions)) if (v.expires < now) delete db.sessions[k]; persist(); },
    async getState(user_id) { return db.states[user_id] ?? null; },
    async putState(user_id, state) { db.states[user_id] = state; persist(); },
  };
}
module.exports = { create };
