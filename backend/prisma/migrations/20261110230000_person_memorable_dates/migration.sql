-- CreateTable
CREATE TABLE "person_memorable_dates" (
    "person_id" UUID NOT NULL,
    "memorable_date_id" UUID NOT NULL,

    CONSTRAINT "person_memorable_dates_pkey" PRIMARY KEY ("person_id","memorable_date_id")
);

-- CreateIndex
CREATE INDEX "person_memorable_dates_memorable_date_id_idx" ON "person_memorable_dates"("memorable_date_id");

-- AddForeignKey
ALTER TABLE "person_memorable_dates" ADD CONSTRAINT "person_memorable_dates_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "historical_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_memorable_dates" ADD CONSTRAINT "person_memorable_dates_memorable_date_id_fkey" FOREIGN KEY ("memorable_date_id") REFERENCES "memorable_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

