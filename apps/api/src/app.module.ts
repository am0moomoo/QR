import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./modules/health/health.controller";
import { QrCodesController } from "./modules/qr-codes/qr-codes.controller";
import { ScanController } from "./modules/scan/scan.controller";
import { BillingController } from "./modules/billing/billing.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { PrismaService } from "./common/prisma.service";
import { RedisService } from "./common/redis.service";
import { ScanRateLimitService } from "./common/scan-rate-limit.service";
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
    PrismaService,
    RedisService,
    ScanRateLimitService,
    TelemetryService,
    SlugCacheService,
    StorageService,
    QrRenderService,
    AnalyticsService,
    AuthService,
    QrCodesService,
    ScanService
  ]
})
export class AppModule {}
