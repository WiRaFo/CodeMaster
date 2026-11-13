import type { FastifyInstance } from 'fastify';
import { assistantAskSchema, type Locale } from '@archive-vko/shared';
import { ApiError } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import type { PrismaClient } from '@prisma/client';
import type { EmbeddingProvider } from '../ai/embeddings.ts';
import { semanticSearch } from '../ai/semantic.ts';
import { LoginLimiter } from '../auth/login-limiter.ts';
import { CatalogRepository } from '../catalog/catalog.repository.ts';
import { documentSummaryDto } from '../catalog/catalog.mapper.ts';
import { logSearchQuery } from '../analytics/analytics.ts';
import { classifyIntent, type Intent } from './intents.ts';
import { findKnowledge } from './knowledge.ts';
import { normalize, parseQuery, type ParsedQuery, type SettlementDictEntry } from './query-parser.ts';

/**
 * Архивный помощник (ТЗ §5.8 А, Б, с. 10–11; F-120–F-125) без языковой модели: намерение и фильтры
 * определяются правилами, а ответ собирается только из публичных маршрутов API этого же сервера.
 * Поэтому помощник видит ровно то же, что посетитель каталога: закрытое не попадает в ответ,
 * а каждая ссылка ведёт на существующую запись. Текст ответа формирует интерфейс по ключам словаря.
 * Если подключена модель ИИ (AI_PROVIDER), ответ дополняется документами, похожими по смыслу на вопрос;
 * без модели или при её сбое помощник отвечает только правилами, как раньше.
 */

interface Named { name: string | null }
interface Doc {
  id: string;
  title: string | null;
  archiveCode: { formatted: string } | null;
  date: { from: string | null; to: string | null };
  type: { code: string; name: string | null };
  access: 'open' | 'restricted';
  hasDigitalCopy: boolean;
  dataOrigin: string;
}
interface Branch {
  slug: string;
  name: string | null;
  shortName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
  type: { code: string };
  needsVerification: boolean;
}

const FILTER_ORDER = ['topic', 'keywords', 'type'] as const;
type Relaxable = (typeof FILTER_ORDER)[number];

/** Параметры адреса каталога из разобранного запроса (без языка и страницы). */
export function catalogParams(p: ParsedQuery, drop: ReadonlySet<Relaxable> = new Set()): URLSearchParams {
  const q = new URLSearchParams();
  if (p.keywords && !drop.has('keywords')) q.set('q', p.keywords);
  if (!drop.has('type')) for (const v of p.type) q.append('type', v);
  for (const v of p.settlement) q.append('settlement', v);
  if (!drop.has('topic')) for (const v of p.topic) q.append('topic', v);
  if (p.yearFrom !== undefined) q.set('yearFrom', String(p.yearFrom));
  if (p.yearTo !== undefined) q.set('yearTo', String(p.yearTo));
  return q;
}

export interface AssistantOptions {
  db?: PrismaClient;
  embeddings?: EmbeddingProvider | null;
  aiTimeoutMs?: number;
}

