import Decimal from "decimal.js";
import { toDecimal } from "@/lib/money/money";

export interface InstallmentForAllocation {
  id: string;
  installmentNumber: number;
  dueDate: Date | string;
  principalDue: Decimal | string | number;
  interestDue: Decimal | string | number;
  feeDue: Decimal | string | number;
  penaltyDue: Decimal | string | number;
  totalDue: Decimal | string | number;
  principalPaid: Decimal | string | number;
  interestPaid: Decimal | string | number;
  feePaid: Decimal | string | number;
  penaltyPaid: Decimal | string | number;
  totalPaid: Decimal | string | number;
  status: string;
}

export interface AllocationResult {
  principalAmount: Decimal;
  interestAmount: Decimal;
  feeAmount: Decimal;
  penaltyAmount: Decimal;
  advanceAmount: Decimal;
  totalAllocated: Decimal;
  affectedInstallments: Array<{
    installmentId: string;
    installmentNumber: number;
    principalPaidDelta: Decimal;
    interestPaidDelta: Decimal;
    feePaidDelta: Decimal;
    penaltyPaidDelta: Decimal;
    totalPaidDelta: Decimal;
    newPrincipalPaid: Decimal;
    newInterestPaid: Decimal;
    newFeePaid: Decimal;
    newPenaltyPaid: Decimal;
    newTotalPaid: Decimal;
    newStatus: "PAID" | "PARTIALLY_PAID" | "PENDING";
  }>;
}

/**
 * Standard microfinance payment allocation policy:
 * PENALTY -> FEE -> INTEREST -> PRINCIPAL -> ADVANCE (UNAPPLIED CREDIT)
 *
 * Traverses installments in chronological order, filling each bucket up to the due amount.
 * Any unallocated surplus beyond all scheduled dues is marked as ADVANCE (Unapplied Credit).
 */
export function calculatePaymentAllocation(
  installments: InstallmentForAllocation[],
  paymentAmount: Decimal | string | number
): AllocationResult {
  const totalToAllocate = toDecimal(paymentAmount);
  if (totalToAllocate.lte(0)) {
    throw new Error("Payment allocation amount must be strictly greater than zero");
  }

  let remaining = totalToAllocate;
  let totalPrincipal = new Decimal(0);
  let totalInterest = new Decimal(0);
  let totalFee = new Decimal(0);
  let totalPenalty = new Decimal(0);

  // Sort installments chronologically
  const sorted = [...installments].sort((a, b) => {
    const dateA = new Date(a.dueDate).getTime();
    const dateB = new Date(b.dueDate).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.installmentNumber - b.installmentNumber;
  });

  const affectedInstallments: AllocationResult["affectedInstallments"] = [];

  for (const inst of sorted) {
    if (remaining.isZero()) break;
    if (inst.status === "PAID") continue;

    const penaltyUnpaid = Decimal.max(0, toDecimal(inst.penaltyDue).minus(toDecimal(inst.penaltyPaid)));
    const feeUnpaid = Decimal.max(0, toDecimal(inst.feeDue).minus(toDecimal(inst.feePaid)));
    const interestUnpaid = Decimal.max(0, toDecimal(inst.interestDue).minus(toDecimal(inst.interestPaid)));
    const principalUnpaid = Decimal.max(0, toDecimal(inst.principalDue).minus(toDecimal(inst.principalPaid)));

    // 1. Allocate Penalty
    const penaltyPaidDelta = Decimal.min(remaining, penaltyUnpaid);
    remaining = remaining.minus(penaltyPaidDelta);
    totalPenalty = totalPenalty.plus(penaltyPaidDelta);

    // 2. Allocate Fee
    const feePaidDelta = Decimal.min(remaining, feeUnpaid);
    remaining = remaining.minus(feePaidDelta);
    totalFee = totalFee.plus(feePaidDelta);

    // 3. Allocate Interest
    const interestPaidDelta = Decimal.min(remaining, interestUnpaid);
    remaining = remaining.minus(interestPaidDelta);
    totalInterest = totalInterest.plus(interestPaidDelta);

    // 4. Allocate Principal
    const principalPaidDelta = Decimal.min(remaining, principalUnpaid);
    remaining = remaining.minus(principalPaidDelta);
    totalPrincipal = totalPrincipal.plus(principalPaidDelta);

    const installmentPaidDelta = penaltyPaidDelta
      .plus(feePaidDelta)
      .plus(interestPaidDelta)
      .plus(principalPaidDelta);

    if (installmentPaidDelta.gt(0)) {
      const newPrincipalPaid = toDecimal(inst.principalPaid).plus(principalPaidDelta);
      const newInterestPaid = toDecimal(inst.interestPaid).plus(interestPaidDelta);
      const newFeePaid = toDecimal(inst.feePaid).plus(feePaidDelta);
      const newPenaltyPaid = toDecimal(inst.penaltyPaid).plus(penaltyPaidDelta);
      const newTotalPaid = newPrincipalPaid
        .plus(newInterestPaid)
        .plus(newFeePaid)
        .plus(newPenaltyPaid);

      const totalDue = toDecimal(inst.totalDue);
      const newStatus = newTotalPaid.gte(totalDue) ? "PAID" : "PARTIALLY_PAID";

      affectedInstallments.push({
        installmentId: inst.id,
        installmentNumber: inst.installmentNumber,
        principalPaidDelta,
        interestPaidDelta,
        feePaidDelta,
        penaltyPaidDelta,
        totalPaidDelta: installmentPaidDelta,
        newPrincipalPaid,
        newInterestPaid,
        newFeePaid,
        newPenaltyPaid,
        newTotalPaid,
        newStatus,
      });
    }
  }

  // Any leftover funds after all installments are satisfied becomes unapplied credit
  const advanceAmount = remaining;

  return {
    principalAmount: totalPrincipal,
    interestAmount: totalInterest,
    feeAmount: totalFee,
    penaltyAmount: totalPenalty,
    advanceAmount,
    totalAllocated: totalToAllocate,
    affectedInstallments,
  };
}

