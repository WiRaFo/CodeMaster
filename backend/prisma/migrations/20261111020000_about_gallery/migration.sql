-- Фотогалерея учреждения на странице «Об архиве» (ТЗ §5.2; F-021): галерея со slug 'about-archive'.
-- На сайт попадает только проверенный антивирусом открытый файл с описанием для незрячих на русском.
-- position — номер фото среди видимых, начиная с 1: по нему сайт отдаёт файл.
CREATE VIEW public_about_gallery_v AS
SELECT
  gi.id AS item_id,
  row_number() OVER (ORDER BY gi.sort_order) AS position,
  a.id AS asset_id,
  a.storage_bucket,
  a.storage_key,
  a.mime_type,
  a.width,
  a.height
FROM gallery_items gi
JOIN galleries g ON g.id = gi.gallery_id
JOIN digital_assets a ON a.id = gi.asset_id
WHERE g.slug = 'about-archive'
  AND g.publication_status = 'published'
  AND g.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND a.access_level = 'open'
  AND a.processing_status = 'ready'
  AND a.antivirus_status = 'clean'
  AND EXISTS (SELECT 1 FROM asset_translations t WHERE t.asset_id = a.id AND t.locale = 'ru' AND coalesce(trim(t.alt_text), '') <> '')
  AND NOT EXISTS (SELECT 1 FROM document_assets da WHERE da.asset_id = a.id);

COMMENT ON VIEW public_about_gallery_v IS
  'Фото учреждения для «Об архиве»; только проверенные открытые файлы с описанием, без сканов документов.';
