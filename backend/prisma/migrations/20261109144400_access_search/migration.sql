-- ЭТАП 1. Ручная миграция: то, что Prisma не описывает в schema.prisma.
-- Ограничения целостности, частичные индексы, триграммные индексы, полнотекстовый поиск,
-- представления публичного доступа. Проект: docs/database-design.md §3, §6; docs/architecture.md §6.

-- ─────────────── Ограничения целостности ───────────────

ALTER TABLE fonds        ADD CONSTRAINT fonds_years_chk        CHECK (year_from IS NULL OR year_to IS NULL OR year_from <= year_to);
ALTER TABLE inventories  ADD CONSTRAINT inventories_years_chk  CHECK (year_from IS NULL OR year_to IS NULL OR year_from <= year_to);
ALTER TABLE cases        ADD CONSTRAINT cases_dates_chk        CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to);
ALTER TABLE cases        ADD CONSTRAINT cases_sheets_chk       CHECK (sheet_count IS NULL OR sheet_count >= 0);
ALTER TABLE documents    ADD CONSTRAINT documents_dates_chk    CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to);
ALTER TABLE documents    ADD CONSTRAINT documents_sheets_chk   CHECK (sheet_count IS NULL OR sheet_count >= 0);
-- Подтверждённая запись обязана иметь источник (Б§23).
ALTER TABLE documents    ADD CONSTRAINT documents_verified_source_chk
  CHECK (data_origin <> 'verified' OR source_note IS NOT NULL);
-- Перенесённая запись обязана ссылаться на исходный адрес (ТЗ §11).
ALTER TABLE documents    ADD CONSTRAINT documents_migrated_source_chk
  CHECK (data_origin <> 'migrated' OR source_url IS NOT NULL);
-- Публикация «Архива памяти» без источника не публикуется (ТЗ §5.6, с. 9).
ALTER TABLE publications ADD CONSTRAINT publications_source_chk
  CHECK (publication_status <> 'published' OR source_note IS NOT NULL);
ALTER TABLE publications ADD CONSTRAINT publications_years_chk CHECK (year_from IS NULL OR year_to IS NULL OR year_from <= year_to);
ALTER TABLE branches     ADD CONSTRAINT branches_coords_chk
  CHECK ((lat IS NULL OR lat BETWEEN -90 AND 90) AND (lng IS NULL OR lng BETWEEN -180 AND 180));
ALTER TABLE branches     ADD CONSTRAINT branches_migrated_source_chk
  CHECK (data_origin <> 'migrated' OR source_url IS NOT NULL);
ALTER TABLE branch_schedules ADD CONSTRAINT branch_schedules_weekday_chk CHECK (weekday BETWEEN 1 AND 7);
ALTER TABLE branch_schedules ADD CONSTRAINT branch_schedules_kind_chk CHECK (kind IN ('office', 'reading_room'));
ALTER TABLE document_relations ADD CONSTRAINT document_relations_one_target_chk
  CHECK (num_nonnulls(target_document_id, target_case_id) = 1 AND source_document_id IS DISTINCT FROM target_document_id);
ALTER TABLE digital_assets ADD CONSTRAINT digital_assets_size_chk CHECK (size_bytes >= 0);
ALTER TABLE historical_persons ADD CONSTRAINT historical_persons_years_chk
  CHECK (birth_year IS NULL OR death_year IS NULL OR birth_year <= death_year);
ALTER TABLE feedback_messages ADD CONSTRAINT feedback_messages_length_chk CHECK (char_length(message) BETWEEN 1 AND 2000);
ALTER TABLE url_redirects ADD CONSTRAINT url_redirects_status_chk CHECK (status_code IN (301, 302, 308));

-- Не более одного основного архива.
CREATE UNIQUE INDEX branches_single_main_idx ON branches (is_main) WHERE is_main AND deleted_at IS NULL;

-- Роль на весь архив (branch_id IS NULL) назначается один раз.
-- Для назначений с филиалом уникальность обеспечивает user_roles_user_id_role_id_branch_id_key из schema.prisma.
CREATE UNIQUE INDEX user_roles_global_uidx ON user_roles (user_id, role_id) WHERE branch_id IS NULL;

-- Триграммные индексы (неточный поиск по шифрам и названиям, ТЗ §5.8 Б) описаны в schema.prisma.

-- ─────────────── Полнотекстовый поиск ───────────────

-- Конфигурация FTS по языку. Для казахского встроенного стеммера нет (Q-13): simple + триграммы.
CREATE FUNCTION archive_search_config(loc "Locale") RETURNS regconfig
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE loc WHEN 'ru' THEN 'russian'::regconfig WHEN 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END
$$;

CREATE FUNCTION document_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg regconfig := archive_search_config(NEW.locale);
BEGIN
  NEW.search_vector :=
       setweight(to_tsvector(cfg, coalesce(NEW.title, '')), 'A')
    || setweight(to_tsvector(cfg, coalesce(NEW.description, '')), 'B')
    || setweight(to_tsvector(cfg, coalesce(NEW.historical_note, '')), 'C')
    || setweight(to_tsvector(cfg, coalesce(NEW.transcription, '') || ' ' || coalesce(NEW.seo_keywords, '')), 'D');
  RETURN NEW;
