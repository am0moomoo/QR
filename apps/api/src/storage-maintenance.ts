import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { StorageLifecycleService } from "./common/storage-lifecycle.service";

function getFlag(name: string) {
  return process.argv.includes(name);
}

function getOption(name: string) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

async function main() {
  const dryRun = getFlag("--dry-run");
  const prefix = getOption("--prefix") ?? "qr/";
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "log", "warn"]
  });

  try {
    const storageLifecycle = app.get(StorageLifecycleService);
    const result = await storageLifecycle.cleanupOrphanedQrObjects({
      dryRun,
      prefix
    });

    console.log(
      JSON.stringify(
        {
          deletedCount: result.deleted.length,
          deletedKeys: result.deleted,
          dryRun,
          orphanedCount: result.orphaned.length,
          orphanedKeys: result.orphaned,
          prefix
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("Storage maintenance failed", error);
  process.exit(1);
});
