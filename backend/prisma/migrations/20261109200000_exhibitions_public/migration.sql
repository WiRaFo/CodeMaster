-- ЭТАП 8. Онлайн-выставки (ТЗ §5.7, с. 9; §6.5, с. 14–15).

-- Текстовая альтернатива изображения экспоната (A-004).
ALTER TABLE "exhibition_item_translations" ADD COLUMN     "alt_text" TEXT;

-- Экспонат ссылается на документ или фонд; при удалении записи каталога ссылка обнуляется.
ALTER TABLE "exhibition_items" ADD CONSTRAINT "exhibition_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exhibition_items" ADD CONSTRAINT "exhibition_items_fond_id_fkey" FOREIGN KEY ("fond_id") REFERENCES "fonds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Опубликованные выставки.
CREATE VIEW public_exhibitions_v AS
SELECT e.*
FROM exhibitions e
WHERE e.deleted_at IS NULL
  AND e.publication_status = 'published';

COMMENT ON VIEW public_exhibitions_v IS 'Выставки, которые видны на сайте.';

-- Изображения экспонатов, которые разрешено показывать публично.
-- Если файл одновременно является страницей документа, он показывается только тогда,
-- когда эта страница публична (public_document_pages_v): выставка не должна открывать закрытый скан.
CREATE VIEW public_exhibition_images_v AS
SELECT
  i.id AS item_id,
  i.exhibition_id,
  i.sort_order,
  a.id AS asset_id,
  a.storage_bucket,
  a.storage_key,
  a.mime_type,
  a.width,
  a.height
FROM exhibition_items i
JOIN public_exhibitions_v e ON e.id = i.exhibition_id
JOIN digital_assets a       ON a.id = i.asset_id
WHERE a.deleted_at IS NULL
  AND a.access_level = 'open'
  AND a.processing_status = 'ready'
  AND a.antivirus_status = 'clean'
  AND NOT EXISTS (
    SELECT 1 FROM document_assets da
    WHERE da.asset_id = a.id
      AND NOT EXISTS (SELECT 1 FROM public_document_pages_v p WHERE p.asset_id = a.id AND p.document_id = da.document_id)
  );

COMMENT ON VIEW public_exhibition_images_v IS
  'Изображения экспонатов опубликованных выставок; сканы документов — только если страница документа публична.';
