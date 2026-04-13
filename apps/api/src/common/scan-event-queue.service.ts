import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy
} from "@nestjs/common";
import { Queue, QueueEvents, Worker } from "bullmq";
import { ScanOutcome } from "@prisma/client";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { AggregateQueueService } from "./aggregate-queue.service";
import { AnalyticsService } from "./analytics.service";
import { RedisService } from "./redis.service";
import { StructuredLoggerService } from "./structured-logger.service";

type ScanEventJobData = {
  awaitAggregate: boolean;
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

type QueueRole = "both" | "producer" | "worker";

@Injectable()
export class ScanEventQueueService implements OnModuleDestroy {
  private readonly queueRole: QueueRole;
  private baseConnection: IORedis | null = null;
  private queue: Queue<ScanEventJobData> | null = null;
  private queueEvents: QueueEvents | null = null;
  private worker: Worker<ScanEventJobData> | null = null;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly aggregates: AggregateQueueService,
    private readonly redis: RedisService,
    private readonly logger: StructuredLoggerService
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

  async recordScanEvent(input: Omit<ScanEventJobData, "requestId" | "scannedAt"> & {
    awaitAggregate?: boolean;
    requestId: string | null;
    scannedAt: Date;
  }) {
    const payload: ScanEventJobData = {
      ...input,
      awaitAggregate: input.awaitAggregate ?? false,
      requestId: input.requestId ?? randomUUID(),
      scannedAt: input.scannedAt.toISOString()
    };

    if (!(await this.ensureBullMq())) {
      await this.analytics.recordRawScanEvent({
        ...payload,
        scannedAt: new Date(payload.scannedAt)
      });
      await this.aggregates.queueDailyAggregate(
        payload.qrCodeId,
        new Date(payload.scannedAt),
        {
          waitForCompletion: payload.awaitAggregate
        }
      );
      return payload.requestId;
    }

    if (!this.canProduce()) {
      throw new InternalServerErrorException(
        "Scan-event queue producer is disabled for this process."
      );
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
          await this.analytics.recordRawScanEvent({
            ...job.data,
            scannedAt: new Date(job.data.scannedAt)
          });
          await this.aggregates.queueDailyAggregate(
            job.data.qrCodeId,
            new Date(job.data.scannedAt),
            {
              waitForCompletion: job.data.awaitAggregate
            }
          );

          return {
            requestId: job.data.requestId
          };
        },
        {
          connection: this.baseConnection.duplicate()
        }
      );

      await this.worker.waitUntilReady();
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
    }

    this.logger.info(
      "scan_event.queue_ready",
      {
        queueName: this.getQueueName(),
        role: this.queueRole
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
}
