import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy
} from "@nestjs/common";
import { Queue, QueueEvents, Worker } from "bullmq";
import type { ExportFormat } from "@qr/types";
import { createHash } from "node:crypto";
import IORedis from "ioredis";
import {
  QrAssetPipelineService,
  type QrCodeRecord
} from "./qr-asset-pipeline.service";
import { RedisService } from "./redis.service";
import { StructuredLoggerService } from "./structured-logger.service";

type RenderJobData = {
  qrCodeId: string;
  requestedFormats: ExportFormat[];
};

type QueueRole = "both" | "producer" | "worker";

@Injectable()
export class RenderQueueService implements OnModuleDestroy {
  private readonly inlineLocks = new Set<string>();
  private readonly queueRole: QueueRole;
  private baseConnection: IORedis | null = null;
  private queue: Queue<RenderJobData> | null = null;
  private queueEvents: QueueEvents | null = null;
  private worker: Worker<RenderJobData> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly logger: StructuredLoggerService,
    private readonly pipeline: QrAssetPipelineService
  ) {
    this.queueRole = this.getQueueRole();
  }

  async onModuleDestroy() {
    await Promise.all([
      this.worker?.close(),
      this.queueEvents?.close(),
      this.queue?.close(),
      this.baseConnection?.quit()
    ]);
  }

  async warmup() {
    if (!this.shouldUseBullMq()) {
      return;
    }

    await this.ensureBullMq();
  }

  async render(
    qrCodeId: string,
    requestedFormats: ExportFormat[],
    versionToken: string
  ): Promise<QrCodeRecord> {
    const formats = this.pipeline.getSupportedExportFormats(requestedFormats);
    const jobId = this.buildJobId(qrCodeId, versionToken, formats);

    if (!(await this.ensureBullMq())) {
      return this.runInline(qrCodeId, formats, jobId);
    }

    if (!this.canProduce()) {
      throw new InternalServerErrorException(
        "Render queue producer is disabled for this process."
      );
    }

    const existingJob = await this.queue!.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === "completed") {
        return this.pipeline.waitForFormats(qrCodeId, formats);
      }

      if (state === "active" || state === "waiting" || state === "delayed") {
        await existingJob.waitUntilFinished(this.queueEvents!, 45_000);
        return this.pipeline.waitForFormats(qrCodeId, formats);
      }

      if (state === "failed") {
        await existingJob.remove();
      }
    }

    const job = await this.queue!.add(
      "render",
      {
        qrCodeId,
        requestedFormats: formats
      },
      {
        attempts: 3,
        backoff: {
          delay: 1_000,
          type: "exponential"
        },
        jobId,
        removeOnComplete: 100,
        removeOnFail: 100
      }
    );

    await job.waitUntilFinished(this.queueEvents!, 45_000);
    return this.pipeline.waitForFormats(qrCodeId, formats);
  }

  private async runInline(
    qrCodeId: string,
    requestedFormats: ExportFormat[],
    jobId: string
  ) {
    const acquired = await this.acquireLock(jobId);

    if (!acquired) {
      return this.pipeline.waitForFormats(qrCodeId, requestedFormats);
    }

    try {
      return await this.pipeline.renderAndSync(qrCodeId, requestedFormats);
    } finally {
      await this.releaseLock(jobId);
    }
  }

  private async ensureBullMq() {
    if (this.queue && this.queueEvents && (!this.canConsume() || this.worker)) {
      return true;
    }

    if (!this.shouldUseBullMq()) {
      return false;
    }

    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return false;
    }

    if (!this.baseConnection) {
      this.baseConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null
      });
    }

    if (!this.queue && this.canProduce()) {
      this.queue = new Queue(this.getQueueName(), {
        connection: this.baseConnection
      });
      this.queueEvents = new QueueEvents(this.getQueueName(), {
        connection: this.baseConnection.duplicate()
      });
      await this.queue.waitUntilReady();
      await this.queueEvents.waitUntilReady();
    }

    if (!this.worker && this.canConsume()) {
      this.worker = new Worker(
        this.getQueueName(),
        async (job) => {
          await this.runInline(
            job.data.qrCodeId,
            job.data.requestedFormats,
            job.id ??
              this.buildJobId(
                job.data.qrCodeId,
                "worker",
                job.data.requestedFormats
              )
          );

          return {
            qrCodeId: job.data.qrCodeId
          };
        },
        {
          connection: this.baseConnection.duplicate()
        }
      );

      await this.worker.waitUntilReady();
      this.worker.on("failed", (job, error) => {
        this.logger.error(
          "render.job_failed",
          error,
          {
            jobId: job?.id ?? null,
            qrCodeId: job?.data.qrCodeId ?? null
          },
          RenderQueueService.name
        );
      });
    }

    this.logger.info(
      "render.queue_ready",
      {
        queueName: this.getQueueName(),
        role: this.queueRole
      },
      RenderQueueService.name
    );

    return true;
  }

  private shouldUseBullMq() {
    const queueDriver = (process.env.QUEUE_DRIVER ?? "auto").trim().toLowerCase();

    if (queueDriver === "inline") {
      return false;
    }

    if (queueDriver === "bullmq") {
      return true;
    }

    return this.redis.isReady();
  }

  private getQueueName() {
    const prefix = (process.env.QUEUE_PREFIX?.trim() || "qrflow").replace(
      /[:\s]+/g,
      "-"
    );
    return `${prefix}-qr-render`;
  }

  private getQueueRole(): QueueRole {
    const value = (process.env.QUEUE_ROLE ?? "both").trim().toLowerCase();

    if (value === "worker" || value === "producer" || value === "both") {
      return value;
    }

    return "both";
  }

  private canProduce() {
    return this.queueRole === "both" || this.queueRole === "producer";
  }

  private canConsume() {
    return this.queueRole === "both" || this.queueRole === "worker";
  }

  private buildJobId(
    qrCodeId: string,
    versionToken: string,
    requestedFormats: ExportFormat[]
  ) {
    return createHash("sha256")
      .update(`${qrCodeId}:${versionToken}:${requestedFormats.slice().sort().join(",")}`)
      .digest("hex");
  }

  private async acquireLock(lockId: string) {
    const key = this.redis.buildKey("render-lock", lockId);
    const acquired = await this.redis.setIfNotExists(key, "1", 30);

    if (acquired) {
      return true;
    }

    if (this.redis.isReady()) {
      return false;
    }

    if (this.inlineLocks.has(lockId)) {
      return false;
    }

    this.inlineLocks.add(lockId);
    return true;
  }

  private async releaseLock(lockId: string) {
    const key = this.redis.buildKey("render-lock", lockId);
    await this.redis.del(key);
    this.inlineLocks.delete(lockId);
  }
}
