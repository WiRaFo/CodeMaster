# Сайт Государственного архива ВКО

Прототип нового официального сайта Государственного архива Восточно-Казахстанской области (Code Masters Hackathon 9.0). Концепция: «Цифровая память Восточного Казахстана».

Сайт строго информационно-справочный: нет приёма заявлений, заказов, обращений и платежей. Разрешены только отзывы и предложения о сайте.

## Документация

| Документ | Содержание |
|---|---|
| [docs/requirements-matrix.md](docs/requirements-matrix.md) | Матрица требований ТЗ со статусами |
| [docs/architecture.md](docs/architecture.md) | Архитектура frontend, backend, инфраструктуры |
| [docs/database-design.md](docs/database-design.md) | Модель данных |
| [docs/api-design.md](docs/api-design.md) | Карта REST API |
| [docs/accessibility.md](docs/accessibility.md) | Архитектура доступности (WCAG 2.2 AA) |
| [docs/development-roadmap.md](docs/development-roadmap.md) | План этапов |
| [docs/handoff.md](docs/handoff.md) | Состояние проекта и инструкции для следующего разработчика или агента |

## Структура

```
packages/shared   общие типы, статусы согласования, разбор архивного шифра
backend           Fastify + Prisma: схема БД, миграции, сиды (ЭТАП 1), публичный API каталога и филиалов (ЭТАП 2)
frontend          React + Vite: каркас, KZ/RU/EN, темы, панель доступности (ЭТАП 3), главная, выдача каталога, новости (ЭТАП 4), каталог с фильтрами (ЭТАП 5)
infrastructure    Docker, Nginx, скрипты
docs              проектная документация
```

## Локальный запуск БД (ЭТАП 1)

Нужны Node.js 22 и Docker (или локальный PostgreSQL 16 с pgvector).

```bash
cp .env.example backend/.env      # задайте свой SEED_ADMIN_PASSWORD (не короче 12 символов)
docker compose up -d db           # PostgreSQL 16 + pg_trgm, citext, unaccent, vector
npm install
npm run db:migrate                # prisma migrate deploy + prisma generate
npm run db:seed                   # справочники + наборы из SEED_SETS; файлы страниц пишутся в backend/storage (STORAGE_DIR)
npm run check                     # typecheck + тесты
```

Если npm 11 предупреждает про `install-scripts` (скрипты пакетов не запущены), разрешите их: `npm install-scripts approve @prisma/client @prisma/engines prisma @tailwindcss/oxide argon2 esbuild fsevents && npm rebuild`. На macOS перед `docker compose` должен быть запущен Docker Desktop.

Тесты backend создают отдельную временную базу на сервере из `TEST_DATABASE_URL` и удаляют её после прогона.

Наборы данных (`SEED_SETS`): `migrated` — сведения с текущего сайта, требуют сверки архивом; `synthetic` — тестовые фонды `TEST-*`; `demo` — демонстрационные материалы «[Демо]». Синтетика и демо не загружаются при `NODE_ENV=production`.

## Публичный API (ЭТАП 2)

```bash
npm run dev -w backend            # http://127.0.0.1:3000, проверка: /health, /ready
curl -G http://127.0.0.1:3000/api/v1/catalog/documents --data-urlencode q=маслозавод -d lang=ru
```

Маршруты и правила доступа — [docs/api-design.md §8](docs/api-design.md).

## Интерфейс (ЭТАП 3)

```bash
npm run dev:api                   # API на :3000 (нужна БД)
npm run dev:web                   # http://127.0.0.1:5173 → перенаправит на /kk
npm run e2e                       # сборка + проверка в Chromium: axe во всех темах, 10 ширин экрана, клавиатура
```

Для `npm run e2e` нужен Chromium для Playwright 1.63 (`npx playwright install chromium`, если его нет).

## Панель управления (ЭТАП 10a)

```bash
npm run db:seed                   # создаёт главного администратора из SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run dev:api && npm run dev:web
# http://127.0.0.1:5173/admin
```

Демо-сотрудники `archivist@archive.local` (сотрудник архива) и `moderator@archive.local` (модератор) создаются сидом, только если задан `SEED_DEMO_STAFF_PASSWORD` (не короче 12 символов), набор `demo` включён и `NODE_ENV` не `production`. Пароли берутся из `backend/.env` и в репозиторий не попадают. Сценарии 9–12 в `npm run e2e` читают те же переменные.

Выставки (ЭТАП 8): `/:lang/exhibitions` на сайте и «Выставки» в панели; демо-выставки создаёт `npm run db:seed`.

Филиалы (ЭТАП 9): `/:lang/branches`. Карта появляется только у подразделений с координатами и `show_on_map`; сейчас таких нет.

Панель только на русском, закрыта от индексации; все проверки прав — на сервере ([docs/api-design.md §8](docs/api-design.md)). Загруженные сканы не видны на сайте до проверки антивирусом (ЭТАП 13).
