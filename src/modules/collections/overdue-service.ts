import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";

const followUpSchema = z.object({
  organizationId: z.string().uuid(),
  loanAccountId: z.string().uuid(),
  status: z.enum(["PENDING", "CONTACTED", "PROMISE_TO_PAY", "BROKEN_PROMISE", "RESOLVED"]).default("CONTACTED"),
  promiseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  promiseAmount: z.string().refine((v) => Number(v) > 0).optional(),
  notes: z.string().min(5).max(1000),
});

export interface GetOverdueOptions {
  asOfDate?: string; // YYYY-MM-DD
  branchId?: string;
  groupId?: string;
  agingBucket?: "1-30" | "31-60" | "61-90" | "90+" | "ALL";
}

export interface OverdueLoanRecord {
  loanAccountId: string;
  loanAccountNumber: string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  scheme: {
    name: string;
    code: string;
  };
  principalDisbursed: string;
  principalOutstanding: string;
  earliestDueDate: string;
  daysPastDue: number;
  agingBucket: "1-30" | "31-60" | "61-90" | "90+";
  principalOverdue: string;
  interestOverdue: string;
  feeOverdue: string;
  penaltyOverdue: string;
  totalOverdue: string;
  overdueInstallmentsCount: number;
  latestFollowUp?: {
    status: string;
    promiseDate: string | null;
    promiseAmount: string | null;
    notes: string;
    createdAt: string;
  } | null;
}

