import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/prisma.service";
import { RedisService } from "../../common/redis.service";
import { StorageService } from "../../common/storage.service";
import { getRuntimeSummary } from "../../runtime-config";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService
  ) {}

  @Get()
  async getHealth() {
    let database = "down";

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = "up";
    } catch {
      database = "down";
    }

    return {
      dependencies: {
        database,
        redis: this.redis.isReady() ? "up" : "degraded",
        storage: this.storage.getDriver()
      },
      ok: true,
      runtime: getRuntimeSummary(),
      service: "api",
      timestamp: new Date().toISOString()
    };
  }
}
