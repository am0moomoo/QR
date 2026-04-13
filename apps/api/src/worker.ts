import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrapWorker() {
  process.env.QUEUE_DRIVER = process.env.QUEUE_DRIVER ?? "bullmq";
  // Worker processes consume queue jobs and may enqueue follow-up aggregate jobs.
  process.env.QUEUE_ROLE = process.env.QUEUE_ROLE ?? "both";

  await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "log", "warn", "debug"]
  });
}

bootstrapWorker().catch((error) => {
  console.error("Worker bootstrap failed", error);
  process.exit(1);
});
