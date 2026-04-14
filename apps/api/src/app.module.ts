import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AggregateQueueService } from "./common/aggregate-queue.service";
import { HealthController } from "./modules/health/health.controller";
import { QrCodesController } from "./modules/qr-codes/qr-codes.controller";
import { ScanController } from "./modules/scan/scan.controller";
import { BillingController } from "./modules/billing/billing.controller";
import { BillingService } from "./modules/billing/billing.service";
import { AuthController } from "./modules/auth/auth.controller";
import { PrismaService } from "./common/prisma.service";
import { QrAssetPipelineService } from "./common/qr-asset-pipeline.service";
import { QueueRuntimeService } from "./common/queue-runtime.service";
import { RedisService } from "./common/redis.service";
import { RenderQueueService } from "./common/render-queue.service";
import { ScanEventQueueService } from "./common/scan-event-queue.service";
import { ScanRateLimitService } from "./common/scan-rate-limit.service";
import { StructuredLoggerService } from "./common/structured-logger.service";
import { StorageLifecycleService } from "./common/storage-lifecycle.service";
import { TelemetryService } from "./common/telemetry.service";
import { SlugCacheService } from "./common/slug-cache.service";
import { StorageService } from "./common/storage.service";
import { QrRenderService } from "./common/qr-render.service";
import { AnalyticsService } from "./common/analytics.service";
import { AuthService } from "./modules/auth/auth.service";
import { QrCodesService } from "./modules/qr-codes/qr-codes.service";
import { ScanService } from "./modules/scan/scan.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    })
  ],
  controllers: [
    AuthController,
    HealthController,
    QrCodesController,
    ScanController,
    BillingController
  ],
  providers: [
    StructuredLoggerService,
    PrismaService,
    RedisService,
    ScanRateLimitService,
    TelemetryService,
    SlugCacheService,
    StorageService,
    StorageLifecycleService,
    QrRenderService,
    QrAssetPipelineService,
    AnalyticsService,
    AggregateQueueService,
    RenderQueueService,
    ScanEventQueueService,
    QueueRuntimeService,
    BillingService,
    AuthService,
    QrCodesService,
    ScanService
  ]
})
export class AppModule {}
