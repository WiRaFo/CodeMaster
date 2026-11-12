-- Смысловой поиск (D-023): векторы публичных метаданных документов, см. schema.prisma DocumentEmbedding.
-- CreateTable
CREATE TABLE "document_embeddings" (
    "document_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "model" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_embeddings_pkey" PRIMARY KEY ("document_id","locale","model")
);

-- AddForeignKey
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

