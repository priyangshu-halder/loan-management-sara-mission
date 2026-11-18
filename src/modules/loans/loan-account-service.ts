import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors/app-error";
import { requirePermission, requireAnyPermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import Decimal from "decimal.js";

export interface GetLoanAccountsOptions {
  status?: string;
  customerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getLoanAccounts(
  caller: AuthenticatedUser,
  options: GetLoanAccountsOptions = {}
) {
  requireAnyPermission(caller, "loan.account.read", "loan.application.view", "loan.reports.view");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.status && options.status !== "ALL") {
    where.status = options.status;
  }

  if (options.customerId) {
    where.customerId = options.customerId;
  }

  if (options.search) {
    where.OR = [
      { loanAccountNumber: { contains: options.search } },
      { customer: { fullName: { contains: options.search } } },
      { customer: { customerCode: { contains: options.search } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.loanAccount.findMany({
      where,
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
            id: true,
            code: true,
            name: true,
          },
        },
        disbursements: {
          select: {
            id: true,
            amount: true,
            disbursementDate: true,
            sourceReference: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.loanAccount.count({ where }),
  ]);

  return { items, total };
}

export async function getLoanAccountById(caller: AuthenticatedUser, loanAccountId: string) {
  requireAnyPermission(caller, "loan.account.read", "loan.application.view", "loan.reports.view");

  const account = await prisma.loanAccount.findUnique({
    where: { id: loanAccountId },
    include: {
      customer: true,
      scheme: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
      disbursements: {
        orderBy: { createdAt: "desc" },
      },
      installments: {
        orderBy: { installmentNumber: "asc" },
      },
      collectionReceipts: {
        orderBy: { createdAt: "desc" },
      },
      loanClosures: true,
    },
  });

  if (!account || account.organizationId !== caller.organizationId) {
    throw new NotFoundError("LoanAccount", loanAccountId);
  }

  return account;
}

export async function getLoanPortfolioSummary(caller: AuthenticatedUser) {
  requireAnyPermission(caller, "loan.account.read", "loan.application.view", "loan.reports.view");

  const accounts = await prisma.loanAccount.findMany({
    where: { organizationId: caller.organizationId },
    select: {
      principalDisbursed: true,
      principalOutstanding: true,
      status: true,
    },
  });

  let totalDisbursed = new Decimal(0);
  let totalOutstanding = new Decimal(0);
  let activeCount = 0;
  let closedCount = 0;

  for (const acc of accounts) {
    totalDisbursed = totalDisbursed.plus(new Decimal(acc.principalDisbursed || 0));
    totalOutstanding = totalOutstanding.plus(new Decimal(acc.principalOutstanding || 0));
    if (acc.status === "ACTIVE") activeCount++;
    if (acc.status === "CLOSED") closedCount++;
  }

  // Count pending applications
  const [draftApps, submittedApps, approvedApps] = await Promise.all([
    prisma.loanApplication.count({
      where: { organizationId: caller.organizationId, status: "DRAFT" },
    }),
    prisma.loanApplication.count({
      where: { organizationId: caller.organizationId, status: "SUBMITTED" },
    }),
    prisma.loanApplication.count({
      where: { organizationId: caller.organizationId, status: "APPROVED" },
    }),
  ]);

  return {
    totalDisbursed: totalDisbursed.toFixed(4),
    totalOutstanding: totalOutstanding.toFixed(4),
    activeCount,
    closedCount,
    totalAccounts: accounts.length,
    pipeline: {
      draft: draftApps,
      submitted: submittedApps,
      approved: approvedApps,
    },
  };
}

