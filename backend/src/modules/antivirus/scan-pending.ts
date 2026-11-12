import type { PrismaClient } from '@prisma/client';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import type { VirusScanner } from './scanner.ts';

export interface ScanReport {
  clean: number;
  infected: number;
  /** Не проверены: файла нет в хранилище или антивирус не ответил. Останутся в очереди. */
  failed: number;
}

/**
 * Проверяет файлы, ожидающие антивируса, и ставит результат. Заражённый файл помечается infected и закрывается
 * (access_level = closed): на сайт он не попадёт, а сотрудник увидит статус в панели. Если антивирус недоступен,
 * файл остаётся pending — молча «чистым» он не становится. Каждый результат пишется в журнал от имени системы.
 */
export async function scanPendingAssets(
  db: PrismaClient, storage: ObjectStorage, scanner: VirusScanner,
  { limit = 50, ids }: { limit?: number; /** Только эти файлы (разовая проверка выбранных). */ ids?: readonly string[] } = {},
): Promise<ScanReport> {
  const pending = await db.digitalAsset.findMany({
    where: { antivirusStatus: 'pending', deletedAt: null, ...(ids ? { id: { in: [...ids] } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, storageBucket: true, storageKey: true, originalFilename: true },
  });
  const report: ScanReport = { clean: 0, infected: 0, failed: 0 };
  for (const asset of pending) {
    const data = await storage.read(asset.storageBucket, asset.storageKey);
    if (!data) {
      report.failed += 1;
      continue;
    }
    let verdict;
    try {
      verdict = await scanner.scan(data);
    } catch {
      report.failed += 1;
      continue;
    }
    await db.$transaction(async (tx) => {
      // Условие на pending: если файл успели удалить или проверить параллельно, результат не перезаписывается.
      const updated = await tx.digitalAsset.updateMany({
        where: { id: asset.id, antivirusStatus: 'pending' },
        data: verdict.status === 'clean' ? { antivirusStatus: 'clean' } : { antivirusStatus: 'infected', accessLevel: 'closed' },
      });
      if (updated.count === 0) return;
      await tx.auditLog.create({
        data: {
          action: 'antivirus_scan', entityType: 'digital_asset', entityId: asset.id,
          summary: verdict.status === 'clean'
            ? `Файл «${asset.originalFilename}» проверен антивирусом: угроз нет`
            : `Файл «${asset.originalFilename}» заражён (${verdict.signature}) и закрыт`,
          changes: { scanner: scanner.name, status: verdict.status, ...(verdict.status === 'infected' ? { signature: verdict.signature } : {}) },
        },
      });
    });
    report[verdict.status] += 1;
  }
  return report;
}
