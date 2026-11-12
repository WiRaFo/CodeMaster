-- CreateTable
CREATE TABLE "memorable_dates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_year" INTEGER NOT NULL,
    "month" INTEGER,
    "day" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "memorable_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memorable_date_translations" (
    "memorable_date_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "date_label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "memorable_date_translations_pkey" PRIMARY KEY ("memorable_date_id","locale")
);

-- CreateIndex
CREATE INDEX "memorable_dates_calendar_year_month_idx" ON "memorable_dates"("calendar_year", "month");

-- AddForeignKey
ALTER TABLE "memorable_date_translations" ADD CONSTRAINT "memorable_date_translations_memorable_date_id_fkey" FOREIGN KEY ("memorable_date_id") REFERENCES "memorable_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

