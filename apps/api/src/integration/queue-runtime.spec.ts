import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import test = require("node:test");
import {
  RequestMethod,
  type INestApplication,
  type INestApplicationContext,
  ValidationPipe
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ScanOutcome } from "@prisma/client";
import request = require("supertest");
import { AppModule } from "../app.module";
import { AggregateQueueService } from "../common/aggregate-queue.service";
import { AnalyticsService } from "../common/analytics.service";
import { PrismaService } from "../common/prisma.service";
import { QrAssetPipelineService } from "../common/qr-asset-pipeline.service";
import { RedisService } from "../common/redis.service";
import { ScanEventQueueService } from "../common/scan-event-queue.service";

let app: INestApplication | null = null;
let workerContext: INestApplicationContext | null = null;
let prisma: PrismaService | null = null;
let redis: RedisService | null = null;
let integrationReady = false;

const requireLiveServices =
  process.env.CI === "true" ||
  process.env.REQUIRE_INTEGRATION_DB === "true";

process.env.NODE_ENV = "test";
process.env.QUEUE_DRIVER = "bullmq";
process.env.SCAN_WRITE_SYNC = "true";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_ROOT = "./storage/test-queue-runtime";

const storageRoot = path.resolve(
  process.cwd(),
  process.env.STORAGE_LOCAL_ROOT ?? "./storage/test-queue-runtime"
);

