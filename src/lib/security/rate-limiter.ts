import { TooManyRequestsError } from "@/lib/errors/app-error";

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  remaining: number;
  resetTimeMs: number;
}

interface WindowRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, WindowRecord>();

// Clean up stale entries periodically
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupStaleEntries(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;

  rateLimitStore.forEach((record, key) => {
    const validTimestamps = record.timestamps.filter((ts: number) => now - ts < windowMs);
    if (validTimestamps.length === 0) {
      rateLimitStore.delete(key);
    } else {
      record.timestamps = validTimestamps;
    }
  });
}

/**
 * Checks a rate limit key against a sliding time window.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { windowMs: 60_000, maxRequests: 10 }
): RateLimitResult {
  const now = Date.now();
  cleanupStaleEntries(options.windowMs);

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Filter out timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((ts: number) => now - ts < options.windowMs);

  const currentCount = record.timestamps.length;
  const allowed = currentCount < options.maxRequests;

  if (allowed) {
    record.timestamps.push(now);
  }

  const oldestTimestamp = record.timestamps[0] || now;
  const resetTimeMs = Math.max(0, options.windowMs - (now - oldestTimestamp));

  return {
    allowed,
    currentCount: allowed ? currentCount + 1 : currentCount,
    remaining: Math.max(0, options.maxRequests - (allowed ? currentCount + 1 : currentCount)),
    resetTimeMs,
  };
}

/**
 * Enforces rate limit and throws TooManyRequestsError if exceeded.
 */
export function enforceRateLimit(
  key: string,
  options: RateLimitOptions = { windowMs: 60_000, maxRequests: 5 },
  customMessage?: string
): void {
  const result = checkRateLimit(key, options);
  if (!result.allowed) {
    const seconds = Math.ceil(result.resetTimeMs / 1000);
    throw new TooManyRequestsError(
      customMessage || `Too many attempts. Please try again in ${seconds} seconds.`
    );
  }
}

/**
 * Resets/clears the rate limit for a key (e.g. after successful login).
 */
export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Resets entire in-memory rate limit store (useful for testing).
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
