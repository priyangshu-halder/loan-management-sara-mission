import { describe, it, expect } from "vitest";
import { Money, toDecimal } from "./money";
import Decimal from "decimal.js";

describe("Money utility", () => {
  it("avoids binary floating point inaccuracies (0.1 + 0.2)", () => {
    const a = Money.from("0.1");
    const b = Money.from("0.2");
    const sum = a.plus(b);
    expect(sum.amount.toString()).toBe("0.3");
  });

  it("handles basic arithmetic correctly", () => {
    const principal = Money.from("10000.0000");
    const interest = Money.from("1250.5000");
    const total = principal.plus(interest);
    expect(total.toStorageString()).toBe("11250.5000");

    const payment = Money.from("5000.2500");
    const balance = total.minus(payment);
    expect(balance.toStorageString()).toBe("6250.2500");
  });

  it("handles multiplication and division", () => {
    const amount = Money.from("100.0000");
    const doubled = amount.times(2);
    expect(doubled.toStorageString()).toBe("200.0000");

    const divided = amount.dividedBy(3).round(4);
    expect(divided.toStorageString()).toBe("33.3333");
  });

  it("throws on division by zero", () => {
    const amount = Money.from("500");
    expect(() => amount.dividedBy(0)).toThrow(RangeError);
  });

  it("formats display strings with INR symbol", () => {
    const amount = Money.from("1234.5678");
    expect(amount.toDisplayString()).toBe("₹1234.57");
    expect(amount.toDisplayString(false)).toBe("1234.57");
  });

  it("enforces currency matching", () => {
    const inr = Money.from(100, "INR");
    const usd = Money.from(100, "USD");
    expect(() => inr.plus(usd)).toThrow(/Currency mismatch/);
  });

  it("correctly compares money amounts", () => {
    const a = Money.from("100.50");
    const b = Money.from("100.49");
    const c = Money.from("100.50");

    expect(a.greaterThan(b)).toBe(true);
    expect(b.lessThan(a)).toBe(true);
    expect(a.equals(c)).toBe(true);
  });
});

