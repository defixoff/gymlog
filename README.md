# GymLog 🏋️

Автономное PWA-приложение «дневник тренировок» в ультра-лаконичном стиле.
Светло-оранжевая тема + стильная тёмная, плавные CSS-анимации, mobile-first.
На ПК — боковое меню и двухколоночная главная.
**Без зависимостей на фронтенде**: один HTML + один CSS + один JS.

## Возможности

- **Аккаунты** — регистрация и вход по логину/паролю; у каждого пользователя
  свои тренировки в базе данных.
- **Профиль** — имя, возраст, вес (с графиком динамики веса).
- **Конструктор расписания** — тренировочные дни и списки упражнений.
- **Экран тренировки** — тренировку можно назвать, день выбирается уже внутри
  сессии; упражнение записывается одной строкой: подходы × вес × повторения.
  Тренировки в истории можно переименовывать и удалять.
- **Главный экран** — аналитика: SVG-график объёма, тоннаж, счётчики
  и плашка «Максимальные рекорды» (лучший вес + оценка 1RM по формуле Эпли).
- **PWA** — `manifest.json` + `sw.js`: установка на домашний экран и работа офлайн.

## Запуск локально (SQLite, ноль зависимостей)

Требуется только Node.js ≥ 22 (встроенный `node:sqlite`, ничего ставить не надо):

```bash
node server.js
# → http://localhost:3000
```

База создаётся автоматически в `data/gymlog.db` (в git не попадает).
Зарегистрируйте пользователя — и все тренировки хранятся в SQLite.

Если открыть приложение без сервера (любой статический хостинг, `npx serve .`,
даже `file://`), оно стартует в **гостевом режиме** на localStorage — ничего
не ругается, всё работает, но без аккаунтов.

## Архитектура данных

Один общий API-слой, два драйвера БД:

```
backend/core.js        — логика API (auth + состояние), не знает про СУБД
backend/db-sqlite.js   — драйвер SQLite (локально, node:sqlite)
backend/db-postgres.js — драйвер PostgreSQL (деплой)
server.js              — локальный сервер: статика + /api/* на SQLite
api/[...api].js        — Vercel serverless: те же маршруты на PostgreSQL
```

Маршруты API: `POST /api/register`, `POST /api/login`, `POST /api/logout`,
`GET /api/me`, `GET /api/state`, `PUT /api/state`, `GET /api/ping`.
Пароли хешируются scrypt + соль, сессии — токены на 30 дней.
Смоук-тест API: `node test-api.js` (при запущенном `server.js`).

Фронтенд при старте делает `GET /api/ping`:
- сервер есть → экран входа, данные пользователя в базе;
- сервера нет → гостевой режим на localStorage.

## Деплой на Vercel (PostgreSQL)

1. Закоммитьте проект и загрузите в репозиторий (GitHub/GitLab):

   ```bash
   git init
   git add .
   git commit -m "GymLog"
   git remote add origin <url-репозитория>
   git push -u origin main
   ```

2. В Vercel: **Add New → Project** → импорт репозитория.
   Framework Preset: **Other**, Build Command — пустой,
   Output Directory — пустой (подтянется из `vercel.json`).

3. Добавьте Postgres: **Storage → Create → Postgres** (или Neon/Supabase).
   Переменная `DATABASE_URL` привяжется к проекту автоматически
   (иначе добавьте вручную: Settings → Environment Variables).

4. Deploy. Таблицы (`users`, `sessions`, `states`) создаются автоматически
   при первом запросе к API.

Статика раздаётся как есть, `/api/*` работает как serverless-функции.
Локальная SQLite-база на деплой не попадает (см. `.gitignore`).

## Структура проекта

```
gymlog/
├── index.html, styles.css, app.js   # фронтенд
├── manifest.json, sw.js, icons/     # PWA
├── server.js                        # локальный сервер (SQLite)
├── backend/                         # общий API + драйверы БД
├── api/[...api].js                  # Vercel serverless (PostgreSQL)
├── test-api.js                      # смоук-тест API
└── package.json, vercel.json, .gitignore
```