END $$;
CREATE TRIGGER document_translations_search_vector_trg
  BEFORE INSERT OR UPDATE OF title, description, historical_note, transcription, seo_keywords, locale
  ON document_translations FOR EACH ROW EXECUTE FUNCTION document_translations_search_vector();

CREATE FUNCTION text_translations_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cfg regconfig := archive_search_config(NEW.locale);
BEGIN
  NEW.search_vector :=
       setweight(to_tsvector(cfg, coalesce(NEW.title, '')), 'A')
    || setweight(to_tsvector(cfg, coalesce(NEW.lead, '')), 'B')
    || setweight(to_tsvector(cfg, coalesce(NEW.body_text, '') || ' ' || coalesce(NEW.seo_keywords, '')), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER publication_translations_search_vector_trg
  BEFORE INSERT OR UPDATE OF title, lead, body_text, seo_keywords, locale
  ON publication_translations FOR EACH ROW EXECUTE FUNCTION text_translations_search_vector();
CREATE TRIGGER news_translations_search_vector_trg
  BEFORE INSERT OR UPDATE OF title, lead, body_text, seo_keywords, locale
  ON news_translations FOR EACH ROW EXECUTE FUNCTION text_translations_search_vector();

-- ─────────────── Признак наличия цифровой копии ───────────────

CREATE FUNCTION documents_refresh_has_digital_copy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc uuid := coalesce(NEW.document_id, OLD.document_id);
BEGIN
  UPDATE documents
     SET has_digital_copy = EXISTS (SELECT 1 FROM document_assets WHERE document_id = doc)
   WHERE id = doc;
  IF TG_OP = 'UPDATE' AND OLD.document_id IS DISTINCT FROM NEW.document_id THEN
    UPDATE documents
       SET has_digital_copy = EXISTS (SELECT 1 FROM document_assets WHERE document_id = OLD.document_id)
     WHERE id = OLD.document_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER document_assets_has_copy_trg
  AFTER INSERT OR UPDATE OR DELETE ON document_assets
  FOR EACH ROW EXECUTE FUNCTION documents_refresh_has_digital_copy();

-- ─────────────── Публичный слой доступа (ТЗ §5.3, с. 6; Q-05) ───────────────
-- Карточка публична, если документ и все предки (дело, опись, фонд, подразделение) опубликованы,
-- не удалены и ни один не закрыт. Эффективный уровень — самый строгий в цепочке.
-- Все публичные запросы backend идут только через эти представления.

CREATE VIEW public_documents_v AS
SELECT
  d.id,
  d.case_id,
  c.inventory_id,
  i.fond_id,
  f.branch_id,
  f.fond_number,
  i.inventory_number,
  c.case_number,
  d.document_number,
  d.sheets_from,
  d.sheets_to,
  coalesce(d.sheet_count, c.sheet_count) AS sheet_count,
  d.date_from,
  d.date_to,
  d.date_precision,
  d.period_id,
  d.document_type_id,
  d.organization_id,
  d.author_text,
  d.original_languages,
  coalesce(d.storage_location, c.storage_location) AS storage_location,
  d.has_digital_copy,
  d.is_featured,
  d.data_origin,
  d.source_note,
  d.updated_at,
  CASE
    WHEN 'restricted' IN (d.access_level, c.access_level, i.access_level, f.access_level)
      THEN 'restricted'::"AccessLevel"
    ELSE 'open'::"AccessLevel"
  END AS effective_access
FROM documents d
JOIN cases c       ON c.id = d.case_id
JOIN inventories i ON i.id = c.inventory_id
JOIN fonds f       ON f.id = i.fond_id
JOIN branches b    ON b.id = f.branch_id
WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL AND i.deleted_at IS NULL
  AND f.deleted_at IS NULL AND b.deleted_at IS NULL
  AND d.publication_status = 'published' AND c.publication_status = 'published'
  AND i.publication_status = 'published' AND f.publication_status = 'published'
  AND b.publication_status = 'published'
  AND 'closed' NOT IN (d.access_level, c.access_level, i.access_level, f.access_level);

COMMENT ON VIEW public_documents_v IS
  'Публичные карточки документов. restricted: только метаданные и условия доступа, без цифровой копии.';

-- Страницы цифровой копии: только при эффективном open, готовой обработке и чистой антивирусной проверке.
CREATE VIEW public_document_pages_v AS
SELECT
  da.document_id,
  da.page_number,
  da.sheet_label,
  a.id AS asset_id,
  a.kind,
  a.mime_type,
  a.width,
  a.height,
  a.has_text_layer,
  a.download_allowed
FROM document_assets da
JOIN public_documents_v p ON p.id = da.document_id AND p.effective_access = 'open'
JOIN digital_assets a     ON a.id = da.asset_id
WHERE a.deleted_at IS NULL
  AND a.access_level = 'open'
  AND a.processing_status = 'ready'
  AND a.antivirus_status = 'clean';

COMMENT ON VIEW public_document_pages_v IS
  'Страницы цифровых копий, которые разрешено показывать публично (только эффективный open).';

-- Публичные фонды для навигации каталога: фонд → опись → дело.
CREATE VIEW public_fonds_v AS
SELECT f.*
FROM fonds f
JOIN branches b ON b.id = f.branch_id
WHERE f.deleted_at IS NULL AND b.deleted_at IS NULL
  AND f.publication_status = 'published' AND b.publication_status = 'published'
  AND f.access_level <> 'closed';
