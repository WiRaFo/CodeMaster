# Карта REST API

Версия 0.3 (ЭТАП 0, сверено с ТЗ и аудитом), 2026-11-09. ТЗ не задаёт форматов обмена и внешних API; интеграции ТЗ §10, с. 20 реализуются ссылками (правовые источники, гос. ресурсы, Google Maps, 2GIS, соцсети) или локальными сервисами (аналитика, OCR, ИИ).

## 1. Общие правила

- Базовый путь: `/api/v1`. Публичная часть: `/api/v1/...`; административная: `/api/v1/admin/...`.
- JSON, UTF-8. Даты ISO 8601. Идентификаторы — UUID; публичные сущности с ЧПУ доступны также по `slug`.
- Язык контента: параметр `?lang=kk|ru|en` (приоритет) или `Accept-Language`. Ответ содержит `contentLang` у каждого переводимого объекта и заголовок `Content-Language`.
- Все входные данные (params, query, body) валидируются Zod-схемами из `packages/shared`. Неизвестные поля в body отклоняются.
- Пагинация: `?page=1&pageSize=20` (максимум 100). Ответ списка:
  ```json
  { "items": [...], "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 }
  ```
- Сортировка: `?sort=relevance|date_asc|date_desc|code` — только из белого списка эндпоинта.
- Кэширование: публичные GET отдают `ETag` и `Cache-Control: public, max-age=60`; админ-ответы `no-store`.
- Публичные эндпоинты возвращают только опубликованные записи с уровнем `open` или `restricted`. Для `restricted` отдаются метаданные и `accessConditions`, а `pages`/файлы — нет (ТЗ §5.3, с. 6). Запрос `closed` или несуществующей записи даёт одинаковый `404`, чтобы не раскрывать факт существования.

