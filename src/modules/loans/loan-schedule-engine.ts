import Decimal from "decimal.js";
import { toDecimal } from "@/lib/money/money";

export interface ScheduleCalculationInput {
  principal: Decimal | string | number;
  totalRepaymentAmount?: Decimal | string | number;
  annualRate?: Decimal | string | number; // Optional; historical formula fallback
  termMonths: number;
  interestMethod?: "FLAT" | "REDUCING_BALANCE" | string;
  repaymentFrequency?: "MONTHLY" | "WEEKLY" | "QUARTERLY" | string;
  disbursementDate: Date | string;
}

export interface ScheduleInstallment {
  installmentNumber: number;
  dueDate: Date;
  dueDateStr: string;
  principalDue: Decimal;
  interestDue: Decimal;
  feeDue: Decimal;
  penaltyDue: Decimal;
  totalDue: Decimal;
}

export interface ScheduleResult {
  installments: ScheduleInstallment[];
  totalPrincipal: Decimal;
  totalInterest: Decimal;
  totalRepayment: Decimal;
  monthlyInstallment: Decimal;
}

/**
 * Calculates calendar due date by adding N weeks to the disbursement date.
 */
export function addWeeks(baseDate: Date, weeksToAdd: number): Date {
  const result = new Date(baseDate.getTime());
  result.setUTCDate(result.getUTCDate() + weeksToAdd * 7);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Calculates calendar due date by adding N months to the disbursement date,
 * preserving day-of-month where possible and clamping to month end.
 */
export function addMonthsClamped(baseDate: Date, monthsToAdd: number): Date {
  const result = new Date(baseDate.getTime());
  const originalDay = result.getUTCDate();

  result.setUTCMonth(result.getUTCMonth() + monthsToAdd, 1);

  // Find last day of target month
  const targetYear = result.getUTCFullYear();
  const targetMonth = result.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  result.setUTCDate(Math.min(originalDay, lastDayOfMonth));
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Deterministic loan schedule calculator with zero floating-point arithmetic.
 * In the redesigned scheme system:
 * - Total repayment amount is manually defined by the maker.
 * - Repayment installments are generated directly from totalRepaymentAmount and duration.
 * - No interest rate or interest formula is applied.
 * - The sum of all scheduled installments must equal the exact total repayment amount.
 * - Rounding remainder is distributed across the repayment schedule.
 */
export function calculateRepaymentSchedule(input: ScheduleCalculationInput): ScheduleResult {
  const principal = toDecimal(input.principal);
  const termMonths = Math.max(1, input.termMonths);
  const freq = (input.repaymentFrequency || "MONTHLY").toUpperCase();

  if (principal.lte(0)) {
    throw new Error("Principal must be greater than zero");
  }

  let totalPeriods: number;
  let annualDivisor: number;

  if (freq === "WEEKLY") {
    totalPeriods = Math.max(1, Math.round((termMonths * 52) / 12));
    annualDivisor = 52;
  } else if (freq === "QUARTERLY") {
    totalPeriods = Math.max(1, Math.round(termMonths / 3));
    annualDivisor = 4;
  } else {
    // Default to MONTHLY
    totalPeriods = termMonths;
    annualDivisor = 12;
  }

  const baseDate =
    typeof input.disbursementDate === "string"
      ? new Date(`${input.disbursementDate.slice(0, 10)}T00:00:00.000Z`)
      : new Date(input.disbursementDate.getTime());

  const getDueDate = (periodIndex: number): Date => {
    if (freq === "WEEKLY") {
      return addWeeks(baseDate, periodIndex);
    } else if (freq === "QUARTERLY") {
      return addMonthsClamped(baseDate, periodIndex * 3);
    } else {
      return addMonthsClamped(baseDate, periodIndex);
    }
  };

  // --- NEW MANUAL REPAYMENT SCHEME CALCULATION ---
  if (input.totalRepaymentAmount !== undefined && input.totalRepaymentAmount !== null) {
    const totalRepayment = toDecimal(input.totalRepaymentAmount);
    if (totalRepayment.lt(principal)) {
      throw new Error("Total repayment amount must be greater than or equal to loan amount");
    }

    // Precise distribution in minor units (paisa / cents = 2 decimal places)
    const totalMinor = totalRepayment
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    const baseMinor = Math.floor(totalMinor / totalPeriods);
    const remainderMinor = totalMinor - baseMinor * totalPeriods;

    const installments: ScheduleInstallment[] = [];
    let accumulatedSum = new Decimal(0);

    for (let i = 1; i <= totalPeriods; i++) {
      const dueDate = getDueDate(i);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      // Distribute remainder cents to the later installments (e.g. 3,333.33, 3,333.33, 3,333.34)
      const hasRemainderCent = i > totalPeriods - remainderMinor;
      const installmentMinor = baseMinor + (hasRemainderCent ? 1 : 0);
      const installmentAmount = new Decimal(installmentMinor).dividedBy(100);

      accumulatedSum = accumulatedSum.plus(installmentAmount);

      installments.push({
        installmentNumber: i,
        dueDate,
        dueDateStr,
        principalDue: installmentAmount,
        interestDue: new Decimal(0),
        feeDue: new Decimal(0),
        penaltyDue: new Decimal(0),
        totalDue: installmentAmount,
      });
    }

    return {
      installments,
      totalPrincipal: principal,
      totalInterest: new Decimal(0),
      totalRepayment,
      monthlyInstallment: installments[0]?.totalDue ?? new Decimal(0),
    };
  }

  // --- HISTORICAL FORMULA-BASED FALLBACK (for backwards compatibility of historical records) ---
  const annualRate = toDecimal(input.annualRate ?? 0);
  const method = (input.interestMethod || "REDUCING_BALANCE").toUpperCase();

  if (annualRate.isNegative()) {
    throw new Error("Interest rate cannot be negative");
  }

  const installments: ScheduleInstallment[] = [];
  let sumPrincipal = new Decimal(0);
  let sumInterest = new Decimal(0);

  if (method === "FLAT") {
    const rateFraction = annualRate.dividedBy(100);
    const yearFraction = new Decimal(termMonths).dividedBy(12);
    const totalFlatInterest = principal
      .times(rateFraction)
      .times(yearFraction)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    const basePrincipalPerPeriod = principal.dividedBy(totalPeriods).toDecimalPlaces(4, Decimal.ROUND_DOWN);
    const baseInterestPerPeriod = totalFlatInterest.dividedBy(totalPeriods).toDecimalPlaces(4, Decimal.ROUND_DOWN);

    for (let i = 1; i <= totalPeriods; i++) {
      const isLast = i === totalPeriods;
      const dueDate = getDueDate(i);
      const dueDateStr = dueDate.toISOString().slice(0, 10);

      const pDue = isLast ? principal.minus(sumPrincipal) : basePrincipalPerPeriod;
      const iDue = isLast ? totalFlatInterest.minus(sumInterest) : baseInterestPerPeriod;
      const totalDue = pDue.plus(iDue);

      sumPrincipal = sumPrincipal.plus(pDue);
      sumInterest = sumInterest.plus(iDue);

      installments.push({
        installmentNumber: i,
        dueDate,
        dueDateStr,
        principalDue: pDue,
        interestDue: iDue,
        feeDue: new Decimal(0),
        penaltyDue: new Decimal(0),
        totalDue,
      });
    }

    const firstEmi = installments[0]?.totalDue ?? new Decimal(0);

    return {
      installments,
      totalPrincipal: principal,
      totalInterest: sumInterest,
      totalRepayment: principal.plus(sumInterest),
      monthlyInstallment: firstEmi,
    };
  }

  // REDUCING_BALANCE (Amortized EMI)
  const periodicRate = annualRate.dividedBy(100).dividedBy(annualDivisor);
  let emi: Decimal;

  if (periodicRate.isZero()) {
    emi = principal.dividedBy(totalPeriods).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  } else {
    const onePlusR = new Decimal(1).plus(periodicRate);
    const onePlusRPowN = onePlusR.pow(totalPeriods);
    const numerator = principal.times(periodicRate).times(onePlusRPowN);
    const denominator = onePlusRPowN.minus(1);
    emi = numerator.dividedBy(denominator).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  let remainingPrincipal = principal;

  for (let i = 1; i <= totalPeriods; i++) {
    const isLast = i === totalPeriods;
    const dueDate = getDueDate(i);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const interestDue = remainingPrincipal.times(periodicRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    let principalDue: Decimal;
    if (isLast) {
      principalDue = remainingPrincipal;
    } else {
      principalDue = Decimal.min(emi.minus(interestDue), remainingPrincipal).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    }

    const totalDue = principalDue.plus(interestDue);
    remainingPrincipal = remainingPrincipal.minus(principalDue);
    sumPrincipal = sumPrincipal.plus(principalDue);
    sumInterest = sumInterest.plus(interestDue);

    installments.push({
      installmentNumber: i,
      dueDate,
      dueDateStr,
      principalDue,
      interestDue,
      feeDue: new Decimal(0),
      penaltyDue: new Decimal(0),
      totalDue,
    });
  }

  return {
    installments,
    totalPrincipal: principal,
    totalInterest: sumInterest,
    totalRepayment: principal.plus(sumInterest),
    monthlyInstallment: installments[0]?.totalDue ?? emi,
  };
}
