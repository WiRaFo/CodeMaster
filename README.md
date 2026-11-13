# Сайт Государственного архива ВКО

Прототип нового официального сайта Государственного архива Восточно-Казахстанской области (Code Masters Hackathon 9.0). Концепция: «Цифровая память Восточного Казахстана».

Сайт строго информационно-справочный: нет приёма заявлений, заказов, обращений и платежей. Разрешены только отзывы и предложения о сайте.

## Демо за 5 минут

```bash
cp .env.example backend/.env      # задайте SEED_ADMIN_PASSWORD и SEED_DEMO_STAFF_PASSWORD (не короче 12 символов)
docker compose up -d db
npm install && npm run db:migrate && npm run db:seed
npm run dev:api                   # API: http://127.0.0.1:3000
npm run dev:web                   # сайт: http://127.0.0.1:5173/kk, панель: /admin
```

Сценарий показа на защите — [docs/defense/demo-script.md](docs/defense/demo-script.md).

## Что есть в прототипе

- Сайт на казахском, русском и английском. Главная со схемой области, электронный каталог с фасетами и карточками документов (просмотр копий, режимы доступа open/restricted/closed), поиск по шифру с подсказкой «Ф. Оп. Д. Л.», цифровая история с интерактивной хронологией, онлайн-выставки, новости, филиалы, архивный помощник на правилах с базой знаний, FAQ, «Посетителям», «Об архиве», госуслуга и платные услуги, отзывы о сайте.
- Поиск по сайту из шапки: разделы, новости, публикации, выставки, филиалы и вопросы с группировкой по разделам. Шифр и запросы, найденные в учёте, ведут в каталог.
- Доступность: меню «Доступность» (размер текста, версия для слабовидящих в трёх цветовых схемах, остановка анимации), WCAG 2.2 AA по axe, 10 ширин экрана.
- Панель управления: вход, 7 ролей, документы и иерархия фондов, загрузка сканов, согласование в 6 статусах, новости, публикации, выставки, филиалы, «Об архиве», база знаний помощника, аналитика без персональных данных, отзывы, журнал действий.
- Безопасность: серверные проверки прав на каждом маршруте панели, закрытые записи не видны ни через API, ни через поиск, CSRF, ограничение попыток, заголовки безопасности и CSP.
- Проверки: `npm run check` (unit, API на тестовой базе, компоненты), `npm run e2e` (600 проверок в Chromium), Lighthouse — [docs/testing/](docs/testing/).

Данные стенда: сведения с текущего сайта архива (набор `migrated`, требуют сверки архивом), демонстрационные материалы (набор `demo`) и синтетические фонды `TEST-*` (набор `synthetic`). Происхождение каждой записи хранится в базе (`data_origin`). Состояние требований — [матрица](docs/requirements-matrix.md).

## Документация

| Документ | Содержание |
|---|---|
| [docs/requirements-matrix.md](docs/requirements-matrix.md) | Матрица требований ТЗ со статусами |
| [docs/architecture.md](docs/architecture.md) | Архитектура frontend, backend, инфраструктуры |
| [docs/database-design.md](docs/database-design.md) | Модель данных |
| [docs/api-design.md](docs/api-design.md) | Карта REST API |
| [docs/accessibility.md](docs/accessibility.md) | Архитектура доступности (WCAG 2.2 AA) |
| [docs/development-roadmap.md](docs/development-roadmap.md) | План этапов |
| [docs/testing/](docs/testing/) | Lighthouse, покрытие сценариев, чек-лист ручной проверки доступности |
| [docs/defense/demo-script.md](docs/defense/demo-script.md) | Сценарий показа на защите |
| [docs/deployment.md](docs/deployment.md) | Боевой стенд: TRUST_PROXY, заголовки nginx, CSP, sitemap |
| [docs/handoff.md](docs/handoff.md) | Состояние проекта и инструкции для следующего разработчика или агента |

## Структура

