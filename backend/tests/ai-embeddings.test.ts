import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.ts';
import { OllamaEmbeddings, createEmbeddingProvider, toPgVector } from '../src/modules/ai/embeddings.ts';

/**
 * Клиент Ollama против поддельного сервера с тем же протоколом (POST /api/embed).
 * Настоящая модель в тестовой среде не запускается: здесь проверяется формат запроса и обработка сбоев.
 */
let server: Server;
let base = '';
let mode: 'ok' | 'malformed' | 'error' | 'slow' = 'ok';
const received: unknown[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', () => {
      received.push({ url: req.url, method: req.method, body: JSON.parse(body) as unknown });
      if (mode === 'error') { res.writeHead(500).end(); return; }
      if (mode === 'slow') { setTimeout(() => res.writeHead(200).end('{"embeddings":[[1]]}'), 500); return; }
      const input = (JSON.parse(body) as { input: string[] }).input;
      const embeddings = mode === 'malformed' ? [['x']] : input.map((_, i) => [i, 0.5, 1]);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ embeddings }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('OllamaEmbeddings', () => {
  it('отправляет модель и тексты одним запросом, возвращает векторы в том же порядке', async () => {
    mode = 'ok';
    const vectors = await new OllamaEmbeddings(base, 'bge-m3').embed(['первый', 'второй']);
    expect(vectors).toEqual([[0, 0.5, 1], [1, 0.5, 1]]);
    expect(received.at(-1)).toEqual({ url: '/api/embed', method: 'POST', body: { model: 'bge-m3', input: ['первый', 'второй'] } });
  });

  it('ошибка сервера и неверный ответ — исключение (поиск тогда откатывается к обычному)', async () => {
    mode = 'error';
    await expect(new OllamaEmbeddings(base, 'bge-m3').embed(['а'])).rejects.toThrow('Ollama 500');
    mode = 'malformed';
    await expect(new OllamaEmbeddings(base, 'bge-m3').embed(['а'])).rejects.toThrow('malformed');
  });

  it('медленный ответ прерывается по сигналу', async () => {
    mode = 'slow';
    await expect(new OllamaEmbeddings(base, 'bge-m3').embed(['а'], AbortSignal.timeout(50))).rejects.toThrow();
  });
});

describe('настройка', () => {
  it('по умолчанию модель выключена; ollama включается переменной окружения', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x@localhost/db' });
    expect(env.AI_PROVIDER).toBe('none');
    expect(createEmbeddingProvider(env)).toBeNull();
    const on = loadEnv({ DATABASE_URL: 'postgresql://x@localhost/db', AI_PROVIDER: 'ollama', AI_EMBED_MODEL: 'bge-m3' });
    expect(createEmbeddingProvider(on)?.model).toBe('bge-m3');
  });

  it('вектор для pgvector', () => {
    expect(toPgVector([0.1, -2, 3])).toBe('[0.1,-2,3]');
  });
});
