-- CreateTable
CREATE TABLE "publication_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publication_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publication_images_publication_id_sort_order_key" ON "publication_images"("publication_id", "sort_order");

-- AddForeignKey
ALTER TABLE "publication_images" ADD CONSTRAINT "publication_images_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_images" ADD CONSTRAINT "publication_images_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Фото внутри публикаций, которые разрешено показывать на сайте (F-149): те же условия, что у обложки
-- (public_publication_covers_v). position — номер фото среди видимых, начиная с 1: по нему сайт отдаёт файл.
CREATE VIEW public_publication_images_v AS
SELECT
  i.id AS image_id,
  p.id AS publication_id,
  p.slug,
  row_number() OVER (PARTITION BY p.id ORDER BY i.sort_order) AS position,
  a.id AS asset_id,
  a.storage_bucket,
  a.storage_key,
  a.mime_type,
  a.width,
  a.height
FROM publication_images i
JOIN publications p ON p.id = i.publication_id
JOIN digital_assets a ON a.id = i.asset_id
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

COMMENT ON VIEW public_publication_images_v IS
  'Фото опубликованных публикаций; только проверенные открытые файлы, сканы документов — если страница публична.';
