import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { loadEnv } from '../src/config/env.ts';
import { LocalStorage } from '../src/infrastructure/storage/local-storage.ts';
import { scanPendingAssets } from '../src/modules/antivirus/scan-pending.ts';
import { ClamdScanner, createVirusScanner, type VirusScanner } from '../src/modules/antivirus/scanner.ts';
import { testDb } from './helpers.ts';

/**
 * Антивирус (S-013): клиент clamd против поддельной службы с тем же протоколом INSTREAM и фоновая проверка очереди.
 * Настоящий ClamAV в тестовой среде не запускается: здесь проверяются протокол, вердикты и обработка сбоев.
 */
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
let server: Server;
let port = 0;
let mode: 'ok' | 'garbage' | 'silent' = 'ok';
const commands: string[] = [];
const sockets = new Set<Socket>();

/** Разбор INSTREAM: команда, затем куски «длина + данные» до нулевой длины. */
function fakeClamd(socket: Socket) {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  let buffer = Buffer.alloc(0);
  let command: string | null = null;
  const data: Buffer[] = [];
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (command === null) {
      const end = buffer.indexOf(0);
      if (end < 0) return;
      command = buffer.subarray(0, end).toString();
      commands.push(command);
      buffer = buffer.subarray(end + 1);
    }
    while (buffer.length >= 4) {
      const size = buffer.readUInt32BE(0);
      if (size === 0) {
        if (mode === 'silent') return;
        const body = Buffer.concat(data).toString('latin1');
        const reply = mode === 'garbage' ? 'UNKNOWN COMMAND' : body.includes('EICAR-STANDARD') ? 'stream: Eicar-Test-Signature FOUND' : 'stream: OK';
        socket.end(`${reply}\0`);
        return;
      }
      if (buffer.length < 4 + size) return;
      data.push(buffer.subarray(4, 4 + size));
      buffer = buffer.subarray(4 + size);
    }
  });
}

beforeAll(async () => {
  // Как настоящий clamd: после конца данных от клиента соединение остаётся открытым до ответа.
  server = createServer({ allowHalfOpen: true }, fakeClamd);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  // Полуоткрытые соединения (режим «молчит») сервер сам не закрывает.
  for (const socket of sockets) socket.destroy();
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('клиент clamd', () => {
  it('чистый файл (в том числе больше одного куска) — clean, EICAR — infected с сигнатурой', async () => {
    mode = 'ok';
    const scanner = new ClamdScanner('127.0.0.1', port, 2000);
    expect(await scanner.scan(Buffer.alloc(200_000, 7))).toEqual({ status: 'clean' });
    expect(await scanner.scan(Buffer.from(EICAR))).toEqual({ status: 'infected', signature: 'Eicar-Test-Signature' });
    expect(commands.at(-1)).toBe('zINSTREAM');
  });

  it('непонятный ответ, молчание и недоступная служба — ошибка, а не «чисто»', async () => {
    mode = 'garbage';
    await expect(new ClamdScanner('127.0.0.1', port, 2000).scan(Buffer.from('x'))).rejects.toThrow(/unexpected reply/);
    mode = 'silent';
    await expect(new ClamdScanner('127.0.0.1', port, 300).scan(Buffer.from('x'))).rejects.toThrow(/timeout/);
    await expect(new ClamdScanner('127.0.0.1', 1, 2000).scan(Buffer.from('x'))).rejects.toThrow();
  });

  it('по умолчанию антивирус выключен; clamd включается настройкой', () => {
    expect(createVirusScanner(loadEnv({ DATABASE_URL: 'postgresql://x/y' }))).toBeNull();
    expect(createVirusScanner(loadEnv({ DATABASE_URL: 'postgresql://x/y', ANTIVIRUS_PROVIDER: 'clamd', CLAMD_PORT: '3310' }))?.name).toBe('clamd 127.0.0.1:3310');
  });
});

describe('фоновая проверка очереди', () => {
  const db = testDb();
  const storage = new LocalStorage(inject('testStorageDir'));
  const ids: string[] = [];
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { entityType: 'digital_asset', entityId: { in: ids } } });
    await db.digitalAsset.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  async function pendingAsset(content: string | null) {
    const key = `antivirus-test/${randomUUID()}.png`;
    if (content !== null) await storage.write('archive-masters', key, content);
    const asset = await db.digitalAsset.create({
      data: {
        kind: 'image', storageBucket: 'archive-masters', storageKey: key, originalFilename: 'test.png', mimeType: 'image/png',
        sizeBytes: BigInt(content?.length ?? 0), sha256: 'x', accessLevel: 'open', processingStatus: 'ready', antivirusStatus: 'pending', dataOrigin: 'synthetic',
      },
    });
    ids.push(asset.id);
    return asset.id;
  }
  const state = (id: string) => db.digitalAsset.findUniqueOrThrow({ where: { id }, select: { antivirusStatus: true, accessLevel: true } });

  it('чистый файл открывается для сайта, заражённый закрывается; без файла или при сбое — остаётся в очереди', async () => {
    mode = 'ok';
    const clean = await pendingAsset('обычное изображение');
    const infected = await pendingAsset(EICAR);
    const missing = await pendingAsset(null);
    // Только свои файлы: параллельные тесты загрузки ждут, что их файлы остаются непроверенными.
    const report = await scanPendingAssets(db, storage, new ClamdScanner('127.0.0.1', port, 2000), { ids: [clean, infected, missing] });
    expect(report).toEqual({ clean: 1, infected: 1, failed: 1 });
    expect(await state(clean)).toEqual({ antivirusStatus: 'clean', accessLevel: 'open' });
    expect(await state(infected)).toEqual({ antivirusStatus: 'infected', accessLevel: 'closed' });
    expect(await state(missing)).toEqual({ antivirusStatus: 'pending', accessLevel: 'open' });
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityType: 'digital_asset', entityId: infected } });
    expect(audit).toMatchObject({ action: 'antivirus_scan', userId: null });
    expect(audit.summary).toContain('Eicar-Test-Signature');

    const broken: VirusScanner = { name: 'broken', scan: () => Promise.reject(new Error('down')) };
    const waiting = await pendingAsset('ещё один файл');
    expect(await scanPendingAssets(db, storage, broken, { ids: [waiting] })).toEqual({ clean: 0, infected: 0, failed: 1 });
    expect(await state(waiting)).toEqual({ antivirusStatus: 'pending', accessLevel: 'open' });
  });
});