export async function getOverdueQueue(
  caller: AuthenticatedUser,
  options: GetOverdueOptions = {}
) {
  requirePermission(caller, "collection.receipt.create");

  const asOfDateStr = options.asOfDate || new Date().toISOString().slice(0, 10);
  const cutoffDate = new Date(`${asOfDateStr}T00:00:00.000Z`);

  // Find all active loan accounts with overdue installments (strictly due prior to asOfDate)
  const loans = await prisma.loanAccount.findMany({
    where: {
      organizationId: caller.organizationId,
      status: "ACTIVE",
      ...(options.branchId ? { customer: { branchId: options.branchId } } : {}),
      installments: {
        some: {
          dueDate: { lt: cutoffDate },
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        },
      },
    },
    include: {
      customer: {
        select: {
          id: true,
          customerCode: true,
          fullName: true,
          phone: true,
          email: true,
        },
      },
      scheme: {
        select: {
          name: true,
          code: true,
        },
      },
      installments: {
        where: {
          dueDate: { lt: cutoffDate },
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        },
        orderBy: { installmentNumber: "asc" },
      },
      followUps: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const records: OverdueLoanRecord[] = [];
  let totalArrearsAmount = new Decimal(0);
  let par30Amount = new Decimal(0);
  let par60Amount = new Decimal(0);
  let par90Amount = new Decimal(0);

  for (const loan of loans) {
    if (loan.installments.length === 0) continue;

    const earliestDue = new Date(loan.installments[0]!.dueDate);
    const diffTime = Math.max(0, cutoffDate.getTime() - earliestDue.getTime());
    const daysPastDue = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    let principalOverdue = new Decimal(0);
    let interestOverdue = new Decimal(0);
    let feeOverdue = new Decimal(0);
    let penaltyOverdue = new Decimal(0);

    for (const inst of loan.installments) {
      principalOverdue = principalOverdue.plus(
        Decimal.max(0, new Decimal(inst.principalDue.toString()).minus(new Decimal(inst.principalPaid.toString())))
      );
      interestOverdue = interestOverdue.plus(
        Decimal.max(0, new Decimal(inst.interestDue.toString()).minus(new Decimal(inst.interestPaid.toString())))
      );
      feeOverdue = feeOverdue.plus(
        Decimal.max(0, new Decimal(inst.feeDue.toString()).minus(new Decimal(inst.feePaid.toString())))
      );
      penaltyOverdue = penaltyOverdue.plus(
        Decimal.max(0, new Decimal(inst.penaltyDue.toString()).minus(new Decimal(inst.penaltyPaid.toString())))
      );
    }

    const totalOverdue = principalOverdue
      .plus(interestOverdue)
      .plus(feeOverdue)
      .plus(penaltyOverdue);

    totalArrearsAmount = totalArrearsAmount.plus(totalOverdue);

    let bucket: "1-30" | "31-60" | "61-90" | "90+";
    if (daysPastDue <= 30) {
      bucket = "1-30";
    } else if (daysPastDue <= 60) {
      bucket = "31-60";
      par30Amount = par30Amount.plus(new Decimal(loan.principalOutstanding));
    } else if (daysPastDue <= 90) {
      bucket = "61-90";
      par30Amount = par30Amount.plus(new Decimal(loan.principalOutstanding));
      par60Amount = par60Amount.plus(new Decimal(loan.principalOutstanding));
    } else {
      bucket = "90+";
      par30Amount = par30Amount.plus(new Decimal(loan.principalOutstanding));
      par60Amount = par60Amount.plus(new Decimal(loan.principalOutstanding));
      par90Amount = par90Amount.plus(new Decimal(loan.principalOutstanding));
    }

    if (options.agingBucket && options.agingBucket !== "ALL" && options.agingBucket !== bucket) {
      continue;
    }

    const latestFollowUp = loan.followUps[0]
      ? {
          status: loan.followUps[0].status,
          promiseDate: loan.followUps[0].promiseDate?.toISOString().slice(0, 10) ?? null,
          promiseAmount: loan.followUps[0].promiseAmount ? loan.followUps[0].promiseAmount.toString() : null,
          notes: loan.followUps[0].notes,
          createdAt: loan.followUps[0].createdAt.toISOString(),
        }
      : null;

    records.push({
      loanAccountId: loan.id,
      loanAccountNumber: loan.loanAccountNumber,
      customer: loan.customer,
      scheme: loan.scheme,
      principalDisbursed: loan.principalDisbursed,
      principalOutstanding: loan.principalOutstanding,
      earliestDueDate: earliestDue.toISOString().slice(0, 10),
      daysPastDue,
      agingBucket: bucket,
      principalOverdue: principalOverdue.toFixed(4),
      interestOverdue: interestOverdue.toFixed(4),
      feeOverdue: feeOverdue.toFixed(4),
      penaltyOverdue: penaltyOverdue.toFixed(4),
      totalOverdue: totalOverdue.toFixed(4),
      overdueInstallmentsCount: loan.installments.length,
      latestFollowUp,
    });
  }

  // Sort by highest days past due first
  records.sort((a, b) => b.daysPastDue - a.daysPastDue);

  return {
    items: records,
    totalOverdueLoans: records.length,
    summary: {
      totalArrearsAmount: totalArrearsAmount.toFixed(4),
      par30Amount: par30Amount.toFixed(4),
      par60Amount: par60Amount.toFixed(4),
      par90Amount: par90Amount.toFixed(4),
    },
  };
}

export async function createFollowUp(
  caller: AuthenticatedUser,
  input: z.infer<typeof followUpSchema>
) {
  requirePermission(caller, "collection.receipt.create");

  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid follow-up payload");
  }

  const payload = parsed.data;

  const loanAccount = await prisma.loanAccount.findUnique({
    where: { id: payload.loanAccountId },
    include: {
      installments: {
        where: { status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });

  if (!loanAccount || loanAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanAccount", payload.loanAccountId);
  }

  const earliestDue = loanAccount.installments[0]?.dueDate ?? new Date();
  const diff = Math.max(0, Date.now() - earliestDue.getTime());
  const daysPastDue = Math.floor(diff / (1000 * 60 * 60 * 24));

  const totalOverdue = loanAccount.installments.reduce(
    (acc, inst) =>
      acc.plus(
        Decimal.max(
          0,
          new Decimal(inst.totalDue.toString()).minus(new Decimal(inst.totalPaid.toString()))
        )
      ),
    new Decimal(0)
  );

  const followUp = await prisma.followUp.create({
    data: {
      organizationId: payload.organizationId,
      loanAccountId: payload.loanAccountId,
      customerId: loanAccount.customerId,
      dueDate: earliestDue,
      amountOverdue: totalOverdue,
      daysPastDue,
      status: payload.status,
      promiseDate: payload.promiseDate ? new Date(`${payload.promiseDate}T00:00:00.000Z`) : null,
      promiseAmount: payload.promiseAmount ? new Decimal(payload.promiseAmount) : null,
      notes: payload.notes,
      officerId: caller.userId,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "loan.followup.created",
    entityType: "FollowUp",
    entityId: followUp.id,
    metadata: {
      loanAccountId: payload.loanAccountId,
      status: payload.status,
      promiseDate: payload.promiseDate,
      promiseAmount: payload.promiseAmount,
    },
  });

  return followUp;
}

export async function getFollowUps(
  caller: AuthenticatedUser,
  options: { loanAccountId?: string; limit?: number } = {}
) {
  requirePermission(caller, "collection.receipt.create");

  return prisma.followUp.findMany({
    where: {
      organizationId: caller.organizationId,
      ...(options.loanAccountId ? { loanAccountId: options.loanAccountId } : {}),
    },
    include: {
      customer: {
        select: {
          fullName: true,
          customerCode: true,
          phone: true,
        },
      },
      loanAccount: {
        select: {
          loanAccountNumber: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 50,
  });
}