## 2. Формат ошибок

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [{ "path": ["yearFrom"], "code": "too_small" }],
    "requestId": "f1c2…"
  }
}
```

| HTTP | code | Когда |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Ошибка схемы |
| 401 | `UNAUTHENTICATED` | Нет сессии |
| 403 | `FORBIDDEN`, `CSRF_FAILED` | Нет прав / неверный CSRF |
| 404 | `NOT_FOUND` | Нет записи или она не публична |
| 409 | `CONFLICT`, `DUPLICATE_ARCHIVE_CODE`, `INVALID_STATUS_TRANSITION` | Конфликт уникальности, устаревшая версия (`If-Match`), недопустимый переход статуса |
| 422 | `INFECTED_FILE` | Антивирус отклонил файл |
| 413 | `FILE_TOO_LARGE` | Превышен размер |
| 415 | `UNSUPPORTED_FILE_TYPE` | Тип файла не из белого списка или не совпадает сигнатура |
| 422 | `PUBLISH_REQUIREMENTS_NOT_MET` | Нельзя опубликовать: нет источника, alt, перевода и т. п.; `details` перечисляет, чего не хватает |
| 429 | `RATE_LIMITED` | Превышен лимит |
| 500 | `INTERNAL` | Прочее; без стека |

Текст для пользователя клиент берёт по `code` из словаря i18n.

## 3. Публичный API

### Каталог
| Метод | Путь | Назначение | Требования |
|---|---|---|---|
| GET | `/catalog/documents` | Поиск и фильтрация | F-020…F-026 |
| GET | `/catalog/documents/:id` | Карточка документа (с иерархией, шифром, активами, связями) | F-030, F-033 |
| GET | `/catalog/documents/:id/pages` | Список страниц цифровой копии (URL производных, размеры, alt, наличие расшифровки) | F-032, A-014 |
| GET | `/catalog/facets` | Значения фильтров с количеством (с учётом текущих фильтров) | F-022 |
| GET | `/catalog/fonds` | Список фондов (с фильтром по филиалу) | F-021 |
| GET | `/catalog/fonds/:id` | Фонд с описями | |
| GET | `/catalog/inventories/:id` | Опись с делами | |
| GET | `/catalog/cases/:id` | Дело с документами | Q-04 |
| GET | `/catalog/resolve-code?code=…` | Разбор архивного шифра → запись | F-021 |

Параметры `GET /catalog/documents`:

| Параметр | Тип | Пример |
|---|---|---|
| `q` | строка ≤ 200 | `маслозавод` |
| `fond`, `inventory`, `case` | строка | `Р-123`, `1`, `45` |
| `branch` | uuid или slug, повторяемый | |
| `period` | id, повторяемый | |
| `yearFrom`, `yearTo` | int | `1920`, `1945` |
| `author` | строка | |
| `organization` | id, повторяемый | |
| `topic` | id категории, повторяемый | |
| `settlement` | id, повторяемый | |
| `type` | id типа документа, повторяемый | |
| `hasDigitalCopy` | boolean | |
| `access` | `open`, `restricted`, повторяемый | |
| `category` | категория каталога (ТЗ §5.3, с. 5): `fond`, `inventory`, `case`, `document`, `photo`, `map`, `written`, `org`, `personal`, `audiovisual` | |
| `sort`, `page`, `pageSize`, `lang` | | |

Значения одного фильтра объединяются через ИЛИ, разные фильтры — через И.

Элемент выдачи:
```json
{
  "id": "…", "title": "…", "contentLang": "ru",
  "archiveCode": { "fond": "Р-123", "inventory": "1", "case": "45", "sheets": "1–12", "formatted": "Ф. Р-123. Оп. 1. Д. 45. Л. 1–12" },
  "date": { "from": "1932-01-01", "to": "1932-12-31", "precision": "year" },
  "type": { "id": "…", "name": "…" },
  "branch": { "id": "…", "name": "…" },
  "hasDigitalCopy": true,
  "access": "open",
  "thumbnailUrl": "/media/…webp",
  "dataOrigin": "demo",
  "highlight": "…<mark>маслозавод</mark>…"
}
```
`highlight` формируется сервером с экранированием, разрешён только тег `<mark>`.

### Общий поиск
| GET | `/search?q=…&types=page,news,publication,exhibition,branch` | Поиск по сайту (шапка), сгруппированный по типам. Если запрос похож на архивный шифр или найден в каталоге, ответ содержит `catalogHint: { count, url }` — переход в поиск по учёту (Ауд-Р3) | F-007, F-131 |
|---|---|---|---|
| GET | `/search/interpret?q=…&lang=…` | Интеллектуальный поиск: разбор запроса в фильтры (тема, период, населённый пункт, тип) + подсказки дополнительных запросов. Ответ: `{ filters, explanation, suggestions[] }`; клиент затем вызывает `/catalog/documents` с этими фильтрами | F-123, F-124 |
| GET | `/search/suggest?q=…` | Автодополнение с учётом синонимов и вариантов написания | F-124 |

### Архив памяти, персоналии, хронология, коллекции
| Метод | Путь | Назначение |
|---|---|---|
| GET | `/history/topics` | Направления (категории `history_topic`) |
| GET | `/history/publications` | Список с фильтрами `topic`, `yearFrom`, `yearTo`, `q` |
| GET | `/history/publications/:slug` | Публикация со связанными материалами |
| GET | `/history/persons`, `/history/persons/:slug` | Персоналии |
| GET | `/history/timeline` | События хронологии (`yearFrom`, `yearTo`, `topic`) |
| GET | `/collections`, `/collections/:slug` | Коллекции и их элементы (пагинация элементов); `?view=gallery` для режима галереи (ТЗ §5.6, с. 8) |

### Выставки
| GET | `/exhibitions` | Список с фильтрами `topic`, `period` (ТЗ §5.7, с. 9) |
|---|---|---|
| GET | `/exhibitions/:slug` | Выставка + краткий список экспонатов |
| GET | `/exhibitions/:slug/items/:order` | Экспонат + ссылки `prev`/`next` |

### Филиалы
| GET | `/branches` | Все опубликованные подразделения (список небольшой, без пагинации), фильтры `type`, `settlement`, `q` |
|---|---|---|
| GET | `/branches/:slug` | Карточка с графиком и ссылками маршрутов |
| GET | `/branch-types` | Типы подразделений |

Ссылки на внешние маршруты (Google Maps, 2GIS; режим передвижения — ТЗ §5.5, с. 8) формируются на клиенте из адреса и координат по шаблонам из конфигурации; расстояние по прямой считается на клиенте. Координаты пользователя на сервер не отправляются. Если пользователь ввёл адрес начальной точки, он передаётся во внешний сервис как текст; геокодирование на нашей стороне — перспектива.

### Новости, страницы, справка
| GET | `/news?category&branch&q&sort` , `/news/:slug` | Новости с фильтром по рубрике и филиалу, поиском и сортировкой по дате; связанные материалы в карточке (ТЗ §5.11, с. 12) |
|---|---|---|
| GET | `/pages/:key` | `about/*` (подразделы ТЗ §5.2), `help/*` (ТЗ §5.4), `privacy`, `copyright`, `accessibility` |
| GET | `/about/staff`, `/about/galleries`, `/about/galleries/:slug` | Контактные лица и фотогалерея (ТЗ §5.2) |
| GET | `/links?category=legal|gov_resource|archive_resource` | Ссылки справочного раздела (ТЗ §5.4, с. 7) |
| GET | `/menu` | Структура меню (ТЗ §4, с. 4) |
| GET | `/faq` | Вопросы и ответы |
| GET | `/glossary` | Термины |
| GET | `/settings/public` | Соцсети, контакты в подвале |
| GET | `/home` | Агрегат для главной (избранное, выставки, новости, хронология) — один запрос вместо шести |

### ИИ-помощник
| POST | `/assistant/ask` | `{ question, lang, pagePath? }` → `{ answer, sources[], generalNotes, noData, suggestedLinks[] }` |
|---|---|---|
| POST | `/assistant/summarize` | `{ entityType, entityId, lang }` → краткое содержание, даты, имена, события только по опубликованному тексту, со ссылкой на источник (ТЗ §5.8 В, необязательно) |

### Отзывы и предложения
| POST | `/feedback` | `{ topic, message, contactEmail?, consent?, pagePath, lang }` → `201`. Rate limit, honeypot, длина ≤ 2000. Не является официальным обращением; ответ API содержит ссылку на официальные каналы (рекомендации организаторов, F-160) |
|---|---|---|

Лимиты: длина вопроса ≤ 500 символов; rate limit по IP; без хранения истории на сервере (история диалога передаётся клиентом, не более N последних реплик). Требует CSRF-токен анонимной сессии или подписанный токен страницы (защита от использования как бесплатного API — решить на ЭТАПЕ 12).

### Медиа и SEO (не JSON)
| GET | `/media/*` | Nginx → `public-media` |
|---|---|---|
| GET | `/sitemap.xml`, `/robots.txt` | backend `seo` |
| GET | `/{lang}/{section}/{id}` | Nginx → `backend /seo/render` для подстановки мета (architecture.md §7) |

### Служебные
| GET | `/health`, `/ready` | Проверка живости и готовности (БД, MinIO) |
| GET | `/{старый путь}` | Перенаправление 301 по `url_redirects` (адреса текущего сайта), иначе 404 с поиском |
|---|---|---|

## 4. Аутентификация

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → cookie `sid`, ответ `{ user, permissions, csrfToken }`; rate limit 5/мин на IP+email |
| POST | `/auth/logout` | Удаление сессии |
| GET | `/auth/me` | Текущий пользователь, права, csrfToken |
| POST | `/auth/password` | Смена пароля (старый + новый) |

Восстановление пароля по email — перспектива (нужен локальный SMTP в РК).

## 5. Административный API

Все маршруты требуют сессию, CSRF-токен для изменяющих методов и право, указанное в таблице. Права с областью «филиал» проверяются по `branch_id` записи.

Единый шаблон CRUD для ресурса `R`:

| Метод | Путь | Право |
|---|---|---|
| GET | `/admin/R` | `R:read` |
| GET | `/admin/R/:id` | `R:read` |
| POST | `/admin/R` | `R:write` |
| PATCH | `/admin/R/:id` (с `If-Match: <version>` для защиты от перезаписи) | `R:write` |
| DELETE | `/admin/R/:id` (мягкое удаление; жёсткое — только черновики; Q-19) | `R:delete` |
| POST | `/admin/R/:id/submit` | `R:submit` — черновик или «требует доработки» → «на проверке» |
| POST | `/admin/R/:id/request-changes` | `R:review` — «на проверке» → «требует доработки», обязателен комментарий |
| POST | `/admin/R/:id/approve` | `R:review` — «на проверке» → «одобрено» |
| POST | `/admin/R/:id/publish` | `R:publish` — «одобрено» → «опубликовано» |
| POST | `/admin/R/:id/archive` | `R:publish` — «опубликовано» → «архивировано» (снятие с публикации) |
| POST | `/admin/R/:id/restore` | `R:publish` — «архивировано» → «опубликовано» |
| GET | `/admin/R/:id/history` | `R:read` — история статусов и правок из журнала |
| PUT | `/admin/R/:id/translations/:locale` | `R:write` (статус `reviewed` — `translations:review`) |

Переходы статусов (ТЗ §6.7, с. 15) проверяет сервер; недопустимый переход → `409 INVALID_STATUS_TRANSITION`.

Ресурсы `R`: `staff`, `galleries`, `links`, `menu`, `fonds`, `inventories`, `cases`, `documents`, `collections`, `publications`, `persons`, `events`, `exhibitions` (+ `/admin/exhibitions/:id/items`), `branches`, `news`, `pages`, `faq`, `glossary`, `categories`, `tags`, `organizations`, `settlements`, `periods`, `document-types`.

Особые эндпоинты:

| Метод | Путь | Право | Назначение |
|---|---|---|---|
| PATCH | `/admin/documents/:id/access` | `documents:access` | Смена `access_level`; переход в `open` требует подтверждения (`confirm: true`) и пишет отдельную запись аудита |
| POST | `/admin/assets` | `assets:upload` | multipart; лимиты по типу; ответ `{ id, processingStatus }` |
| GET | `/admin/assets/:id` | `assets:read` | Метаданные |
| GET | `/admin/assets/:id/original` | `assets:read` | Скачивание оригинала через backend (поток из закрытого бакета или краткоживущая presigned-ссылка) |
| PUT | `/admin/assets/:id/translations/:locale` | `assets:write` | alt, подпись, описание |
| PUT | `/admin/documents/:id/pages` | `documents:write` | Порядок страниц |
| POST | `/admin/documents/:id/relations` | `documents:write` | Связи |
| GET | `/admin/dashboard` | `dashboard:read` | Счётчики, очередь на проверку, последние действия |
| GET | `/admin/notifications`, POST `/admin/notifications/:id/read` | любой вошедший | Уведомления о материалах на проверке (ТЗ §6.7) |
| POST | `/admin/assets/batch` | `assets:upload` | Пакетная загрузка (ТЗ §7.7, с. 18), статус по каждому файлу |
| POST | `/admin/assets/:id/ocr` | `assets:write` | Запуск OCR; результат — черновик (ТЗ §5.8 Г, необязательно) |
| GET | `/admin/assets/:id/duplicates` | `assets:read` | Похожие файлы по sha256 и перцептивному хешу |
| GET | `/admin/feedback`, PATCH `/admin/feedback/:id` | `feedback:moderate` | Отзывы и предложения |
| GET | `/admin/migration`, PATCH `/admin/migration/:id` | `migration:manage` | Реестр миграции: решение и причина по каждой единице |
| CRUD | `/admin/redirects` | `migration:manage` | Перенаправления со старых адресов |
| GET | `/admin/analytics/search` | `analytics:read` | Частые запросы, запросы без результатов (ТЗ §5.8 Д) |
| GET | `/admin/analytics/report` | `analytics:read` | Отчёт качества с рекомендациями |
| PUT | `/admin/roles/:id/permissions` | `roles:manage` | Настройка прав роли (ТЗ §6.1, §6.2) |
| PUT | `/admin/locales/:code` | `settings:write` | Включение языковых версий (ТЗ §6.2) |
| GET | `/admin/audit-logs` | `audit:read` | Фильтры: пользователь, сущность, период |
| CRUD | `/admin/users`, `/admin/users/:id/roles` | `users:manage` | Пользователи и роли |
| GET | `/admin/roles`, `/admin/permissions` | `users:manage` | Справочник |
| PUT | `/admin/settings/:key` | `settings:write` | Настройки сайта |
| POST | `/admin/import/:entity` | `catalog:import` | Импорт CSV/XLSX (ТЗ §6.3, с. 14): загрузка → `import_jobs` в статусе предпросмотра с ошибками по строкам |
| POST | `/admin/import/jobs/:id/commit` | `catalog:import` | Подтверждение импорта (транзакционно; идемпотентно по `source_system_id`) |
| GET | `/admin/import/templates/:entity` | `catalog:import` | Шаблон колонок |
| GET | `/admin/export/:entity?format=csv|xlsx&…фильтры` | `catalog:export` | Экспорт (ТЗ §6.3, с. 14) |

## 6. Внутренний API ai-service (не доступен извне)

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/ask` | Ответ с источниками |
| POST | `/index/upsert` | Переиндексация записи (вызывается backend при публикации) |
| POST | `/index/delete` | Удаление из индекса (снятие, закрытие) |
| POST | `/interpret` | Разбор запроса в фильтры (для `/search/interpret`) |
| POST | `/ocr` | OCR файла (Tesseract) |
| POST | `/analytics/recommendations` | Рекомендации по агрегатам журнала запросов (без ПДн) |
| GET | `/health` | Статус и имя текущей модели |

Доступ только из внутренней сети Docker; аутентификация сервис-сервис по общему секрету.

## 7. Документирование

OpenAPI 3.1 генерируется из Zod-схем (`@fastify/swagger`) и публикуется только в dev (`/api/docs`). В prod спецификация собирается в `docs/api/openapi.json` на этапе сборки.


## 8. Состояние реализации (ЭТАП 2, 2026-11-09)

Код: `backend/src` (Fastify 5, Zod 4), схемы параметров — `packages/shared/src/api.ts`. Запуск: `npm run dev -w backend`.

### Реализовано

| Маршрут | Примечание |
|---|---|
| `GET /health`, `GET /ready` | `ready` проверяет БД; MinIO подключится на этапе хранилища |
| `GET /api/v1/catalog/documents` | Фильтры `q`, `fond`, `inventory`, `case`, `branch` (slug или uuid), `period` (slug), `type` (код типа), `settlement` (slug), `topic` (slug), `organization` (uuid), `author`, `yearFrom`, `yearTo`, `hasDigitalCopy`, `access`; `sort`, `page`, `pageSize`, `lang`. Если `q` распознан как шифр, ответ содержит `interpretedCode` и фильтрует по фонду, описи и делу |
| `GET /api/v1/catalog/facets` | Счётчики по типу, периоду, подразделению, доступу, наличию копии с учётом текущих фильтров |
| `GET /api/v1/catalog/documents/:id` | Две формы ответа: `open` (с `transcription`, `digitalCopy.pageCount`) и `restricted` (с `accessConditions`, без копии и расшифровки) |
| `GET /api/v1/catalog/documents/:id/pages` | Только для эффективно открытых документов; у ограниченных — 404 |
| `GET /api/v1/catalog/fonds`, `/fonds/:id`, `/inventories/:id`, `/cases/:id` | Через представления `public_fonds_v`, `public_inventories_v`, `public_cases_v`, `public_documents_v` |
| `GET /api/v1/catalog/resolve-code?code=` | Разбор шифра и список совпадений (фонд, опись или дело) во всех подразделениях; непонятный шифр — 400 |
| `GET /api/v1/branches`, `/branches/:slug`, `/branch-types` | Поиск по названию, адресу, текущему и историческому названию населённого пункта; `coordinates` только при заполненных координатах и `show_on_map`; `needsVerification` для несверенных данных |
| `GET /api/v1/reference/document-types`, `/periods`, `/settlements`, `/topics?kind=` | Справочники для фильтров; добавлены вместо отдельных маршрутов `/history/topics` |

### Правила доступа на сервере

- Все чтения каталога идут только через представления `public_*_v`. Закрытая запись, неопубликованная запись, запись с закрытым или неопубликованным предком (включая подразделение) и неверный id дают одинаковый `404 NOT_FOUND`.
- Для `restricted` поиск использует только веса A–C вектора (название, описание, историческая справка); вес D (расшифровка, SEO-слова) исключается через `ts_filter`. Расшифровка `restricted` не читается из БД.
- `hasDigitalCopy` в выдаче означает «копию можно смотреть на сайте»: документ эффективно открыт и есть страница с `processing_status = ready` и `antivirus_status = clean`.
- Подсветка `highlight` строится `ts_headline` с маркерами, весь текст экранируется, разрешён только `<mark>`.

### Отложено

- ETag (сейчас только `Cache-Control: public, max-age=60` для успешных публичных GET, `no-store` для ошибок).
- URL производных изображений: `pages[].derivatives` отдаёт параметры без ссылок до подключения MinIO.
- Общий поиск `/search`, `/search/suggest`, `/search/interpret` — ЭТАП поиска по сайту и ИИ.
- Сессии, CSRF, RBAC, ограничение входа и аудит — вместе с административным API (ЭТАП 10a); публичный API их не требует.
- Rate limit и `@fastify/helmet` — ЭТАП безопасности; сейчас выставляются `X-Content-Type-Options` и `X-Request-Id`.
