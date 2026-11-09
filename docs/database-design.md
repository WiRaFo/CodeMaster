# Проект базы данных

Версия 0.3 (ЭТАП 0, сверено с ТЗ и аудитом), 2026-11-09. СУБД: PostgreSQL 16, расширения `pg_trgm`, `unaccent`, `vector` (pgvector). ORM: Prisma.

> **Сверено с ТЗ** (2026-11-09): сущности ТЗ §11, с. 21; каталог §5.3, с. 5–6; согласование §6.7, с. 15; журнал §6.8, с. 15; файлы §7.7, с. 18; миграция §11, с. 20–21.
> **Не сверено с системой учёта заказчика.** Модель архивной иерархии построена по общей архивной практике (архив → фонд → опись → дело → документ, как в ТЗ §5.4, с. 6). До ввода в эксплуатацию её нужно сверить с фактической системой учёта и форматом исходных баз (ТЗ §11, с. 21; P-006).

**Соответствие сущностям ТЗ §11, с. 21:**

| № | Сущность ТЗ | Таблицы |
|---|---|---|
| 1 | Пользователи | `users`, `sessions` |
| 2 | Роли и права доступа | `roles`, `permissions`, `role_permissions`, `user_roles` |
| 3 | Архивные фонды | `fonds` |
| 4 | Описи | `inventories` |
| 5 | Архивные дела | `cases` |
| 6 | Архивные документы | `documents`, `document_relations` |
| 7 | Цифровые файлы | `digital_assets`, `asset_derivatives`, `document_assets` |
| 8 | Исторические коллекции | `collections`, `collection_items`, `publications` |
| 9 | Исторические личности | `historical_persons` |
| 10 | Исторические события | `historical_events` |
| 11 | Онлайн-выставки | `exhibitions` |
| 12 | Экспонаты | `exhibition_items` |
| 13 | Филиалы | `branches`, `branch_types`, `branch_schedules` |
| 14 | Новости | `news`, `news_relations` |
| 15 | Категории и теги | `categories`, `tags` и связующие таблицы |
| 16 | Языковые версии | `*_translations`, `locales` |
| 17 | Журнал действий | `audit_logs` |

Дополнительно по другим разделам ТЗ: `pages`, `staff_contacts`, `galleries` (§5.2), `faq_items`, `glossary_terms`, `external_links` (§5.4), `menu_items`, `site_settings` (§4, §6.2), `content_revisions`, `notifications` (§6.7), `import_jobs` (§6.3), `search_queries`, `search_synonyms` (§5.8), `feedback_messages` (рекомендации организаторов).

## 1. Принципы

1. Нормализация до 3НФ; денормализация только в поисковом представлении.
2. Первичные ключи `uuid` (генерация `gen_random_uuid()`); публичные URL используют `slug` или `uuid`, не последовательные номера.
3. Во всех таблицах контента: `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (мягкое удаление; жёсткое удаление только для черновиков).
4. Во всех таблицах контента: `publication_status`, `data_origin`.
5. Переводимые поля вынесены в таблицы `*_translations`.
6. Иерархия архива не упрощается: каждая единица имеет собственные поля, а не одну строку «шифр».

## 2. Общие перечисления

| Enum | Значения | Назначение |
|---|---|---|
| `publication_status` | `draft`, `in_review`, `needs_changes`, `approved`, `published`, `archived` | Статусы ТЗ §6.7, с. 15: черновик, на проверке, требует доработки, одобрено, опубликовано, архивировано. «Снятие с публикации» = `archived` |
| `access_level` | `open`, `restricted`, `closed` | `open` — метаданные и копия; `restricted` — информационная карточка с описанием и условиями доступа, без копии (ТЗ §5.3, с. 6); `closed` — не публикуется. По умолчанию `closed` |
| `data_origin` | `verified`, `migrated`, `demo`, `synthetic` | Происхождение записи (Б§23). `verified` допустим только с заполненным источником; `migrated` — перенесено с текущего сайта, с URL источника (ТЗ §11, с. 20) |
| `translation_status` | `missing`, `machine`, `reviewed` | Статус перевода |
| `locale` | `kk`, `ru`, `en` | Язык (расширяется) |
| `asset_kind` | `scan_page`, `image`, `pdf`, `video`, `audio`, `other` | Тип цифрового файла |
| `branch_type` | справочник `branch_types`, а не enum | Типы подразделений неизвестны (Q-14) |

## 3. Архивная иерархия

```
branches 1─* fonds 1─* inventories 1─* cases 1─* documents 1─* digital_assets
                                         │            │
                                         └────────────┴── document_relations (документ ↔ документ / дело)
