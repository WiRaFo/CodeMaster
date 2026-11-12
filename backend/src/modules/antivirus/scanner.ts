import { connect } from 'node:net';
import type { Env } from '../../config/env.ts';

/**
 * Проверка загруженных файлов антивирусом (ТЗ §7.3, S-013). Подключается настройкой ANTIVIRUS_PROVIDER
 * и не обязательна: без неё файлы остаются «ожидают проверки» и на сайт не попадают, потому что публичные
 * представления пропускают только antivirus_status = clean. ClamAV работает на сервере архива (clamd),
 * файлы наружу не уходят.
 */
export type ScanVerdict = { status: 'clean' } | { status: 'infected'; signature: string };

export interface VirusScanner {
  readonly name: string;
  scan(data: Buffer): Promise<ScanVerdict>;
}

const CHUNK = 64 * 1024;

/**
 * Клиент clamd по протоколу INSTREAM: файл передаётся кусками «длина (4 байта, big-endian) + данные»,
 * в конце — нулевая длина. Ответ «stream: OK» или «stream: <сигнатура> FOUND». Любой другой ответ,
 * обрыв или превышение времени — ошибка: файл остаётся непроверенным, а не считается чистым.
 */
export class ClamdScanner implements VirusScanner {
  readonly name: string;

  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs: number) {
    this.name = `clamd ${host}:${port}`;
  }

  scan(data: Buffer): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const replies: Buffer[] = [];
      let settled = false;
      const finish = (error: Error | null, verdict?: ScanVerdict) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error || !verdict) reject(error ?? new Error('clamd: no verdict'));
        else resolve(verdict);
      };
      socket.setTimeout(this.timeoutMs, () => finish(new Error('clamd: timeout')));
      socket.on('error', (error) => finish(error));
      socket.on('data', (chunk) => replies.push(chunk));
      socket.on('end', () => {
        const reply = Buffer.concat(replies).toString('utf8').replace(/\0/g, '').trim();
        if (reply === 'stream: OK') return finish(null, { status: 'clean' });
        const found = /^stream: (.+) FOUND$/.exec(reply);
        if (found?.[1]) return finish(null, { status: 'infected', signature: found[1] });
        finish(new Error(`clamd: unexpected reply «${reply.slice(0, 200)}»`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < data.length; offset += CHUNK) {
          const part = data.subarray(offset, offset + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length);
          socket.write(size);
          socket.write(part);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

export function createVirusScanner(env: Pick<Env, 'ANTIVIRUS_PROVIDER' | 'CLAMD_HOST' | 'CLAMD_PORT' | 'ANTIVIRUS_TIMEOUT_MS'>): VirusScanner | null {
  switch (env.ANTIVIRUS_PROVIDER) {
    case 'clamd':
      return new ClamdScanner(env.CLAMD_HOST, env.CLAMD_PORT, env.ANTIVIRUS_TIMEOUT_MS);
    case 'none':
      return null;
  }
}
