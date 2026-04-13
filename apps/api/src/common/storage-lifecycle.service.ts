import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class StorageLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly logger: StructuredLoggerService
  ) {}

  async findOrphanedQrObjects(prefix = "qr/") {
    const [storedObjects, dbAssets] = await Promise.all([
      this.storage.listObjects(prefix),
      this.prisma.qRAsset.findMany({
        select: {
          storageKey: true
        },
        where: {
          storageKey: {
            startsWith: prefix
          }
        }
      })
    ]);

    const referencedKeys = new Set(dbAssets.map((asset) => asset.storageKey));

    return storedObjects.filter((object) => !referencedKeys.has(object.key));
  }

  async cleanupOrphanedQrObjects(options: { dryRun?: boolean; prefix?: string } = {}) {
    const prefix = options.prefix ?? "qr/";
    const orphanedObjects = await this.findOrphanedQrObjects(prefix);

    if (!options.dryRun && orphanedObjects.length > 0) {
      await this.storage.deleteObjects(orphanedObjects.map((object) => object.key));
    }

    this.logger.info(
      "storage.orphan_cleanup_completed",
      {
        deleted: options.dryRun ? 0 : orphanedObjects.length,
        dryRun: options.dryRun ?? false,
        orphanedCount: orphanedObjects.length,
        prefix
      },
      StorageLifecycleService.name
    );

    return {
      deleted: options.dryRun ? [] : orphanedObjects.map((object) => object.key),
      orphaned: orphanedObjects.map((object) => object.key)
    };
  }
}
