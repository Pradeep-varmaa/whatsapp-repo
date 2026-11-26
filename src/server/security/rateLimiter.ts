export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  currentCount: number;
  limit: number;
}

const keyRequestTimestamps = new Map<string, number[]>();
const WINDOW_MS = 60 * 1000;

function evictStaleInMemoryKeys(now: number) {
  if (keyRequestTimestamps.size < 500) return;
  const cutoff = now - WINDOW_MS;
  for (const [k, list] of keyRequestTimestamps.entries()) {
    const fresh = list.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      keyRequestTimestamps.delete(k);
    } else {
      keyRequestTimestamps.set(k, fresh);
    }
  }
}

export class RateLimiter {
  /**
   * Synchronous sliding-window check (in-memory, preserves unit-test & sync callers).
   */
  static check(keyId: string, limitPerMinute = 60): RateLimitResult {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    evictStaleInMemoryKeys(now);

    let timestamps = keyRequestTimestamps.get(keyId) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= limitPerMinute) {
      const oldestInWindow = timestamps[0] || windowStart;
      const retryAfterMs = Math.max(1000, oldestInWindow + WINDOW_MS - now);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      keyRequestTimestamps.set(keyId, timestamps);
      return {
        allowed: false,
        retryAfterSeconds,
        currentCount: timestamps.length,
        limit: limitPerMinute,
      };
    }

    timestamps.push(now);
    keyRequestTimestamps.set(keyId, timestamps);

    return {
      allowed: true,
      retryAfterSeconds: 0,
      currentCount: timestamps.length,
      limit: limitPerMinute,
    };
  }

  /**
   * Distributed Redis-backed sliding-window check with automatic in-memory fallback.
   */
  static async checkAsync(keyId: string, limitPerMinute = 60): Promise<RateLimitResult> {
    try {
      const { getRedisConnection } = await import("../queues/queueManager");
      const redis = getRedisConnection();
      if (redis && redis.status === "ready") {
        const now = Date.now();
        const windowStart = now - WINDOW_MS;
        const redisKey = `ratelimit:${keyId}`;
        const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

        const multi = redis.multi();
        multi.zremrangebyscore(redisKey, 0, windowStart);
        multi.zcard(redisKey);
        multi.zadd(redisKey, String(now), member);
        multi.pexpire(redisKey, WINDOW_MS + 5000);
        const results = await multi.exec();

        const currentCount = Number(results?.[1]?.[1] ?? 0);
        if (currentCount >= limitPerMinute) {
          // Remove the speculative entry we just added
          await redis.zrem(redisKey, member).catch(() => {});
          const oldest = await redis.zrange(redisKey, "0", "0", "WITHSCORES").catch(() => []);
          const oldestTs = oldest && oldest.length >= 2 ? Number(oldest[1]) : windowStart;
          const retryAfterSeconds = Math.max(1, Math.ceil((oldestTs + WINDOW_MS - now) / 1000));
          return {
            allowed: false,
            retryAfterSeconds,
            currentCount,
            limit: limitPerMinute,
          };
        }

        return {
          allowed: true,
          retryAfterSeconds: 0,
          currentCount: currentCount + 1,
          limit: limitPerMinute,
        };
      }
    } catch {
      // Fallback to in-memory limiter if Redis is unavailable
    }

    return RateLimiter.check(keyId, limitPerMinute);
  }

  /**
   * Reset rate limit state (useful in tests)
   */
  static reset(keyId?: string) {
    if (keyId) {
      keyRequestTimestamps.delete(keyId);
    } else {
      keyRequestTimestamps.clear();
    }
  }
}
