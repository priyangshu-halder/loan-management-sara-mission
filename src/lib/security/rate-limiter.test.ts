import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  enforceRateLimit,
  clearRateLimit,
  resetRateLimitStore,
} from "./rate-limiter";
import { TooManyRequestsError } from "@/lib/errors/app-error";

describe("Rate Limiter Security Module", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests under the rate limit threshold", () => {
    const key = "test-ip-1";
    const options = { windowMs: 1000, maxRequests: 3 };

    const r1 = checkRateLimit(key, options);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, options);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, options);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("rejects requests exceeding the max limit within window", () => {
    const key = "test-ip-2";
    const options = { windowMs: 1000, maxRequests: 2 };

    checkRateLimit(key, options);
    checkRateLimit(key, options);

    const r3 = checkRateLimit(key, options);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("throws TooManyRequestsError when enforceRateLimit threshold is exceeded", () => {
    const key = "test-ip-3";
    const options = { windowMs: 1000, maxRequests: 2 };

    enforceRateLimit(key, options);
    enforceRateLimit(key, options);

    expect(() => enforceRateLimit(key, options)).toThrow(TooManyRequestsError);
  });

  it("resets rate limit upon clearRateLimit", () => {
    const key = "test-ip-4";
    const options = { windowMs: 1000, maxRequests: 1 };

    enforceRateLimit(key, options);
    expect(() => enforceRateLimit(key, options)).toThrow(TooManyRequestsError);

    clearRateLimit(key);
    expect(() => enforceRateLimit(key, options)).not.toThrow();
  });
});

