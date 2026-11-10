import type { Env } from '../../config/env.ts';

/**
 * Модель эмбеддингов для смыслового поиска (D-023). Подключается настройкой AI_PROVIDER и не обязательна:
 * без неё (или когда она не отвечает) сайт работает на обычном полнотекстовом поиске.
 * Чтобы сменить модель или сервер, достаточно добавить реализацию этого интерфейса.
 */
export interface EmbeddingProvider {
  /** Имя модели: векторы разных моделей несравнимы и хранятся раздельно. */
  readonly model: string;
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
}

/** Ответ Ollama на POST /api/embed. */
interface OllamaEmbedResponse { embeddings?: unknown }

const isVector = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Локальный сервер Ollama (https://ollama.com): модель работает на сервере архива, тексты наружу не уходят. */
export class OllamaEmbeddings implements EmbeddingProvider {
  constructor(private readonly baseUrl: string, readonly model: string) {}

  async embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(new URL('/api/embed', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const body = (await res.json()) as OllamaEmbedResponse;
    const list = Array.isArray(body.embeddings) ? body.embeddings : [];
    if (list.length !== texts.length || !list.every(isVector)) throw new Error('Ollama returned malformed embeddings');
    return list;
  }
}

export function createEmbeddingProvider(env: Pick<Env, 'AI_PROVIDER' | 'AI_BASE_URL' | 'AI_EMBED_MODEL'>): EmbeddingProvider | null {
  switch (env.AI_PROVIDER) {
    case 'ollama':
      return new OllamaEmbeddings(env.AI_BASE_URL, env.AI_EMBED_MODEL);
    case 'none':
      return null;
  }
}

/** Вектор в текстовом виде pgvector: '[0.1,0.2,…]'. Значения — только числа, поэтому безопасно передавать параметром. */
export const toPgVector = (v: readonly number[]): string => `[${v.join(',')}]`;
