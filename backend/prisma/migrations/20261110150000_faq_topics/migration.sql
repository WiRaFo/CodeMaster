-- AlterTable
ALTER TABLE "faq_items" ADD COLUMN     "topic" TEXT NOT NULL DEFAULT 'site';

-- CreateIndex
CREATE INDEX "faq_items_topic_sort_order_idx" ON "faq_items"("topic", "sort_order");

