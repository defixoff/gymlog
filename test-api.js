/* Быстрый смоук-тест API GymLog (запуск: node test-api.js при работающем server.js) */
const base = 'http://localhost:3000/api';
const call = async (path, method = 'GET', body, token) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

(async () => {
  const login = 'user' + Date.now().toString(36);
  const results = [];
  const check = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

  const ping = await call('/ping');
  check('ping', ping.status === 200 && ping.data.ok);

  const reg = await call('/register', 'POST', { login, password: 'secret123' });
  check('register', reg.status === 200 && !!reg.data.token);

  const dup = await call('/register', 'POST', { login, password: 'secret123' });
  check('duplicate login rejected', dup.status === 409);

  const me = await call('/me', 'GET', null, reg.data.token);
  check('me', me.status === 200 && me.data.login === login);

  const state = { profile: { name: 'Тест', age: 30, weight: 80 }, days: [], sessions: [], weightLog: [], active: null, theme: 'light' };
  const put = await call('/state', 'PUT', state, reg.data.token);
  check('put state', put.status === 200);

  const get = await call('/state', 'GET', null, reg.data.token);
  check('get state roundtrip', get.status === 200 && get.data.state?.profile?.name === 'Тест');

  const bad = await call('/login', 'POST', { login, password: 'wrong' });
  check('wrong password rejected', bad.status === 401);

  const ok = await call('/login', 'POST', { login, password: 'secret123' });
  check('login', ok.status === 200 && !!ok.data.token);

  const noauth = await call('/state', 'GET');
  check('no token rejected', noauth.status === 401);

  const out = await call('/logout', 'POST', null, ok.data.token);
  check('logout', out.status === 200);
  const after = await call('/state', 'GET', null, ok.data.token);
  check('token dead after logout', after.status === 401);

  console.log(results.join('\n'));
  if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
