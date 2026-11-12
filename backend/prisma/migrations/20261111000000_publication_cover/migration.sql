-- AlterTable
ALTER TABLE "publication_translations" ADD COLUMN     "cover_alt" TEXT;

-- Обложки публикаций «Цифровой истории», которые разрешено показывать на сайте (F-149):
-- публикация опубликована, файл открыт, обработан и проверен антивирусом. Скан страницы документа
-- показывается только тогда, когда эта страница публична: обложка не должна открывать закрытый скан.
CREATE VIEW public_publication_covers_v AS
SELECT
  p.id AS publication_id,
  p.slug,
  a.id AS asset_id,
  a.storage_bucket,
  a.storage_key,
  a.mime_type,
  a.width,
  a.height
FROM publications p
JOIN digital_assets a ON a.id = p.cover_asset_id
WHERE p.publication_status = 'published'
  AND p.deleted_at IS NULL
  AND p.published_at IS NOT NULL
  AND p.published_at <= now()
  AND a.deleted_at IS NULL
  AND a.access_level = 'open'
  AND a.processing_status = 'ready'
  AND a.antivirus_status = 'clean'
  AND NOT EXISTS (
    SELECT 1 FROM document_assets da
    WHERE da.asset_id = a.id
      AND NOT EXISTS (SELECT 1 FROM public_document_pages_v pg WHERE pg.asset_id = a.id AND pg.document_id = da.document_id)
  );

COMMENT ON VIEW public_publication_covers_v IS
  'Обложки опубликованных публикаций; только проверенные открытые файлы, сканы документов — если страница публична.';
