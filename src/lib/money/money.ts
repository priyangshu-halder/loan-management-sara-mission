import Decimal from "decimal.js";

// Configure Decimal.js precision and rounding rules centrally
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 29,
});

export const DEFAULT_CURRENCY = "INR";
export const DECIMAL_SCALE = 4; // Storage precision DECIMAL(19, 4)
export const DISPLAY_SCALE = 2; // UI presentation precision

export type MoneyInput = Decimal | string | number;

/**
 * Ensures a value is safely parsed into a Decimal without floating point corruption.
 * Rejects NaN, Infinity, and invalid string formats.
 */
export function toDecimal(value: MoneyInput): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Cannot convert non-finite number ${value} to Decimal`);
    }
    return new Decimal(value.toString());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || Number.isNaN(Number(trimmed))) {
      throw new TypeError(`Invalid decimal string: "${value}"`);
    }
    return new Decimal(trimmed);
  }
  throw new TypeError(`Unsupported type for Decimal conversion: ${typeof value}`);
}

/**
 * Money representation ensuring zero floating-point arithmetic.
 */
export class Money {
  readonly amount: Decimal;
  readonly currency: string;

  constructor(amount: MoneyInput, currency = DEFAULT_CURRENCY) {
    this.amount = toDecimal(amount);
    this.currency = currency.toUpperCase();
  }

  static zero(currency = DEFAULT_CURRENCY): Money {
    return new Money(new Decimal(0), currency);
  }

  static from(amount: MoneyInput, currency = DEFAULT_CURRENCY): Money {
    return new Money(amount, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`
      );
    }
  }

  plus(other: Money | MoneyInput): Money {
    if (other instanceof Money) {
      this.assertSameCurrency(other);
      return new Money(this.amount.plus(other.amount), this.currency);
    }
    return new Money(this.amount.plus(toDecimal(other)), this.currency);
  }

  minus(other: Money | MoneyInput): Money {
    if (other instanceof Money) {
      this.assertSameCurrency(other);
      return new Money(this.amount.minus(other.amount), this.currency);
    }
    return new Money(this.amount.minus(toDecimal(other)), this.currency);
  }

  times(factor: MoneyInput): Money {
    return new Money(this.amount.times(toDecimal(factor)), this.currency);
  }

  dividedBy(divisor: MoneyInput): Money {
    const dec = toDecimal(divisor);
    if (dec.isZero()) {
      throw new RangeError("Division by zero in money calculation");
    }
    return new Money(this.amount.dividedBy(dec), this.currency);
  }

  round(decimalPlaces = DECIMAL_SCALE, roundingMode = Decimal.ROUND_HALF_UP): Money {
    return new Money(
      this.amount.toDecimalPlaces(decimalPlaces, roundingMode),
      this.currency
    );
  }

  toStorageString(): string {
    return this.amount.toFixed(DECIMAL_SCALE);
  }

  toDisplayString(includeSymbol = true): string {
    const formatted = this.amount.toFixed(DISPLAY_SCALE);
    if (!includeSymbol) {
      return formatted;
    }
    if (this.currency === "INR") {
      return `₹${formatted}`;
    }
    return `${this.currency} ${formatted}`;
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  greaterThanOrEqualTo(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThanOrEqualTo(other.amount);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThan(other.amount);
  }

  lessThanOrEqualTo(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThanOrEqualTo(other.amount);
  }
}

