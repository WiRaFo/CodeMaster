import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ObjectStorage } from '../infrastructure/storage/local-storage.ts';
import { notFound } from './errors.ts';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export type PublicFile = { storage_bucket: string; storage_key: string; mime_type: string; asset_id: string } | undefined;

/**
 * Отдаёт изображение из публичного представления (public_*_v); нет записи или файла — 404, как у несуществующего.
 * Файл показывается браузером, но не может выполнить скрипт: строгая CSP и sandbox.
 */
export async function sendPublicImage(storage: ObjectStorage, request: FastifyRequest, reply: FastifyReply, file: PublicFile) {
  if (!file || !IMAGE_TYPES.has(file.mime_type)) throw notFound();
  const body = await storage.read(file.storage_bucket, file.storage_key);
  if (!body) {
    request.log.warn({ assetId: file.asset_id }, 'public image is missing in storage');
    throw notFound();
  }
  return reply
    .header('Content-Type', file.mime_type)
    .header('Content-Disposition', 'inline')
    .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
    .header('Cache-Control', 'public, max-age=300')
    .send(body);
}