export async function assistantRoutes(app: FastifyInstance, opts: AssistantOptions = {}): Promise<void> {
  const limiter = new LoginLimiter(30, 30);
  const repo = opts.db ? new CatalogRepository(opts.db) : null;

  /** Документы, похожие по смыслу на вопрос (только публичные); [] без модели или при её сбое. */
  async function semantic(question: string, lang: Locale, exclude: readonly string[]) {
    if (!opts.db || !repo || !opts.embeddings) return [];
    try {
      const hits = await semanticSearch(opts.db, opts.embeddings, question, { limit: 5, timeoutMs: opts.aiTimeoutMs ?? 4000 });
      if (!hits) return [];
      const rows = await repo.documentsByIds(hits.map((h) => h.id).filter((id) => !exclude.includes(id)), lang);
      return rows.map((r) => documentSummaryDto(r, lang)).map((d) => ({
        id: d.id, title: d.title, code: d.archiveCode.formatted, date: d.date, type: d.type.name,
        access: d.access, hasDigitalCopy: d.hasDigitalCopy, dataOrigin: d.dataOrigin,
      }));
    } catch (error) {
      app.log.warn({ error: String(error) }, 'assistant: semantic search failed, answering by rules only');
      return [];
    }
  }
  let dict: { at: number; entries: SettlementDictEntry[] } | null = null;

  /** Вызов публичного маршрута этого же API: те же правила доступа, что и у посетителя. */
  async function publicGet<T>(path: string): Promise<T> {
    const res = await app.inject({ method: 'GET', url: `/api/v1${path}`, headers: { 'x-archive-internal': 'assistant' } });
    if (res.statusCode !== 200) throw new Error(`assistant: ${path} → ${res.statusCode}`);
    return res.json<T>();
  }

  async function settlements(): Promise<SettlementDictEntry[]> {
    if (dict && Date.now() - dict.at < 5 * 60_000) return dict.entries;
    const bySlug = new Map<string, Set<string>>();
    for (const lang of ['kk', 'ru', 'en'] as const) {
      const r = await publicGet<{ items: Array<{ slug: string; name: string | null; historicalNames: Array<{ name: string }> }> }>(`/reference/settlements?lang=${lang}`);
      for (const s of r.items) {
        const names = bySlug.get(s.slug) ?? new Set([s.slug]);
        if (s.name) names.add(s.name);
        for (const h of s.historicalNames) names.add(h.name);
        bySlug.set(s.slug, names);
      }
    }
    dict = { at: Date.now(), entries: [...bySlug].map(([slug, names]) => ({ slug, names: [...names] })) };
    return dict.entries;
  }

  async function labels(p: ParsedQuery, lang: Locale) {
    const [types, places, topics] = await Promise.all([
      publicGet<{ items: Array<{ code: string } & Named> }>(`/reference/document-types?lang=${lang}`),
      publicGet<{ items: Array<{ slug: string } & Named> }>(`/reference/settlements?lang=${lang}`),
      publicGet<{ items: Array<{ slug: string } & Named> }>(`/reference/topics?kind=history_topic&lang=${lang}`),
    ]);
    return p.recognized.map((r) => {
      if (r.kind === 'years') return { kind: r.kind, yearFrom: r.yearFrom, yearTo: r.yearTo, text: r.text };
      const list: Array<{ key: string; name: string | null }> =
        r.kind === 'type' ? types.items.map((x) => ({ key: x.code, name: x.name })) : (r.kind === 'settlement' ? places.items : topics.items).map((x) => ({ key: x.slug, name: x.name }));
      return { kind: r.kind, value: r.value, label: list.find((x) => x.key === r.value)?.name ?? r.value, text: r.text };
    });
  }

  async function search(p: ParsedQuery, lang: Locale) {
    const dropped = new Set<Relaxable>();
    const attempt = async () => {
      const params = catalogParams(p, dropped);
      const r = await publicGet<{ items: Doc[]; total: number }>(`/catalog/documents?${params.toString()}&lang=${lang}&pageSize=5`);
      return { params, ...r };
    };
    let result = await attempt();
    // Если ничего не нашлось, по очереди снимаем самые узкие условия и честно сообщаем, какие.
    for (const f of FILTER_ORDER) {
      if (result.total > 0) break;
      const present = f === 'keywords' ? Boolean(p.keywords) : p[f].length > 0;
      if (!present) continue;
      // Последнее условие запроса не снимаем: иначе помощник покажет весь каталог как «ответ».
      const left = catalogParams(p, new Set([...dropped, f]));
      if ([...left.keys()].length === 0) break;
      dropped.add(f);
      result = await attempt();
    }
    const base = catalogParams(p);
    const suggestions: Array<{ reason: string; query: string }> = [];
    if (result.total > 0 && !result.params.has('hasDigitalCopy')) {
      const withCopy = new URLSearchParams(result.params);
      withCopy.set('hasDigitalCopy', 'true');
      suggestions.push({ reason: 'withCopy', query: withCopy.toString() });
    }
    if (p.yearFrom !== undefined && p.yearTo !== undefined && p.yearTo - p.yearFrom === 9 && p.yearFrom % 10 === 0) {
      for (const [reason, shift] of [['prevDecade', -10], ['nextDecade', 10]] as const) {
        const q = new URLSearchParams(result.params);
        q.set('yearFrom', String(p.yearFrom + shift));
        q.set('yearTo', String(p.yearTo + shift));
        suggestions.push({ reason, query: q.toString() });
      }
    }
    if (p.type.length > 0 && !dropped.has('type')) {
      const q = new URLSearchParams(result.params);
      q.delete('type');
      suggestions.push({ reason: 'allTypes', query: q.toString() });
    }
    return {
      total: result.total,
      catalogQuery: result.params.toString(),
      requestedQuery: base.toString(),
      dropped: [...dropped],
      documents: result.items.map((d) => ({
        id: d.id,
        title: d.title,
        code: d.archiveCode?.formatted ?? null,
        date: d.date,
        type: d.type.name,
        access: d.access,
        hasDigitalCopy: d.hasDigitalCopy,
        dataOrigin: d.dataOrigin,
      })),
      suggestions,
    };
  }

  async function branches(p: ParsedQuery, lang: Locale) {
    const q = new URLSearchParams({ lang });
    for (const s of p.settlement) q.append('settlement', s);
    let r = await publicGet<{ items: Branch[] }>(`/branches?${q.toString()}`);
    if (r.items.length === 0) r = await publicGet<{ items: Branch[] }>(`/branches?lang=${lang}`);
    const items = p.settlement.length > 0 ? r.items : r.items.filter((b) => b.type.code === 'main_archive' || b.type.code === 'site');
    return items.map((b) => ({ slug: b.slug, name: b.name ?? b.shortName, address: b.address, phone: b.phone, email: b.email, needsVerification: b.needsVerification }));
  }

  app.get('/assistant/ask', async (request, reply) => {
    const query = assistantAskSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    if (!limiter.take(request.ip, 'assistant')) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many questions, try again in a minute');
    reply.header('Cache-Control', 'no-store');

    // Сначала база знаний, которую ведут сотрудники; затем правила.
    const known = opts.db
      ? await findKnowledge(opts.db, query.q, lang).catch((error: unknown) => {
        app.log.warn({ error: String(error) }, 'assistant: knowledge base unavailable, answering by rules');
        return null;
      })
      : null;
    const parsed = parseQuery(query.q, await settlements());
    const intent: Intent = known ? { kind: 'unknown' } : classifyIntent(normalize(query.q), parsed);
    const kind = known ? 'knowledge' : intent.kind;
    const base = { intent: kind, lang };
    const answer = await (async () => {
      if (known) return { ...base, knowledge: { question: known.question, answer: known.answer, contentLang: known.contentLang }, links: known.links, found: 1 };
      switch (intent.kind) {
        case 'service_request':
          return { ...base, links: ['visitors', 'branches'], found: 1 };
        case 'term':
          return { ...base, term: intent.term, links: intent.links, found: 1 };
        case 'navigation':
          return { ...base, links: [intent.section], found: 1 };
        case 'branch': {
          const list = await branches(parsed, lang);
          return { ...base, recognized: await labels(parsed, lang), branches: list, links: ['branches'], found: list.length };
        }
        case 'search': {
          const found = await search(parsed, lang);
          const sem = await semantic(query.q, lang, found.documents.map((d) => d.id));
          return { ...base, recognized: await labels(parsed, lang), ...found, semantic: sem, found: found.total + sem.length };
        }
        case 'unknown': {
          const sem = await semantic(query.q, lang, []);
          return { ...base, links: ['catalog'], semantic: sem, found: sem.length };
        }
      }
    })();
    // Журнал качества ответов (F-127): без ответа (0) — кандидаты в базу знаний.
    const { found, ...body } = answer;
    await logSearchQuery(opts.db, request, { text: query.q, locale: lang, source: 'assistant', resultCount: found, filters: { intent: kind } });
    return body;
  });
}
