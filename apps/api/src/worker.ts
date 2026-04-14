import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { StructuredLoggerService } from "./common/structured-logger.service";
import {
  getNestLoggerLevels,
  getRuntimeSummary,
  getRuntimeWarnings
} from "./runtime-config";

async function bootstrapWorker() {
  process.env.QUEUE_DRIVER = process.env.QUEUE_DRIVER ?? "bullmq";
  // Worker processes consume queue jobs and may enqueue follow-up aggregate jobs.
  process.env.QUEUE_ROLE = process.env.QUEUE_ROLE ?? "both";
  process.env.APP_ROLE = process.env.APP_ROLE ?? "worker";

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: getNestLoggerLevels()
  });
  app.get(StructuredLoggerService).info(
    "worker.bootstrapped",
    getRuntimeSummary(),
    "bootstrap"
  );
  for (const warning of getRuntimeWarnings()) {
    app.get(StructuredLoggerService).warn(
      "worker.runtime_warning",
      {
        warning
      },
      "bootstrap"
    );
  }
}

bootstrapWorker().catch((error) => {
  console.error("Worker bootstrap failed", error);
  process.exit(1);
});