test.before(async () => {
  await fs.rm(storageRoot, { force: true, recursive: true });

  if (!process.env.DATABASE_URL) {
    if (requireLiveServices) {
      throw new Error(
        "DATABASE_URL must be configured when queue runtime verification is required."
      );
    }

    return;
  }

  if (!process.env.REDIS_URL) {
    if (requireLiveServices) {
      throw new Error(
        "REDIS_URL must be configured when queue runtime verification is required."
      );
    }

    return;
  }

  process.env.QUEUE_ROLE = "producer";
  const producerModuleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  app = producerModuleRef.createNestApplication();
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { method: RequestMethod.GET, path: "r/:slug" },
      { method: RequestMethod.POST, path: "r/:slug/password" },
      { method: RequestMethod.GET, path: "inactive" },
      { method: RequestMethod.GET, path: "landing/:slug" }
    ]
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );
  await app.init();

  prisma = app.get(PrismaService);
  redis = app.get(RedisService);

  try {
    await prisma!.$queryRaw`SELECT 1`;
  } catch (error) {
    if (requireLiveServices) {
      throw new Error(
        `Queue runtime database is required but unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return;
  }

  if (!redis!.isReady()) {
    if (requireLiveServices) {
      throw new Error("Queue runtime Redis is required but unavailable.");
    }

    return;
  }

  process.env.QUEUE_ROLE = "both";
  workerContext = await NestFactory.createApplicationContext(AppModule, {
    logger: false
  });

  integrationReady = true;
});

test.after(async () => {
  if (workerContext) {
    await workerContext.close();
  }

  if (app) {
    await app.close();
  }
});

async function ensureIntegrationReady(t: test.TestContext) {
  if (!integrationReady || !app || !workerContext || !prisma) {
    if (requireLiveServices) {
      throw new Error(
        "Queue runtime verification is required but the app contexts are not ready."
      );
    }

    t.skip("Queue runtime dependencies are not available in this environment");
    return false;
  }

  return true;
}

test("queue runtime: BullMQ render, scan-event, and aggregate jobs retry and stay idempotent", async (t) => {
  if (!(await ensureIntegrationReady(t))) {
    return;
  }

  let stage = "bootstrap";
  const setStage = (nextStage: string) => {
    stage = nextStage;
    console.log(`[queue-runtime][stage=${stage}]`);
  };
  const server = app!.getHttpServer();
  const workerPipeline = workerContext!.get(QrAssetPipelineService);
  const workerAnalytics = workerContext!.get(AnalyticsService);
  const producerScanEvents = app!.get(ScanEventQueueService);
  const producerAggregates = app!.get(AggregateQueueService);

  const suffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
  const email = `queue-runtime-${suffix}@example.com`;
  const password = "StrongPass123!";
  let renderFailures = 0;
  const originalRenderAndSync = workerPipeline.renderAndSync.bind(workerPipeline);
  workerPipeline.renderAndSync = (async (...args: Parameters<QrAssetPipelineService["renderAndSync"]>) => {
    renderFailures += 1;

    if (renderFailures === 1) {
      throw new Error("render failed once for retry verification");
    }

    return originalRenderAndSync(...args);
  }) as QrAssetPipelineService["renderAndSync"];

  try {
    setStage("register");
    const registration = await request(server)
      .post("/api/v1/auth/register")
      .send({
        email,
        fullName: "Queue Runtime Owner",
        password
      })
      .expect(201);

    setStage("load-workspace");
    const workspace = await prisma!.workspace.findFirstOrThrow({
      where: {
        ownerUserId: registration.body.user.id
      }
    });

    const bearerToken = registration.body.accessToken as string;
    setStage("create-qr");
    const createQr = await request(server)
      .post("/api/v1/qr-codes")
      .set("Authorization", `Bearer ${bearerToken}`)
      .send({
        content: {
          link: "https://example.com/queue-runtime"
        },
        design: {
          backgroundColor: "#ffffff",
          cornersInner: "square",
          cornersInnerColor: "#111111",
          cornersOuter: "square",
          cornersOuterColor: "#111111",
          errorCorrection: "M",
          logoAssetId: null,
          logoHideBg: true,
          pattern: "square",
          patternColor: "#111111",
          quietZoneModules: 4,
          sizePx: 512
        },
        exports: ["png", "svg"],
        settings: {
          adsEnabled: true,
          doNotIndex: false,
          expiresAt: null,
          isOneTime: false,
          maxScans: null,
          password: null
        },
        title: "Queue runtime QR",
        type: "link",
        workspaceId: workspace.id
      })
      .expect(201);

    setStage("assert-render-retry");
    assert.ok(
      renderFailures >= 2,
      `Render job should retry after one worker failure. Saw renderFailures=${renderFailures}.`
    );

    setStage("rerender-concurrent");
    await Promise.all([
      request(server)
        .post(`/api/v1/qr-codes/${createQr.body.id}/render`)
        .set("Authorization", `Bearer ${bearerToken}`)
        .expect(200),
      request(server)
        .post(`/api/v1/qr-codes/${createQr.body.id}/render`)
        .set("Authorization", `Bearer ${bearerToken}`)
        .expect(200)
    ]);

    setStage("assert-render-assets");
    const qrAssets = await prisma!.qRAsset.findMany({
      where: {
        kind: "QR_IMAGE",
        qrCodeId: createQr.body.id
      }
    });
    assert.equal(qrAssets.length, 2, `Expected exactly two QR assets, saw ${qrAssets.length}.`);
    assert.equal(
      new Set(qrAssets.map((asset) => asset.storageKey)).size,
      2,
      "Expected PNG and SVG assets to keep distinct storage keys."
    );

    let rawFailures = 0;
    let aggregateFailures = 0;
    const originalRecordRawScanEvent =
      workerAnalytics.recordRawScanEvent.bind(workerAnalytics);
    const originalRecomputeDailyAggregate =
      workerAnalytics.recomputeDailyAggregate.bind(workerAnalytics);

    workerAnalytics.recordRawScanEvent = (async (...args: Parameters<AnalyticsService["recordRawScanEvent"]>) => {
      rawFailures += 1;

      if (rawFailures === 1) {
        throw new Error("raw scan event failed once for retry verification");
      }

      return originalRecordRawScanEvent(...args);
    }) as AnalyticsService["recordRawScanEvent"];

    workerAnalytics.recomputeDailyAggregate = (async (...args: Parameters<AnalyticsService["recomputeDailyAggregate"]>) => {
      aggregateFailures += 1;

      if (aggregateFailures === 1) {
        throw new Error("aggregate failed once for retry verification");
      }

      return originalRecomputeDailyAggregate(...args);
    }) as AnalyticsService["recomputeDailyAggregate"];

    const requestId = `queue-runtime-${suffix}`;
    const scannedAt = new Date();

    setStage("queue-scan-event");
    await producerScanEvents.recordScanEvent({
      awaitAggregate: true,
      browser: "chrome",
      country: "US",
      deviceType: "desktop",
      ipHash: "queue-runtime-ip",
      language: "en",
      openedOk: true,
      os: "windows",
      outcome: ScanOutcome.REDIRECTED,
      qrCodeId: createQr.body.id,
      referrer: "https://example.com/referrer",
      requestId,
      scannedAt,
      userAgent: "Queue Runtime Browser"
    });

    setStage("assert-scan-retries");
    assert.ok(
      rawFailures >= 2,
      `Scan-event job should retry after one worker failure. Saw rawFailures=${rawFailures}.`
    );
    assert.ok(
      aggregateFailures >= 2,
      `Aggregate job should retry after one worker failure. Saw aggregateFailures=${aggregateFailures}.`
    );

    setStage("assert-scan-event-persisted");
    const rawEvents = await prisma!.scanEvent.findMany({
      where: {
        qrCodeId: createQr.body.id,
        requestId
      }
    });
    assert.equal(rawEvents.length, 1, `Expected one raw scan event, saw ${rawEvents.length}.`);

    setStage("assert-first-aggregate");
    const firstAggregate = await prisma!.scanAggregateDaily.findFirstOrThrow({
      where: {
        qrCodeId: createQr.body.id
      }
    });
    assert.equal(firstAggregate.scans, 1, `Expected first aggregate scans=1, saw ${firstAggregate.scans}.`);
    assert.equal(
      firstAggregate.uniqueIps,
      1,
      `Expected first aggregate uniqueIps=1, saw ${firstAggregate.uniqueIps}.`
    );

    setStage("queue-duplicate-scan-event");
    await producerScanEvents.recordScanEvent({
      awaitAggregate: true,
      browser: "chrome",
      country: "US",
      deviceType: "desktop",
      ipHash: "queue-runtime-ip",
      language: "en",
      openedOk: true,
      os: "windows",
      outcome: ScanOutcome.REDIRECTED,
      qrCodeId: createQr.body.id,
      referrer: "https://example.com/referrer",
      requestId,
      scannedAt,
      userAgent: "Queue Runtime Browser"
    });

    setStage("assert-deduped-scan-event");
    const dedupedEvents = await prisma!.scanEvent.findMany({
      where: {
        qrCodeId: createQr.body.id,
        requestId
      }
    });
    assert.equal(
      dedupedEvents.length,
      1,
      `Expected duplicate requestId to remain deduped at one row, saw ${dedupedEvents.length}.`
    );

    setStage("insert-second-raw-event");
    await prisma!.scanEvent.create({
      data: {
        browser: "firefox",
        country: "DE",
        deviceType: "desktop",
        ipHash: "queue-runtime-ip-2",
        language: "de",
        openedOk: true,
        os: "linux",
        outcome: ScanOutcome.REDIRECTED,
        qrCodeId: createQr.body.id,
        requestId: `${requestId}-second`,
        scannedAt
      }
    });

    let directAggregateFailures = 0;
    workerAnalytics.recomputeDailyAggregate = (async (...args: Parameters<AnalyticsService["recomputeDailyAggregate"]>) => {
      directAggregateFailures += 1;

      if (directAggregateFailures === 1) {
        throw new Error("direct aggregate failed once for retry verification");
      }

      return originalRecomputeDailyAggregate(...args);
    }) as AnalyticsService["recomputeDailyAggregate"];

    setStage("queue-direct-aggregate");
    await producerAggregates.queueDailyAggregate(createQr.body.id, scannedAt, {
      waitForCompletion: true
    });

    setStage("assert-direct-aggregate-retries");
    assert.ok(
      directAggregateFailures >= 2,
      `Direct aggregate job should retry after one worker failure. Saw directAggregateFailures=${directAggregateFailures}.`
    );

    setStage("assert-final-aggregate");
    const finalAggregate = await prisma!.scanAggregateDaily.findFirstOrThrow({
      where: {
        qrCodeId: createQr.body.id
      }
    });
    assert.equal(finalAggregate.scans, 2, `Expected final aggregate scans=2, saw ${finalAggregate.scans}.`);
    assert.equal(
      finalAggregate.uniqueIps,
      2,
      `Expected final aggregate uniqueIps=2, saw ${finalAggregate.uniqueIps}.`
    );
  } catch (error) {
    console.error(`[queue-runtime][stage=${stage}]`, error);
    throw error;
  }
});
