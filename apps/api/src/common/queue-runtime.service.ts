import { Injectable, OnModuleInit } from "@nestjs/common";
import { AggregateQueueService } from "./aggregate-queue.service";
import { RenderQueueService } from "./render-queue.service";
import { ScanEventQueueService } from "./scan-event-queue.service";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class QueueRuntimeService implements OnModuleInit {
  constructor(
    private readonly aggregates: AggregateQueueService,
    private readonly renderQueue: RenderQueueService,
    private readonly scanEvents: ScanEventQueueService,
    private readonly logger: StructuredLoggerService
  ) {}

  async onModuleInit() {
    const queueDriver = (process.env.QUEUE_DRIVER ?? "auto").trim().toLowerCase();
    const queueRole = (process.env.QUEUE_ROLE ?? "both").trim().toLowerCase();

    if (queueDriver !== "bullmq" || (queueRole !== "worker" && queueRole !== "both")) {
      return;
    }

    await Promise.all([
      this.renderQueue.warmup(),
      this.scanEvents.warmup(),
      this.aggregates.warmup()
    ]);

    this.logger.info(
      "queue.runtime_warmed",
      {
        queueDriver,
        queueRole
      },
      QueueRuntimeService.name
    );
  }
}
