import { Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

@Injectable()
export class SlugCacheService<T = unknown> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly ttlMs = 300_000;

  constructor(private readonly redis: RedisService) {}

  async get(key: string) {
    const entry = this.entries.get(key);

    if (entry) {
      if (entry.expiresAt < Date.now()) {
        this.entries.delete(key);
      } else {
        return entry.value;
      }
    }

    const redisKey = this.redis.buildKey("scan", "slug", key);
    const redisValue = await this.redis.get(redisKey);

    if (redisValue) {
      return JSON.parse(redisValue) as T;
    }
    
    return null;
  }

  async set(key: string, value: T) {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });

    await this.redis.set(
      this.redis.buildKey("scan", "slug", key),
      JSON.stringify(value, (_property, currentValue) =>
        typeof currentValue === "bigint" ? currentValue.toString() : currentValue
      ),
      Math.floor(this.ttlMs / 1000)
    );
  }

  async delete(key: string) {
    this.entries.delete(key);
    await this.redis.del(this.redis.buildKey("scan", "slug", key));
  }
}