```
packages/shared   общие типы, статусы согласования, разбор архивного шифра
backend           Fastify + Prisma: схема БД, миграции, сиды, публичный и административный API
frontend          React + Vite: публичный сайт на трёх языках и панель управления /admin
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

Наборы данных (`SEED_SETS`): `migrated` — сведения с текущего сайта, требуют сверки архивом; `synthetic` — тестовые фонды `TEST-*`; `demo` — демонстрационные материалы. Синтетика и демо не загружаются при `NODE_ENV=production`.

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

Филиалы (ЭТАП 9): `/:lang/branches`. Без координат подразделения показаны на схеме области; маршрут 2ГИС строится поиском по названию и адресу.

Помощник (ЭТАП 12): `/:lang/assistant`, работает по правилам без LLM. Пример: «Фотографии Усть-Каменогорска 1960-х».

### Поиск с ИИ (необязательно)

Без модели каталог и помощник работают обычным поиском. С локальной моделью к ним добавляется блок «Похожие по смыслу»: документы, близкие к запросу по смыслу, даже если слова не совпадают. Обычные результаты остаются на месте; если модель выключена, упала или медлит дольше `AI_TIMEOUT_MS`, блок просто не показывается. В модель уходят только названия и описания опубликованных документов из публичного представления, закрытые записи не уходят никогда, и модель работает на этом же компьютере.

macOS:

```bash
brew install ollama
ollama serve                      # в отдельном окне терминала (или запустите приложение Ollama)
ollama pull bge-m3                # многоязычная модель векторов, около 1,2 ГБ
# в backend/.env: AI_PROVIDER=ollama
npm run ai:index -w backend       # построить индекс (также запускается при старте API)
npm run dev:api
```

Проверка: `curl 'http://127.0.0.1:3000/api/v1/catalog/semantic?q=городская%20жизнь&lang=ru'` должен вернуть `"available":true`. После правки документов индекс обновляется при перезапуске API или командой `npm run ai:index -w backend` (неизменённые записи пропускаются).

### Антивирус для загруженных файлов (необязательно)

Сканы, изображения выставок и обложки публикаций, загруженные в панели, появляются на сайте только после проверки антивирусом. Без антивируса они остаются в статусе «ожидает проверки»: в панели видны, на сайте нет. С ClamAV сервер API проверяет очередь в фоне раз в `ANTIVIRUS_INTERVAL_S` секунд. Чистый файл становится доступен сайту. Заражённый закрывается, а запись о нём попадает в журнал панели. Если ClamAV не отвечает, файл ждёт следующей проверки и чистым не считается. Файлы проверяются на этом же компьютере.

macOS:

```bash
brew install clamav
cd "$(brew --prefix)/etc/clamav"
cp freshclam.conf.sample freshclam.conf && sed -i '' 's/^Example/#Example/' freshclam.conf
cp clamd.conf.sample clamd.conf && sed -i '' 's/^Example/#Example/' clamd.conf
printf 'TCPSocket 3310\nTCPAddr 127.0.0.1\n' >> clamd.conf
freshclam                         # скачать базы сигнатур, около 300 МБ
clamd                             # служба уходит в фон
# в backend/.env: ANTIVIRUS_PROVIDER=clamd
npm run antivirus:scan -w backend # разовая проверка очереди (также идёт в фоне при работающем API)
```

Проверка: загрузите в панели обложку публикации. Через полминуты под ней будет «проверена, показывается на сайте». В облачной среде разработки ClamAV не запускался: протокол проверен тестами на поддельной службе (`backend/tests/antivirus.test.ts`).

Разделы (ЭТАП 7): `/history`, `/faq`, `/visitors`, `/about`, `/feedback`. Отзывы видны в панели в разделе «Отзывы».

Проверки (ЭТАП 14): `bash frontend/scripts/lighthouse.sh` — Lighthouse по 9 страницам; результаты и покрытие сценариев — [docs/testing/](docs/testing/).

Безопасность и SEO (ЭТАП 13): заголовки безопасности и CSP, `robots.txt`, `sitemap.xml` при сборке с `SITE_URL=https://…`, канонические адреса и `hreflang`. За обратным прокси задайте `TRUST_PROXY` — см. [docs/deployment.md](docs/deployment.md).

Панель только на русском, закрыта от индексации; все проверки прав — на сервере ([docs/api-design.md §8](docs/api-design.md)). Загруженные файлы не видны на сайте до проверки антивирусом (см. «Антивирус для загруженных файлов»).
