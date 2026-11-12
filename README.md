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

## Структура

```
packages/shared   общие типы, статусы согласования, разбор архивного шифра
backend           Fastify + Prisma: схема БД, миграции, сиды (ЭТАП 1), публичный API каталога и филиалов (ЭТАП 2)
infrastructure    Docker, Nginx, скрипты
docs              проектная документация
```

## Локальный запуск БД (ЭТАП 1)

Нужны Node.js 22 и Docker (или локальный PostgreSQL 16 с pgvector).

```bash
cp .env.example backend/.env      # задайте свой SEED_ADMIN_PASSWORD (не короче 12 символов)
docker compose up -d db           # PostgreSQL 16 + pg_trgm, citext, unaccent, vector
npm install
npm run db:migrate                # prisma migrate deploy
npm run db:seed                   # справочники + наборы из SEED_SETS
npm run check                     # typecheck + тесты
```

Тесты backend создают отдельную временную базу на сервере из `TEST_DATABASE_URL` и удаляют её после прогона.

Наборы данных (`SEED_SETS`): `migrated` — сведения с текущего сайта, требуют сверки архивом; `synthetic` — тестовые фонды `TEST-*`; `demo` — демонстрационные материалы «[Демо]». Синтетика и демо не загружаются при `NODE_ENV=production`.

## Публичный API (ЭТАП 2)

```bash
npm run dev -w backend            # http://127.0.0.1:3000, проверка: /health, /ready
curl -G http://127.0.0.1:3000/api/v1/catalog/documents --data-urlencode q=маслозавод -d lang=ru
```

Маршруты и правила доступа — [docs/api-design.md §8](docs/api-design.md).
