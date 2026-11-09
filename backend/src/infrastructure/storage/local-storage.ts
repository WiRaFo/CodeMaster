import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Хранилище файлов (docs/architecture.md §6). Интерфейс общий для локальной папки и MinIO;
 * в прототипе используется локальная папка STORAGE_DIR, адаптер S3/MinIO подключается без изменения маршрутов.
 */
export interface ObjectStorage {
  read(bucket: string, key: string): Promise<Buffer | null>;
  write(bucket: string, key: string, data: Buffer | string): Promise<void>;
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Файлы лежат в <root>/<bucket>/<key>. Ключ из БД проверяется: выход за пределы корня невозможен. */
export class LocalStorage implements ObjectStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathOf(bucket: string, key: string): string {
    const segments = [bucket, ...key.split('/')];
    if (segments.some((s) => !SAFE_SEGMENT.test(s) || s === '.' || s === '..')) {
      throw new Error(`Недопустимый ключ хранилища: ${bucket}/${key}`);
    }
    const path = resolve(this.root, ...segments);
    if (!path.startsWith(this.root + sep)) throw new Error('Путь вне хранилища');
    return path;
  }

  async read(bucket: string, key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(bucket, key));
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(bucket: string, key: string, data: Buffer | string): Promise<void> {
    const path = this.pathOf(bucket, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
}
