import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import Redis from "ioredis";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly logger: StructuredLoggerService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn(
        "redis.config_missing",
        {
          fallback: "in-process"
        },
        RedisService.name
      );
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
      this.logger.info(
        "redis.connected",
        {
          url: redisUrl
        },
        RedisService.name
      );
    } catch (error) {
      this.logger.warn(
        "redis.connection_failed",
        {
          fallback: "in-process",
          message: error instanceof Error ? error.message : String(error)
        },
        RedisService.name
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

  async setIfNotExists(key: string, value: string, ttlSeconds?: number) {
    if (!this.client) {
      return false;
    }

    if (ttlSeconds) {
      const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
      return result === "OK";
    }

    const result = await this.client.set(key, value, "NX");
    return result === "OK";
  }

  buildKey(...parts: string[]) {
    const prefix = process.env.REDIS_KEY_PREFIX?.trim() || "qrflow";
    return [prefix, ...parts].join(":");
  }
}
