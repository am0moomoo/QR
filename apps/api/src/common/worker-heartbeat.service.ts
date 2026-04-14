import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import {
  getAppRole,
  getQueueDriver,
  getQueueRole,
  getWorkerHealthPath
} from "../runtime-config";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private readonly startedAt = new Date().toISOString();

  constructor(private readonly logger: StructuredLoggerService) {}

  async onModuleInit() {
    if (!this.shouldWriteHeartbeat()) {
      return;
    }

    await this.writeHeartbeat();
    this.interval = setInterval(() => {
      void this.writeHeartbeat();
    }, 10_000);

    this.logger.info(
      "worker.heartbeat_started",
      {
        path: getWorkerHealthPath()
      },
      WorkerHeartbeatService.name
    );
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private shouldWriteHeartbeat() {
    const appRole = getAppRole();
    const queueDriver = getQueueDriver();
    const queueRole = getQueueRole();

    return (
      appRole === "worker" &&
      queueDriver === "bullmq" &&
      (queueRole === "worker" || queueRole === "both")
    );
  }

  private async writeHeartbeat() {
    const healthPath = getWorkerHealthPath();
    await mkdir(path.dirname(healthPath), { recursive: true });
    await writeFile(
      healthPath,
      JSON.stringify(
        {
          appRole: getAppRole(),
          pid: process.pid,
          queueDriver: getQueueDriver(),
          queueRole: getQueueRole(),
          startedAt: this.startedAt,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );
  }
}
