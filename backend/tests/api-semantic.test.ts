import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmbeddingProvider } from '../src/modules/ai/embeddings.ts';
import { embeddingText, indexPublicDocuments } from '../src/modules/ai/indexer.ts';
import { testApp, testDb } from './helpers.ts';

/**
 * Смысловой поиск (D-023) с подменной моделью: векторы из триграмм символов, поэтому похожие тексты близки.
 * Проверяется устройство, а не качество настоящей модели: что индексируется, что отдаётся и как работает отказ.
 */
class TrigramEmbeddings implements EmbeddingProvider {
  readonly model = 'test-trigram';
  calls: string[][] = [];
  async embed(texts: readonly string[]): Promise<number[][]> {
    this.calls.push([...texts]);
    return texts.map((text) => {
      const v = new Array<number>(256).fill(0);
      const s = ` ${text.toLowerCase()} `;
      for (let i = 0; i + 3 <= s.length; i++) {
        let h = 0;
        for (const ch of s.slice(i, i + 3)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 256;
        v[h] = (v[h] ?? 0) + 1;
      }
      return v;
    });
  }
}

class BrokenEmbeddings implements EmbeddingProvider {
  readonly model = 'test-trigram';
  async embed(): Promise<number[][]> {
    throw new Error('connection refused');
  }
}

const db = testDb();
const model = new TrigramEmbeddings();
let withModel: Awaited<ReturnType<typeof testApp>>;
let withoutModel: Awaited<ReturnType<typeof testApp>>;
let broken: Awaited<ReturnType<typeof testApp>>;

beforeAll(async () => {
  withModel = await testApp({ embeddings: model });
  withoutModel = await testApp();
  broken = await testApp({ embeddings: new BrokenEmbeddings() });
});
afterAll(async () => {
  await db.$executeRaw`DELETE FROM document_embeddings WHERE model = ${model.model}`;
  await Promise.all([withModel.close(), withoutModel.close(), broken.close(), db.$disconnect()]);
});

describe('индексация', () => {
  it('в индекс попадают только публичные документы и только название с описанием', async () => {
    const report = await indexPublicDocuments(db, model);
    expect(report.indexed).toBeGreaterThan(0);
    const leaked = await db.$queryRaw<Array<{ id: string }>>`
      SELECT e.document_id AS id FROM document_embeddings e
      WHERE NOT EXISTS (SELECT 1 FROM public_documents_v p WHERE p.id = e.document_id)`;
    expect(leaked).toEqual([]);
    const closedTitles = await db.$queryRaw<Array<{ title: string }>>`
      SELECT t.title FROM document_translations t
      WHERE NOT EXISTS (SELECT 1 FROM public_documents_v p WHERE p.id = t.document_id)`;
    const sent = model.calls.flat();
    for (const { title } of closedTitles) expect(sent.some((text) => text.startsWith(`${title}\n`) || text === title)).toBe(false);
  });

  it('повторный запуск не пересчитывает неизменённые документы', async () => {
    const before = model.calls.length;
    const report = await indexPublicDocuments(db, model);
    expect(report.indexed).toBe(0);
    expect(model.calls.length).toBe(before);
  });

  it('текст для модели — название и описание через перевод строки', () => {
    expect(embeddingText({ title: 'Протокол', description: 'Заседание' })).toBe('Протокол\nЗаседание');
    expect(embeddingText({ title: 'Протокол', description: null })).toBe('Протокол');
  });
});

describe('GET /catalog/semantic', () => {
  it('без модели: available=false, пустой список, обычный поиск не затронут', async () => {
    const res = await withoutModel.get('/api/v1/catalog/semantic?q=протокол&lang=ru');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, model: null, items: [] });
  });

