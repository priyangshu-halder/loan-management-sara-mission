import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePaymentAllocation,
  InstallmentForAllocation,
} from "./payment-allocation-engine";

describe("Payment Allocation Engine", () => {
  const mockInstallments: InstallmentForAllocation[] = [
    {
      id: "inst-1",
      installmentNumber: 1,
      dueDate: "2026-10-01",
      principalDue: "5000.0000",
      interestDue: "1000.0000",
      feeDue: "200.0000",
      penaltyDue: "100.0000",
      totalDue: "6300.0000",
      principalPaid: "0.0000",
      interestPaid: "0.0000",
      feePaid: "0.0000",
      penaltyPaid: "0.0000",
      totalPaid: "0.0000",
      status: "PENDING",
    },
    {
      id: "inst-2",
      installmentNumber: 2,
      dueDate: "2026-11-01",
      principalDue: "5000.0000",
      interestDue: "900.0000",
      feeDue: "0.0000",
      penaltyDue: "0.0000",
      totalDue: "5900.0000",
      principalPaid: "0.0000",
      interestPaid: "0.0000",
      feePaid: "0.0000",
      penaltyPaid: "0.0000",
      totalPaid: "0.0000",
      status: "PENDING",
    },
  ];

  it("strictly enforces policy hierarchy: Penalty -> Fee -> Interest -> Principal", () => {
    // Pay 2,000 against Installment 1 (Penalty: 100, Fee: 200, Interest: 1,000, Principal: 700)
    const result = calculatePaymentAllocation(mockInstallments, "2000.0000");

    expect(result.penaltyAmount.toFixed(4)).toBe("100.0000");
    expect(result.feeAmount.toFixed(4)).toBe("200.0000");
    expect(result.interestAmount.toFixed(4)).toBe("1000.0000");
    expect(result.principalAmount.toFixed(4)).toBe("700.0000");
    expect(result.advanceAmount.toFixed(4)).toBe("0.0000");
    expect(result.affectedInstallments.length).toBe(1);
    expect(result.affectedInstallments[0]?.newStatus).toBe("PARTIALLY_PAID");
  });

  it("allocates across multiple installments when payment exceeds single installment", () => {
    // Pay 8,000 (Satisfies inst 1 of 6,300 completely, and 1,700 into inst 2: Interest 900 + Principal 800)
    const result = calculatePaymentAllocation(mockInstallments, "8000.0000");

    expect(result.penaltyAmount.toFixed(4)).toBe("100.0000");
    expect(result.feeAmount.toFixed(4)).toBe("200.0000");
    expect(result.interestAmount.toFixed(4)).toBe("1900.0000"); // 1000 (inst 1) + 900 (inst 2)
    expect(result.principalAmount.toFixed(4)).toBe("5800.0000"); // 5000 (inst 1) + 800 (inst 2)
    expect(result.advanceAmount.toFixed(4)).toBe("0.0000");
    expect(result.affectedInstallments.length).toBe(2);
    expect(result.affectedInstallments[0]?.newStatus).toBe("PAID");
    expect(result.affectedInstallments[1]?.newStatus).toBe("PARTIALLY_PAID");
  });

  it("places surplus in advance (unapplied credit) when payment exceeds all dues", () => {
    // Total dues: 6,300 + 5,900 = 12,200. Pay 15,000 -> 2,800 advance!
    const result = calculatePaymentAllocation(mockInstallments, "15000.0000");

    expect(result.advanceAmount.toFixed(4)).toBe("2800.0000");
    expect(result.affectedInstallments.every((i) => i.newStatus === "PAID")).toBe(true);
  });

  it("rejects zero and negative payment amounts", () => {
    expect(() => calculatePaymentAllocation(mockInstallments, "0")).toThrow();
    expect(() => calculatePaymentAllocation(mockInstallments, "-500")).toThrow();
  });
});

