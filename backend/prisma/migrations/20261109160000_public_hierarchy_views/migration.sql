-- Публичные описи и дела для навигации каталога фонд → опись → дело (ЭТАП 2).
-- Правило то же, что у public_documents_v: все уровни цепочки и подразделение опубликованы и не удалены,
-- ни один уровень не закрыт; эффективный доступ — самый строгий в цепочке.

CREATE VIEW public_inventories_v AS
SELECT
  i.id,
  i.fond_id,
  f.branch_id,
  f.fond_number,
  i.inventory_number,
  i.year_from,
  i.year_to,
  i.data_origin,
  CASE
    WHEN 'restricted' IN (i.access_level, f.access_level) THEN 'restricted'::"AccessLevel"
    ELSE 'open'::"AccessLevel"
  END AS effective_access
FROM inventories i
JOIN fonds f    ON f.id = i.fond_id
JOIN branches b ON b.id = f.branch_id
WHERE i.deleted_at IS NULL AND f.deleted_at IS NULL AND b.deleted_at IS NULL
  AND i.publication_status = 'published' AND f.publication_status = 'published'
  AND b.publication_status = 'published'
  AND 'closed' NOT IN (i.access_level, f.access_level);

COMMENT ON VIEW public_inventories_v IS 'Публичные описи: опубликованная цепочка без закрытых уровней.';

CREATE VIEW public_cases_v AS
SELECT
  c.id,
  c.inventory_id,
  i.fond_id,
  f.branch_id,
  f.fond_number,
  i.inventory_number,
  c.case_number,
  c.date_from,
  c.date_to,
  c.date_precision,
  c.sheet_count,
  c.storage_location,
  c.data_origin,
  CASE
    WHEN 'restricted' IN (c.access_level, i.access_level, f.access_level) THEN 'restricted'::"AccessLevel"
    ELSE 'open'::"AccessLevel"
  END AS effective_access
FROM cases c
JOIN inventories i ON i.id = c.inventory_id
JOIN fonds f       ON f.id = i.fond_id
JOIN branches b    ON b.id = f.branch_id
WHERE c.deleted_at IS NULL AND i.deleted_at IS NULL AND f.deleted_at IS NULL AND b.deleted_at IS NULL
  AND c.publication_status = 'published' AND i.publication_status = 'published'
  AND f.publication_status = 'published' AND b.publication_status = 'published'
  AND 'closed' NOT IN (c.access_level, i.access_level, f.access_level);

COMMENT ON VIEW public_cases_v IS 'Публичные дела: опубликованная цепочка без закрытых уровней.';