  it('с моделью: документ с похожим названием первым, карточка как в выдаче, со сходством', async () => {
    const [doc] = await db.$queryRaw<Array<{ id: string; title: string }>>`
      SELECT t.document_id AS id, t.title FROM document_translations t
      JOIN public_documents_v p ON p.id = t.document_id
      WHERE t.locale = 'ru' AND t.translation_status <> 'missing' ORDER BY length(t.title) DESC LIMIT 1`;
    expect(doc).toBeDefined();
    const res = await withModel.get(`/api/v1/catalog/semantic?q=${encodeURIComponent(doc?.title ?? '')}&lang=ru`);
    expect(res.status).toBe(200);
    expect(res.body['available']).toBe(true);
    const items = res.body.items ?? [];
    expect(items[0]).toMatchObject({ id: doc?.id, archiveCode: expect.any(Object) });
    expect(Number(items[0]?.['score'])).toBeGreaterThan(0.5);
  });

  it('документ, закрытый после индексации, в ответ не попадает', async () => {
    const [doc] = await db.$queryRaw<Array<{ id: string; title: string }>>`
      SELECT t.document_id AS id, t.title FROM document_translations t
      JOIN public_documents_v p ON p.id = t.document_id
      WHERE t.locale = 'ru' ORDER BY length(t.title) DESC LIMIT 1`;
    if (!doc) throw new Error('no public document');
    const before = await db.document.findUniqueOrThrow({ where: { id: doc.id }, select: { accessLevel: true } });
    await db.document.update({ where: { id: doc.id }, data: { accessLevel: 'closed' } });
    try {
      const res = await withModel.get(`/api/v1/catalog/semantic?q=${encodeURIComponent(doc.title)}&lang=ru`);
      expect((res.body.items ?? []).map((i) => i['id'])).not.toContain(doc.id);
    } finally {
      await db.document.update({ where: { id: doc.id }, data: { accessLevel: before.accessLevel } });
    }
  });

  it('модель не отвечает: 200 и available=false, сайт продолжает работать на обычном поиске', async () => {
    const res = await broken.get('/api/v1/catalog/semantic?q=протокол&lang=ru');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: false, items: [] });
    expect((await broken.get('/api/v1/catalog/documents?q=протокол&lang=ru')).status).toBe(200);
  });

  it('проверяет запрос: пустой и слишком длинный — 400', async () => {
    expect((await withModel.get('/api/v1/catalog/semantic?q=a')).status).toBe(400);
    expect((await withModel.get(`/api/v1/catalog/semantic?q=${'а'.repeat(301)}`)).status).toBe(400);
  });
});

describe('архивный помощник с моделью', () => {
  it('ответ на поиск дополнен документами по смыслу, без повторов и только публичными', async () => {
    const [doc] = await db.$queryRaw<Array<{ id: string; title: string }>>`
      SELECT t.document_id AS id, t.title FROM document_translations t
      JOIN public_documents_v p ON p.id = t.document_id
      WHERE t.locale = 'ru' ORDER BY length(t.title) DESC LIMIT 1`;
    const res = await withModel.get(`/api/v1/assistant/ask?q=${encodeURIComponent(doc?.title ?? '')}&lang=ru`);
    expect(res.status).toBe(200);
    const semantic = (res.body['semantic'] ?? []) as Array<{ id: string }>;
    const documents = (res.body['documents'] ?? []) as Array<{ id: string }>;
    expect(semantic.length + documents.length).toBeGreaterThan(0);
    expect(semantic.filter((d) => documents.some((x) => x.id === d.id))).toEqual([]);
    const publicIds = new Set((await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM public_documents_v`).map((r) => r.id));
    expect(semantic.every((d) => publicIds.has(d.id))).toBe(true);
  });

  it('без модели и при сбое модели помощник отвечает правилами, semantic пуст', async () => {
    for (const app of [withoutModel, broken]) {
      const res = await app.get(`/api/v1/assistant/ask?q=${encodeURIComponent('фотографии Усть-Каменогорска 1960-х')}&lang=ru`);
      expect(res.status).toBe(200);
      expect(res.body['intent']).toBe('search');
      expect(res.body['semantic']).toEqual([]);
    }
  });
});

