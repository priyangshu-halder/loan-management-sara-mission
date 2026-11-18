import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateRepaymentSchedule,
  addMonthsClamped,
} from "./loan-schedule-engine";

describe("Loan Schedule Engine", () => {
  it("calculates flat interest schedule with exact principal reconciliation", () => {
    const result = calculateRepaymentSchedule({
      principal: "120000.0000",
      annualRate: "12.0000", // 12% per annum
      termMonths: 12,
      interestMethod: "FLAT",
      disbursementDate: "2026-10-25",
    });

    // Flat interest: 120,000 * 12% * 1 = 14,400
    expect(result.installments.length).toBe(12);
    expect(result.totalInterest.toFixed(4)).toBe("14400.0000");
    expect(result.totalRepayment.toFixed(4)).toBe("134400.0000");

    // Sum of all installments must match total principal exactly
    let sumPrincipal = new Decimal(0);
    let sumInterest = new Decimal(0);

    for (const inst of result.installments) {
      sumPrincipal = sumPrincipal.plus(inst.principalDue);
      sumInterest = sumInterest.plus(inst.interestDue);
      expect(inst.totalDue.equals(inst.principalDue.plus(inst.interestDue))).toBe(true);
    }

    expect(sumPrincipal.toFixed(4)).toBe("120000.0000");
    expect(sumInterest.toFixed(4)).toBe("14400.0000");
  });

  it("calculates reducing balance (amortized EMI) schedule with exact principal reconciliation", () => {
    const result = calculateRepaymentSchedule({
      principal: "50000.0000",
      annualRate: "18.0000", // 18% per annum
      termMonths: 6,
      interestMethod: "REDUCING_BALANCE",
      disbursementDate: "2026-10-15",
    });

    expect(result.installments.length).toBe(6);
    expect(result.monthlyInstallment.gt(0)).toBe(true);

    let sumPrincipal = new Decimal(0);
    let sumInterest = new Decimal(0);

    for (const inst of result.installments) {
      sumPrincipal = sumPrincipal.plus(inst.principalDue);
      sumInterest = sumInterest.plus(inst.interestDue);
    }

    // Principal sum must be exact
    expect(sumPrincipal.toFixed(4)).toBe("50000.0000");
    expect(result.totalPrincipal.toFixed(4)).toBe("50000.0000");
    expect(result.totalRepayment.equals(result.totalPrincipal.plus(result.totalInterest))).toBe(true);
  });

  it("handles zero interest rate correctly", () => {
    const result = calculateRepaymentSchedule({
      principal: "30000.0000",
      annualRate: "0.0000",
      termMonths: 3,
      interestMethod: "REDUCING_BALANCE",
      disbursementDate: "2026-10-01",
    });

    expect(result.installments.length).toBe(3);
    expect(result.totalInterest.toFixed(4)).toBe("0.0000");
    expect(result.totalRepayment.toFixed(4)).toBe("30000.0000");

    for (const inst of result.installments) {
      expect(inst.principalDue.toFixed(4)).toBe("10000.0000");
      expect(inst.interestDue.toFixed(4)).toBe("0.0000");
    }
  });

  it("correctly clamps calendar dates at month boundaries (e.g. Jan 31 -> Feb 28)", () => {
    const base = new Date(Date.UTC(2026, 0, 31)); // 31 Jan 2026
    const febDueDate = addMonthsClamped(base, 1);
    expect(febDueDate.getUTCMonth()).toBe(1); // February
    expect(febDueDate.getUTCDate()).toBe(28); // 2026 is non-leap year

    const marDueDate = addMonthsClamped(base, 2);
    expect(marDueDate.getUTCMonth()).toBe(2); // March
    expect(marDueDate.getUTCDate()).toBe(31);
  });

  it("calculates weekly repayment schedule with 7-day spacing and exact reconciliation (CALC-01)", () => {
    const result = calculateRepaymentSchedule({
      principal: "26000.0000",
      annualRate: "10.4000", // ~0.2% weekly
      termMonths: 6, // 6 months = 26 weeks
      repaymentFrequency: "WEEKLY",
      interestMethod: "REDUCING_BALANCE",
      disbursementDate: "2026-10-01",
    });

    expect(result.installments.length).toBe(26);
    expect(result.installments[0].installmentNumber).toBe(1);
    expect(result.installments[25].installmentNumber).toBe(26);

    // Verify 7-day spacing
    const date1 = new Date(result.installments[0].dueDate).getTime();
    const date2 = new Date(result.installments[1].dueDate).getTime();
    expect(date2 - date1).toBe(7 * 24 * 60 * 60 * 1000);

    // Verify principal sum
    const sumPrincipal = result.installments.reduce((s, inst) => s.plus(inst.principalDue), new Decimal(0));
    expect(sumPrincipal.toFixed(4)).toBe("26000.0000");
  });

  it("calculates quarterly repayment schedule with 3-month spacing and exact reconciliation (CALC-01)", () => {
    const result = calculateRepaymentSchedule({
      principal: "120000.0000",
      annualRate: "12.0000",
      termMonths: 12, // 12 months = 4 quarters
      repaymentFrequency: "QUARTERLY",
      interestMethod: "FLAT",
      disbursementDate: "2026-01-01",
    });

    expect(result.installments.length).toBe(4);
    expect(result.installments[0].dueDateStr).toBe("2026-04-01");
    expect(result.installments[1].dueDateStr).toBe("2026-07-01");
    expect(result.installments[2].dueDateStr).toBe("2026-10-01");
    expect(result.installments[3].dueDateStr).toBe("2027-01-01");

    const sumPrincipal = result.installments.reduce((s, inst) => s.plus(inst.principalDue), new Decimal(0));
    expect(sumPrincipal.toFixed(4)).toBe("120000.0000");
  });
});

