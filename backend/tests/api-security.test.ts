import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { buildApp, type AppOptions } from '../src/app.ts';
import { loadEnv } from '../src/config/env.ts';
import { LocalStorage } from '../src/infrastructure/storage/local-storage.ts';
import { testDb } from './helpers.ts';

/** S-011: заголовки безопасности и доверие X-Forwarded-For только за своим прокси. */
const db = testDb();
const apps: FastifyInstance[] = [];
async function appWith(opts: Partial<AppOptions> = {}): Promise<FastifyInstance> {
  const app = await buildApp({ db, storage: new LocalStorage(inject('testStorageDir')), logLevel: 'silent', ...opts });
  apps.push(app);
  return app;
}
afterAll(async () => {
  for (const app of apps) await app.close();
  await db.$disconnect();
});

describe('заголовки безопасности', () => {
  it('JSON-ответ: nosniff, запрет встраивания, строгая CSP, политика Referrer; без HTTPS нет HSTS', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/api/v1/branches' });
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cross-origin-resource-policy': 'same-origin',
      'cross-origin-opener-policy': 'same-origin',
    });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('ошибки тоже с заголовками; за HTTPS (secureCookies) добавляется HSTS', async () => {
    const app = await appWith({ secureCookies: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/catalog/documents/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});

describe('TRUST_PROXY', () => {
  const bot = { topic: 'site', lang: 'ru', message: '[тест] ловушка для бота', website: 'spam' };
  const send = (app: FastifyInstance, i: number) =>
    app.inject({ method: 'POST', url: '/api/v1/feedback', payload: bot, remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': `203.0.113.${i}` } });

  it('по умолчанию X-Forwarded-For не учитывается: подмена адреса не обходит ограничение частоты', async () => {
    const app = await appWith();
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i++) statuses.push((await send(app, i)).statusCode);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it('за своим прокси (loopback) адрес клиента берётся из X-Forwarded-For', async () => {
    const app = await appWith({ trustProxy: 'loopback' });
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i++) statuses.push((await send(app, i)).statusCode);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 202]);
    // Один и тот же клиент за прокси ограничивается как обычно.
    for (let i = 0; i < 4; i++) await send(app, 1);
    expect((await send(app, 1)).statusCode).toBe(429);
  });

  it('разбор переменной окружения', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };
    expect(loadEnv(base).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8' }).TRUST_PROXY).toBe('loopback, 10.0.0.0/8');
  });
});
