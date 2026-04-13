import {
  Injectable,
  OnModuleDestroy
} from "@nestjs/common";
import { Queue, QueueEvents, Worker } from "bullmq";
import { ScanOutcome } from "@prisma/client";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { AnalyticsService } from "./analytics.service";
import { RedisService } from "./redis.service";
import { StructuredLoggerService } from "./structured-logger.service";

type ScanEventJobData = {
  browser: string | null;
  country: string | null;
  deviceType: string | null;
  ipHash: string | null;
  language: string | null;
  openedOk: boolean | null;
  os: string | null;
  outcome: ScanOutcome;
  qrCodeId: string;
  redirectRuleId?: string;
  referrer: string | null;
  requestId: string | null;
  scannedAt: string;
  userAgent: string | null;
};

@Injectable()
export class ScanEventQueueService implements OnModuleDestroy {
  private baseConnection: IORedis | null = null;
  private queue: Queue<ScanEventJobData> | null = null;
  private queueEvents: QueueEvents | null = null;
  private worker: Worker<ScanEventJobData> | null = null;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly redis: RedisService,
    private readonly logger: StructuredLoggerService
  ) {}

  async onModuleDestroy() {
    await Promise.all([
      this.worker?.close(),
      this.queueEvents?.close(),
      this.queue?.close(),
      this.baseConnection?.quit()
    ]);
  }

  async recordScanEvent(input: Omit<ScanEventJobData, "requestId" | "scannedAt"> & {
    requestId: string | null;
    scannedAt: Date;
  }) {
    const payload: ScanEventJobData = {
      ...input,
      requestId: input.requestId ?? randomUUID(),
      scannedAt: input.scannedAt.toISOString()
    };

    if (!(await this.ensureBullMq())) {
      await this.analytics.recordScanEvent({
        ...payload,
        scannedAt: new Date(payload.scannedAt)
      });
      return payload.requestId;
    }

    const jobId = payload.requestId!;
    const existingJob = await this.queue!.getJob(jobId);

    if (existingJob) {
      await existingJob.waitUntilFinished(this.queueEvents!, 30_000);
      return jobId;
    }

    const job = await this.queue!.add("scan-event", payload, {
      attempts: 5,
      backoff: {
        delay: 500,
        type: "exponential"
      },
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 1000
    });

    await job.waitUntilFinished(this.queueEvents!, 30_000);
    return jobId;
  }

  private async ensureBullMq() {
    if (this.queue && this.worker && this.queueEvents) {
      return true;
    }

    if (!this.shouldUseBullMq()) {
      return false;
    }

    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return false;
    }

    this.baseConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    });
    const workerConnection = this.baseConnection.duplicate();
    const eventsConnection = this.baseConnection.duplicate();
    const queueName = this.getQueueName();

    this.queue = new Queue(queueName, {
      connection: this.baseConnection
    });
    this.queueEvents = new QueueEvents(queueName, {
      connection: eventsConnection
    });
    this.worker = new Worker(
      queueName,
      async (job) => {
        await this.analytics.recordScanEvent({
          ...job.data,
          scannedAt: new Date(job.data.scannedAt)
        });

        return {
          requestId: job.data.requestId
        };
      },
      {
        connection: workerConnection
      }
    );

    this.worker.on("failed", (job, error) => {
      this.logger.error(
        "scan_event.job_failed",
        error,
        {
          jobId: job?.id ?? null,
          qrCodeId: job?.data.qrCodeId ?? null,
          requestId: job?.data.requestId ?? null
        },
        ScanEventQueueService.name
      );
    });

    this.logger.info(
      "scan_event.queue_ready",
      {
        queueName
      },
      ScanEventQueueService.name
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
    const prefix = process.env.QUEUE_PREFIX?.trim() || "qrflow";
    return `${prefix}:scan-events`;
  }
}
