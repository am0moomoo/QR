import { Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service";

type MemoryCounter = {
  count: number;
  expiresAt: number;
};

@Injectable()
export class ScanRateLimitService {
  private readonly memoryCounters = new Map<string, MemoryCounter>();

  constructor(private readonly redis: RedisService) {}

  async check(ipAddress: string, slug: string) {
    const windowSeconds = Number(process.env.SCAN_RATE_LIMIT_WINDOW_SECONDS ?? "60");
    const maxRequests = Number(process.env.SCAN_RATE_LIMIT_MAX_REQUESTS ?? "120");
    const key = `${ipAddress}:${slug}`;

    if (this.redis.isReady()) {
      const redisKey = this.redis.buildKey("scan", "rate", key);
      const count = await this.redis.incr(redisKey);

      if (count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
      }

      return {
        allowed: (count ?? 0) <= maxRequests,
        current: count ?? 0,
        limit: maxRequests,
        retryAfterSeconds: windowSeconds
      };
    }

    const current = this.memoryCounters.get(key);
    const now = Date.now();

    if (!current || current.expiresAt < now) {
      this.memoryCounters.set(key, {
        count: 1,
        expiresAt: now + windowSeconds * 1000
      });

      return {
        allowed: true,
        current: 1,
        limit: maxRequests,
        retryAfterSeconds: windowSeconds
      };
    }

    current.count += 1;

    return {
      allowed: current.count <= maxRequests,
      current: current.count,
      limit: maxRequests,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
    };
  }
}
