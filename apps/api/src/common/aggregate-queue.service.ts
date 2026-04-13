import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy
} from "@nestjs/common";
import { Queue, QueueEvents, Worker } from "bullmq";
import { createHash } from "node:crypto";
import IORedis from "ioredis";
import { AnalyticsService } from "./analytics.service";
import { StructuredLoggerService } from "./structured-logger.service";

type AggregateJobData = {
  day: string;
  qrCodeId: string;
};

type QueueRole = "both" | "producer" | "worker";

@Injectable()
export class AggregateQueueService implements OnModuleDestroy {
  private readonly queueRole: QueueRole;
  private baseConnection: IORedis | null = null;
  private queue: Queue<AggregateJobData> | null = null;
  private queueEvents: QueueEvents | null = null;
  private worker: Worker<AggregateJobData> | null = null;

  constructor(
    private readonly analytics: AnalyticsService,
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

  async queueDailyAggregate(
    qrCodeId: string,
    scannedAt: Date,
    options: { waitForCompletion?: boolean } = {}
  ) {
    const day = new Date(scannedAt);
    day.setUTCHours(0, 0, 0, 0);

    if (!(await this.ensureBullMq())) {
      await this.analytics.recomputeDailyAggregate(qrCodeId, day);
      return;
    }

    if (!this.canProduce()) {
      throw new InternalServerErrorException(
        "Aggregate queue producer is disabled for this process."
      );
    }

    const jobId = this.buildJobId(qrCodeId, day);
    const existingJob = await this.queue!.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (
        (state === "active" || state === "waiting" || state === "delayed")
      ) {
        if (options.waitForCompletion) {
          await existingJob.waitUntilFinished(this.queueEvents!, 30_000);
        }

        return;
      }

      if (state === "completed" || state === "failed") {
        await existingJob.remove();
      }
    }

    const job = await this.queue!.add(
      "aggregate-daily",
      {
        day: day.toISOString(),
        qrCodeId
      },
      {
        attempts: 5,
        backoff: {
          delay: 500,
          type: "exponential"
        },
        jobId,
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    );

    if (options.waitForCompletion) {
      await job.waitUntilFinished(this.queueEvents!, 30_000);
    }
  }

  private async ensureBullMq() {
    if (!this.shouldUseBullMq()) {
      return false;
    }

    if (!this.baseConnection) {
      const redisUrl = process.env.REDIS_URL;

      if (!redisUrl) {
        return false;
      }

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
          await this.analytics.recomputeDailyAggregate(
            job.data.qrCodeId,
            new Date(job.data.day)
          );
          return {
            day: job.data.day,
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
          "aggregate.job_failed",
          error,
          {
            day: job?.data.day ?? null,
            jobId: job?.id ?? null,
            qrCodeId: job?.data.qrCodeId ?? null
          },
          AggregateQueueService.name
        );
      });
    }

    if (this.canConsume() || this.canProduce()) {
      this.logger.info(
        "aggregate.queue_ready",
        {
          queueName: this.getQueueName(),
          role: this.queueRole
        },
        AggregateQueueService.name
      );
    }

    return true;
  }

  private shouldUseBullMq() {
    const queueDriver = (process.env.QUEUE_DRIVER ?? "auto").trim().toLowerCase();
    return queueDriver === "bullmq";
  }

  private getQueueName() {
    const prefix = process.env.QUEUE_PREFIX?.trim() || "qrflow";
    return `${prefix}:scan-aggregates`;
  }

  private buildJobId(qrCodeId: string, day: Date) {
    return createHash("sha256")
      .update(`${qrCodeId}:${day.toISOString().slice(0, 10)}`)
      .digest("hex");
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