```

### `branches` — архив и филиалы
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| slug | text | UNIQUE |
| branch_type_id | uuid | FK → branch_types |
| is_main | boolean | частичный UNIQUE-индекс: не более одной `true` |
| show_on_map | boolean | Показ маркера на карте (ТЗ §6.4, с. 14; Q-17) |
| parent_branch_id | uuid | FK → branches, NULL. Площадки одного подразделения (по аудиту у основного архива две: ул. Головкова, 26/1 и ул. Крылова, 39) |
| postal_code | text | Индекс; по аудиту на текущем сайте расходится (070000 / 070004), заполнять после сверки (Q-22) |
| verified_at | date | Дата последней сверки реквизитов с архивом |
| settlement_id | uuid | FK → settlements |
| lat, lng | numeric(9,6) | CHECK диапазонов; NULL допустим (адрес без координат) |
| phone, email, website | text | |
| photo_asset_id | uuid | FK → digital_assets, NULL |
| sort_order | int | |
| + publication_status, data_origin, audit-поля | | |

`branch_translations(branch_id, locale, full_name, short_name, address, schedule_text, reading_room_schedule, description, main_directions, competence, service_area, accessibility_info, translation_status)` — PK `(branch_id, locale)`. Перечень основных фондов филиала (ТЗ §5.5, с. 7) берётся из `fonds.branch_id` и флага `fonds.is_highlighted`.

График работы хранится и текстом (для людей), и структурированно `branch_schedules(branch_id, weekday, opens, closes, note)` — для бейджа «сейчас открыто» с текстовой подписью.

### `fonds` — архивные фонды
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| branch_id | uuid | FK → branches, NOT NULL |
| fond_number | text | NOT NULL. Строка, потому что бывают префиксы и литеры («Р-123», «П-5», «123а») |
| fond_number_sort | int | вычисляемое числовое ядро номера для сортировки |
| creator_org_id | uuid | FK → organizations (фондообразователь), NULL |
| fond_kind | enum `organization`, `personal`, `collection` | Документы организаций и предприятий / личного происхождения (ТЗ §5.3, с. 5) |
| is_highlighted | boolean | Показывать в карточке филиала как основной фонд |
| source_system_id, raw_import | text, jsonb | Идентификатор и полная исходная запись при импорте (ТЗ §11, с. 21) |
| date_from, date_to | int (год) | CHECK `date_from <= date_to` |
| access_level | access_level | по умолчанию `closed` |
| + publication_status, data_origin, audit | | |

`UNIQUE (branch_id, fond_number)` — предел уникальности до подтверждения (Q-02). Если окажется, что нумерация общая для архива, ограничение меняется на `UNIQUE (fond_number)` миграцией.

`fond_translations(fond_id, locale, title, history_note, annotation, translation_status)`.

### `inventories` — описи
`id`, `fond_id` FK NOT NULL, `inventory_number` text, `date_from`, `date_to`, `access_level`, … `UNIQUE (fond_id, inventory_number)`.
`inventory_translations(inventory_id, locale, title, annotation)`.

### `cases` — дела (единицы хранения)
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| inventory_id | uuid | FK NOT NULL |
| case_number | text | NOT NULL; `UNIQUE (inventory_id, case_number)` |
| date_from, date_to | date + `date_precision` (`day`/`month`/`year`/`decade`) | Архивные даты бывают неточными |
| sheet_count | int | CHECK ≥ 0 |
| storage_location | text | Место хранения (может быть служебным — проверить, можно ли публиковать) |
| access_level | access_level | |
| + publication_status, data_origin, audit | | |

`case_translations(case_id, locale, title, annotation)`.

### `documents` — документы
| Поле | Тип | Ограничения |
|---|---|---|
| id | uuid | PK |
| case_id | uuid | FK NOT NULL |
| document_number | text | NULL (не всегда есть подокументная нумерация) |
| sheets_from, sheets_to | text | Листы бывают с литерами («12об», «15а») |
| sheet_count | int | |
| date_from, date_to, date_precision | | |
| period_id | uuid | FK → historical_periods, NULL |
| document_type_id | uuid | FK → document_types |
| original_language | text[] | Языки оригинала (BCP 47) |
| author_text | text | Автор как в документе |
| organization_id | uuid | FK → organizations, NULL |
| access_level | access_level | по умолчанию `closed` |
| access_conditions | — | в `document_translations`: условия доступа для `restricted` (ТЗ §5.3, с. 6) |
| storage_location | text | Место хранения (ТЗ §5.3, с. 6); если по умолчанию наследуется от дела — NULL |
| source_system_id, raw_import | text, jsonb | Импорт без потерь |
| has_digital_copy | boolean | вычисляется триггером по наличию активов |
| source_note | text | Источник сведений; обязателен для `verified` (CHECK) |
| + publication_status, data_origin, audit | | |

`UNIQUE (case_id, document_number)` при ненулевом номере (частичный индекс).

`document_translations(document_id, locale, title, description, historical_note, access_conditions, transcription, seo_keywords, translation_status, search_vector tsvector)`.

**Эффективный доступ.** Карточка документа публична, если документ и все его предки (дело, опись, фонд) имеют `publication_status='published'` и ни один из них не `closed`. Эффективный уровень = самый строгий из уровней документа и предков. Цифровая копия выдаётся только при эффективном `open`. Это вычисляется в представлении `public_documents_v` (поле `effective_access`), которое используют все публичные запросы (см. architecture.md §6).

**Архивный шифр** не хранится одной строкой: собирается из полей (`Ф. {fond_number}. Оп. {inventory_number}. Д. {case_number}. Л. {sheets}`) с локализованными сокращениями (формат сокращений на kk и en утвердить с заказчиком).

### Связи и справочники
- `document_relations(id, source_document_id, target_document_id NULL, target_case_id NULL, relation_type, note)`, CHECK: ровно одна цель; `UNIQUE (source, target, relation_type)`.
- `organizations` + `organization_translations` (фондообразователи, учреждения).
- `settlements` + `settlement_translations` (населённые пункты, с `lat/lng` и историческими названиями в `settlement_names(settlement_id, name, locale, valid_from, valid_to)` — переименования городов важны для поиска).
- `historical_periods` (+translations; `year_from`, `year_to`).
- `document_types` (+translations).
- `categories` (+translations; `kind`: `topic`, `history_topic`, `news_rubric`; иерархия `parent_id`).
- `tags` (+translations).
- Связующие таблицы: `document_categories`, `document_settlements`, `document_tags`, `document_persons` и аналогичные для публикаций.

## 4. Цифровые активы

### `digital_assets`
| Поле | Тип | Назначение |
|---|---|---|
| id | uuid | PK |
| owner_type, owner_id | text, uuid | Владелец (документ, публикация, экспонат, новость, филиал). Полиморфная связь проверяется сервисом; для документов дополнительно FK-таблица `document_assets(document_id, asset_id, page_number)` с `UNIQUE (document_id, page_number)` |
| kind | asset_kind | |
| storage_bucket, storage_key | text | Ключ в MinIO (UUID-имя) |
| original_filename | text | |
| mime_type | text | Определён по сигнатуре, не по расширению |
| size_bytes | bigint | |
| sha256 | text | Контроль целостности и дублей |
| width, height | int | Для изображений |
| alt_text | — | в `asset_translations(asset_id, locale, alt_text, caption, long_description)` |
| has_text_layer | boolean | Есть ли распознанный текст (не заявлять доступность скана без него) |
| captions_url, transcript | | Для видео/аудио |
| download_allowed | boolean | Разрешено ли скачивание облегчённой копии; мастер-копия публично не скачивается (ТЗ §5.3, с. 6) |
| antivirus_status | `pending`/`clean`/`infected` | Проверка ClamAV (ТЗ §7.3, с. 17) |
| phash | text | Перцептивный хеш для поиска дубликатов (ТЗ §5.8 Г, с. 11) |
| ocr_text, ocr_status | text, enum | Результат OCR, черновик до подтверждения |
| rights_note, source_note | text | Права и источник |
| access_level | access_level | |
| processing_status | `pending`/`ready`/`failed` | |

`asset_derivatives(asset_id, variant, format, storage_key, width, height)` — производные в `public-media`.

## 5. Мультиязычный контент

Выбран подход «таблица переводов на сущность» (`documents` + `document_translations`), а не одна общая таблица `translations(entity, entity_id, field, locale, value)` из брифа.

Причины: внешние ключи и каскады работают; можно строить FTS-индексы по языкам; типизация Prisma; запросы без EAV-соединений. Общая таблица `translations` из брифа сохраняется в смысле «языковые версии» и покрыта этим подходом. Строки интерфейса — в файлах i18next, а не в БД.

Каждая `*_translations` имеет: PK `(entity_id, locale)`, `translation_status`, `translated_by`, `reviewed_by`, `reviewed_at`. Таблица `locales(code, name, is_enabled, sort_order)` позволяет включать языковые версии из админки (ТЗ §6.2, с. 14). Машинный перевод сохраняется со статусом `machine` и публично не выдаётся как официальный (ТЗ §5.9, с. 12).

## 6. Поиск

- Колонка `search_vector` в `document_translations` (и аналогичных) заполняется триггером:
  - `ru` → конфигурация `russian`, `en` → `english`, `kk` → `simple` (нет стеммера казахского, Q-13).
  - Веса: название A, аннотация/описание B, историческая справка C, расшифровка D.
- GIN-индексы по `search_vector`; триграммные GIN-индексы (`gin_trgm_ops`) по названиям, номерам фондов/описей/дел, `author_text`, названиям населённых пунктов.
- Материализованное представление `catalog_search_mv`: одна строка на (документ × язык) с полями фильтров (филиал, фонд, опись, дело, период, год от/до, тип, организация, населённые пункты, категории) — только публичные записи. Обновление `REFRESH MATERIALIZED VIEW CONCURRENTLY` по событию публикации (на объёме прототипа) или переход на обычную таблицу, обновляемую сервисом.
- Индексы фильтров: B-tree по `branch_id`, `fond_id`, `period_id`, `document_type_id`, `(year_from, year_to)`; GIN по массивам `settlement_ids`, `category_ids`.
- Синонимы и варианты написания (ТЗ §5.8 Б, с. 10): `search_synonyms(id, term, variants text[], locale NULL)` + `settlement_names` с историческими и казахскими названиями (Усть-Каменогорск / Өскемен, Семипалатинск / Семей). Запрос расширяется вариантами до FTS.
- Журнал запросов для аналитики (ТЗ §5.8 Д, с. 11): `search_queries(id, occurred_at, query_text, locale, filters jsonb, result_count, source ('catalog'|'site'|'assistant'))` — без IP и идентификаторов посетителя.
- Векторный поиск (D-023): `search_embeddings(entity_type, entity_id, locale, chunk_no, content, embedding vector(N))`, индекс HNSW. Размерность N зависит от выбранной модели эмбеддингов, поэтому таблица создаётся миграцией после выбора модели.

## 7. История региона, выставки, новости

- `publications` («Архив памяти»): `slug`, `kind` (`article`, `photo_story`, `biography`, `memoir` — воспоминания и свидетельства, ТЗ §5.6, с. 8), `period_text`, `year_from`, `year_to`, `source_note` (NOT NULL при публикации — проверка в сервисе и CHECK для `published`), `authorship`, `fond_ref` (опциональная ссылка на документ/дело), `cover_asset_id`, `publication_status`, `data_origin`. Переводы: `title`, `lead`, `body` (санитизированный rich text, хранится как JSON-документ редактора, рендерится в HTML на сервере по allowlist).
- `historical_persons` (+translations: имя, годы жизни, биография, источник).
- `historical_events` (+translations; дата с точностью; связь с населёнными пунктами и публикациями) — для хронологии.
- `collections` (+translations) и `collection_items(collection_id, item_type, item_id, sort_order, note)`; `UNIQUE (collection_id, item_type, item_id)`.
- `exhibitions` (+translations; `opens_at`, `closes_at`, `cover_asset_id`), `exhibition_items(exhibition_id, sort_order, asset_id, document_id NULL, …)` + `exhibition_item_translations(title, description, source_note)`; `UNIQUE (exhibition_id, sort_order)`.
- `news` (+translations; `published_at`, `cover_asset_id`, рубрика, `branch_id` NULL), `news_relations` — связанные материалы (ТЗ §5.11, с. 12).
- `pages` (+translations; `parent_id` для подразделов, `key` для служебных страниц `privacy`, `copyright`) — «Об архиве» (история, направления, миссия, руководство, структура, отделы, нормативная база, отчёты; ТЗ §5.2, с. 4–5), справка (ТЗ §5.4, с. 6–7), `/accessibility`.
- `staff_contacts` (+translations: ФИО, должность, отдел; телефон, email) — сотрудники и контактные лица (ТЗ §5.2, с. 4). Публикуются только служебные контакты с согласия.
- `galleries`, `gallery_items` — фотогалерея учреждения (ТЗ §5.2, с. 5).
- `faq_items` (+translations, `sort_order`), `external_links` (+translations; `category`: `legal`, `gov_resource`, `archive_resource`; `approved_by_customer` boolean) — ТЗ §5.4, с. 7.
- `menu_items` (+translations; `parent_id`, `sort_order`, `is_required`) — структура меню (ТЗ §4, с. 4; §6.2, с. 13).
- `site_settings(key, value jsonb)` — соцсети, контакты, режим работы, ссылки на гос. ресурсы, настройки интеграций (без секретов: секреты только в env).
- `content_revisions(id, entity_type, entity_id, data jsonb, status, created_by, created_at)` — редакции для согласования правок опубликованного материала (ТЗ §6.7).
- `notifications(id, user_id NULL, role_id NULL, type, entity_type, entity_id, message, created_at, read_at)` — уведомления редактору (ТЗ §6.7, с. 15).
- `import_jobs(id, entity_type, file_asset_id, status, total_rows, ok_rows, error_rows, errors jsonb, created_by, created_at, committed_at)` — импорт Excel/CSV с предпросмотром (ТЗ §6.3, с. 14).
- `migration_items(id, old_url, old_id, old_locale, new_entity_type, new_entity_id NULL, translation_group, content_type, owner, published_at, checked_at, source_note, rights_note, access_level, files jsonb, archive_code, decision ('migrate'|'skip'|'needs_review'), decision_reason)` — реестр миграции по полям аудита (ТЗ §11).
- `url_redirects(old_path UNIQUE, new_path, status_code default 301, created_at)` — перенаправления со старого сайта.
- `feedback_messages(id, topic, message, contact_email NULL, locale, page_path, status ('new'|'read'|'archived'), created_at, moderated_by)` — отзывы и предложения; IP не хранится, email только если пользователь сам указал.
- `glossary_terms` (+translations) — для объяснения терминов ИИ-помощником.

## 8. Пользователи, права, журнал

- `users(id, email UNIQUE citext, password_hash, full_name, is_active, failed_login_count, locked_until, totp_secret NULL, last_login_at, …)`.
- `roles(id, code UNIQUE, name_*)`, `permissions(id, code UNIQUE)`, `role_permissions(role_id, permission_id)` PK составной.
- `user_roles(user_id, role_id, branch_id NULL)`; `UNIQUE (user_id, role_id, branch_id)` с учётом NULL (`NULLS NOT DISTINCT`).
- `sessions(id, user_id, token_hash, csrf_token_hash, created_at, expires_at, last_seen_at, ip, user_agent)`; индекс по `expires_at` для очистки.
- `audit_logs(id bigserial, occurred_at, user_id NULL, action, entity_type, entity_id, changes jsonb, ip, user_agent, request_id)`; только INSERT для приложения (права роли БД), индексы `(entity_type, entity_id)`, `(user_id, occurred_at)`. Хранение и ротация — по требованиям заказчика.

## 9. Seed-наборы

| Набор | Содержимое | Маркировка |
|---|---|---|
| `seeds/synthetic` | Сгенерированные фонды/описи/дела/документы для нагрузки и тестов; явно вымышленные названия | `data_origin='synthetic'`; шифры с префиксом `TEST-` |
| `seeds/demo` | Демонстрационные публикации, выставки, новости, филиалы для показа | `data_origin='demo'`; плашка «Демонстрационная запись» на сайте |
| `seeds/migrated` | Материалы, перенесённые с текущего сайта e-arhiv.vko.gov.kz (ТЗ §11, с. 20). До защиты: площадки и филиалы (4 филиала + 2 площадки основного архива по аудиту), контакты, структура разделов, глоссарий | `data_origin='migrated'`, `source_url` обязателен; несверенные реквизиты — `verified_at IS NULL` и плашка «требует сверки». Координаты не выдумываются |
| `seeds/verified` | Только материалы с проверяемым источником и разрешением на публикацию | `data_origin='verified'`, `source_note` обязателен. На старте пуст |

Синтетика и демо никогда не загружаются в prod (проверка в скрипте сидирования по `NODE_ENV`).

## 10. Открытые вопросы к заказчику

1. Пределы уникальности номеров фондов (архив целиком или филиал), формат литер и префиксов (ТЗ не уточняет).
2. Есть ли подокументное описание или только поделочное.
3. Какие поля описи и дела можно публиковать (например, «место хранения»).
4. Правила и сроки ограничения доступа; кто их проставляет.
5. Формат и объём исходных баз для миграции (ТЗ §11, с. 21: «определяются совместно с заказчиком»).
7. Состав полей «условий доступа» для документов с ограниченным доступом и кто их заполняет.
6. Нужна ли казахская латиница.

## 12. Состояние реализации (ЭТАП 1, 2026-11-09)

- ORM: Prisma 6.19 (`prisma-client-js`, preview `postgresqlExtensions`). Схема: `backend/prisma/schema.prisma`; переводы — таблицы `*_translations` с PK `(entity_id, locale)`.
- Миграции: `20261109144347_init` (сгенерирована Prisma; включает триграммные GIN-индексы, описанные в схеме через `ops: raw("gin_trgm_ops")`) и `20261109144400_access_search` (вручную: CHECK-ограничения, частичные уникальные индексы `branches_single_main_idx` и `user_roles_global_uidx`, триггеры FTS и `has_digital_copy`, представления `public_documents_v`, `public_document_pages_v`, `public_fonds_v`). `prisma migrate diff` от базы к схеме пуст.
- `search_embeddings` не создана: размерность вектора зависит от модели (D-023), таблица появится отдельной миграцией. Расширение `vector` уже подключено.
- Сиды (`backend/prisma/seeds`, `SEED_SETS`): справочники всегда; `migrated` — 6 подразделений и 5 населённых пунктов с историческими названиями, `verified_at = NULL`, без координат и индекса (Q-22, Q-23); `synthetic` — фонды `TEST-1…4` с заголовками «[Синтетика]»; `demo` — публикации, новости и выставка «[Демо]». `synthetic` и `demo` в production отклоняются.
- Тесты (`backend/tests`) создают отдельную базу на прогон, применяют `migrate deploy`, загружают сиды и удаляют базу после прогона. Проверяют скрытие `closed` на любом уровне, неопубликованных предков, отсутствие копий у `restricted`, FTS для ru и kk, триггер копий, CHECK-ограничения и признаки перенесённых данных.

## 13. Изменения ЭТАПА 2 (2026-11-09)

- Миграция `20261109160000_public_hierarchy_views`: представления `public_inventories_v` и `public_cases_v` с тем же правилом, что у `public_documents_v` (опубликованная цепочка, без закрытых уровней, эффективный доступ — самый строгий).
- Обозначения шифра предварительно зафиксированы пользователем: RU «Ф. / Оп. / Д. / Л.», KZ «Қ. / Тізб. / Іс / П.», EN «F. / Inv. / File / Fol.» (EN — интерфейсные, могут измениться). Подписи в `ARCHIVE_CODE_LABELS`, `formatArchiveCode` принимает свой набор подписей. Разбор шифра принимает буквенный префикс фонда до 4 символов.
- Синтетические сиды дополнены расшифровками (открытый и ограниченный документ) и описанием закрытого документа: на них проверяется, что поиск не раскрывает закрытые сведения.
- Ограничение: для ограниченных документов поиск применяет `ts_filter` к вектору, поэтому индекс GIN по `search_vector` для них не используется. На объёме прототипа это незаметно; для промышленного объёма — отдельная колонка вектора без веса D.

## 14. Изменения ЭТАПА 8 (2026-11-09)

- Миграция `20261109200000_exhibitions_public`: `exhibition_item_translations.alt_text`; внешние ключи `exhibition_items.document_id` и `fond_id` (`ON DELETE SET NULL`); представления `public_exhibitions_v` (опубликованные, не удалённые) и `public_exhibition_images_v` (открытый, готовый, проверенный антивирусом файл; страница документа — только из `public_document_pages_v`).
- Справочник: категории `exhibition_topic` (те же тематики, что у истории региона). Демо-набор: две выставки с пометкой «Демо» и SVG-заглушками в корзине `archive-demo`.
