import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn("REDIS_URL is not configured; Redis-backed features will use fallback paths.");
      return;
    }

    const client = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });

    try {
      await client.connect();
      this.client = client;
      this.logger.log("Connected to Redis");
    } catch (error) {
      this.logger.warn(
        `Redis connection failed; falling back to in-process cache. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      client.disconnect(false);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  isReady() {
    return this.client?.status === "ready";
  }

  async get(key: string) {
    return this.client?.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (!this.client) {
      return;
    }

    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
      return;
    }

    await this.client.set(key, value);
  }

  async del(key: string) {
    await this.client?.del(key);
  }

  async incr(key: string) {
    if (!this.client) {
      return null;
    }

    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number) {
    await this.client?.expire(key, ttlSeconds);
  }

  buildKey(...parts: string[]) {
    const prefix = process.env.REDIS_KEY_PREFIX?.trim() || "qrflow";
    return [prefix, ...parts].join(":");
  }
}
