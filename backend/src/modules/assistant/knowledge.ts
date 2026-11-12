import type { PrismaClient } from '@prisma/client';
import { ASSISTANT_SECTIONS, type AssistantSection, type Locale } from '@archive-vko/shared';
import { normalize } from './query-parser.ts';

const isSection = (v: string): v is AssistantSection => (ASSISTANT_SECTIONS as readonly string[]).includes(v);

export interface KnowledgeAnswer {
  id: string;
  question: string;
  answer: string;
  contentLang: Locale;
  links: AssistantSection[];
}

/**
 * Ответ из базы знаний помощника (ТЗ §5.8 А, с. 10): опубликованная запись, у которой в вопросе посетителя
 * найдена ключевая фраза на любом языке. Побеждает запись с самым длинным совпадением (точнее подходит).
 * Текст отдаётся на языке интерфейса, а если перевода нет — на русском с пометкой языка.
 */
export async function findKnowledge(db: PrismaClient, question: string, lang: Locale): Promise<KnowledgeAnswer | null> {
  const text = ` ${normalize(question)} `;
  const entries = await db.assistantKnowledge.findMany({ where: { publicationStatus: 'published' }, include: { translations: true } });
  let best: { score: number; entry: (typeof entries)[number] } | null = null;
  for (const entry of entries) {
    let score = 0;
    for (const t of entry.translations) {
      for (const k of t.keywords) {
        const key = normalize(k);
        if (key.length >= 3 && text.includes(key)) score = Math.max(score, key.length);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { score, entry };
  }
  if (!best) return null;
  const tr = best.entry.translations.find((t) => t.locale === lang) ?? best.entry.translations.find((t) => t.locale === 'ru');
  if (!tr) return null;
  return { id: best.entry.id, question: tr.question, answer: tr.answer, contentLang: tr.locale, links: best.entry.links.filter(isSection) };
}
