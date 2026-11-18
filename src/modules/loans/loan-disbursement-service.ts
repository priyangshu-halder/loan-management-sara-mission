import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission, requireAnyPermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { postJournalEntry } from "@/modules/accounting/posting-service";
import { calculateRepaymentSchedule } from "./loan-schedule-engine";

const disbursementSchema = z.object({
  organizationId: z.string().uuid(),
  applicationId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().refine((v) => Number(v) > 0, "Disbursement amount must be positive"),
  sourceReference: z.string().min(3).max(100),
});

export async function createLoanDisbursement(
  caller: AuthenticatedUser,
  input: z.infer<typeof disbursementSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requireAnyPermission(
    caller,
    "loan.disbursement.post",
    "loan.disbursement.approve",
    "loan.disbursement.create"
  );

  const parsed = disbursementSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid disbursement request");
  }

  const payload = parsed.data;

  const application = await prisma.loanApplication.findUnique({
    where: { id: payload.applicationId },
    include: {
      customer: true,
      scheme: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
          },
        },
      },
    },
  });

  if (!application || application.organizationId !== payload.organizationId) {
    throw new NotFoundError("LoanApplication", payload.applicationId);
  }

  if (application.status === "DISBURSED") {
    throw new ValidationError("Duplicate disbursement is not allowed for the same approved application");
  }

  if (application.status !== "APPROVED") {
    throw new ForbiddenError("Disbursement is only allowed for approved applications");
  }

  if (Number(payload.amount) !== Number(application.requestedPrincipal)) {
    throw new ValidationError("Disbursement amount must match the approved application principal");
  }

  const cashAccount = await prisma.cashAccount.findUnique({
    where: { id: payload.cashAccountId },
  });

  if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
    throw new NotFoundError("CashAccount", payload.cashAccountId);
  }

  const existingDisbursement = await prisma.loanDisbursement.findFirst({
    where: {
      organizationId: payload.organizationId,
      applicationId: payload.applicationId,
    },
  });

  if (existingDisbursement) {
    throw new ValidationError("Duplicate disbursement is not allowed for the same approved application");
  }

  // Find general ledger account for Loan Principal Receivable (Code: 1201)
  const loanPrincipalCoa = await prisma.chartOfAccount.findUnique({
    where: {
      organizationId_code: {
        organizationId: payload.organizationId,
        code: "1201",
      },
    },
  });

  if (!loanPrincipalCoa) {
    throw new NotFoundError("ChartOfAccount", "1201 (Loan Principal Receivable)");
  }

  // Resolve scheme version parameters
  const currentVersion = application.scheme.versions[0];
  const repaymentFrequency = currentVersion?.repaymentFrequency ?? "MONTHLY";
  const totalRepayInput = application.totalRepaymentAmount ?? currentVersion?.totalRepaymentAmount;

  // Calculate repayment schedule
  const schedule = calculateRepaymentSchedule(
    totalRepayInput
      ? {
          principal: payload.amount,
          totalRepaymentAmount: totalRepayInput,
          termMonths: application.requestedTermMonths,
          repaymentFrequency,
          disbursementDate: payload.disbursementDate,
        }
      : {
          principal: payload.amount,
          annualRate: currentVersion?.interestRate ?? "0.0000",
          termMonths: application.requestedTermMonths,
          interestMethod: currentVersion?.interestMethod ?? "REDUCING_BALANCE",
          repaymentFrequency,
          disbursementDate: payload.disbursementDate,
        }
  );

  return prisma.$transaction(async (tx) => {
    const loanAccountNumber = `LA-${Date.now().toString().slice(-8)}`;

    const totalRepaymentFinal = schedule.totalRepayment.toFixed(4);
    const initialOutstanding = totalRepayInput ? totalRepaymentFinal : payload.amount;

    const account = await tx.loanAccount.create({
      data: {
        organizationId: payload.organizationId,
        customerId: application.customerId,
        schemeId: application.schemeId,
        loanAccountNumber,
        principalDisbursed: payload.amount,
        principalOutstanding: initialOutstanding,
        termMonths: application.requestedTermMonths,
        totalRepaymentAmount: totalRepaymentFinal,
        totalPaid: "0.0000",
        status: "ACTIVE",
        nextDueDate: schedule.installments[0]?.dueDate ?? new Date(`${payload.disbursementDate}T00:00:00.000Z`),
      },
    });

    // Bulk create repayment installments
    await tx.repaymentInstallment.createMany({
      data: schedule.installments.map((inst) => ({
        organizationId: payload.organizationId,
        loanAccountId: account.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        principalDue: inst.principalDue,
        interestDue: inst.interestDue,
        feeDue: inst.feeDue,
        penaltyDue: inst.penaltyDue,
        totalDue: inst.totalDue,
        status: "PENDING",
      })),
    });

    const disbursement = await tx.loanDisbursement.create({
      data: {
        organizationId: payload.organizationId,
        applicationId: payload.applicationId,
        loanAccountId: account.id,
        amount: payload.amount,
        disbursementDate: new Date(`${payload.disbursementDate}T00:00:00.000Z`),
        sourceReference: payload.sourceReference,
        status: "POSTED",
        createdById: caller.userId,
      },
      include: {
        loanAccount: true,
      },
    });

    // Update loan application status to DISBURSED
    await tx.loanApplication.update({
      where: { id: payload.applicationId },
      data: {
        status: "DISBURSED",
      },
    });

    // Balanced General Ledger posting:
    // Debit: 1201 (Loan Principal Receivable - Asset Increases)
    // Credit: cashAccount.chartOfAccountId (Cash/Bank Asset Decreases)
    const journalEntry = await postJournalEntry(
      caller,
      {
        organizationId: payload.organizationId,
        businessDate: payload.disbursementDate,
        sourceModule: "LOANS",
        sourceType: "LOAN_DISBURSEMENT",
        sourceId: disbursement.id,
        description: `Loan disbursement for ${application.customer.fullName} (${loanAccountNumber})`,
        idempotencyKey: `DISB-${application.id}`,
        lines: [
          {
            accountId: loanPrincipalCoa.id,
            debit: payload.amount,
            credit: 0,
            narration: `Principal receivable for loan account ${loanAccountNumber}`,
          },
          {
            accountId: cashAccount.chartOfAccountId,
            debit: 0,
            credit: payload.amount,
            narration: `Payout from ${cashAccount.name} (${cashAccount.code})`,
          },
        ],
      },
      tx
    );

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "loan.disbursement.posted",
        entityType: "LoanDisbursement",
        entityId: disbursement.id,
        metadata: {
          loanAccountId: account.id,
          amount: payload.amount,
          sourceReference: payload.sourceReference,
          journalEntryId: journalEntry.id,
          journalEntryNumber: journalEntry.entryNumber,
        },
      },
      tx
    );

    return {
      ...disbursement,
      loanAccount: account,
      journalEntry,
      installmentsCount: schedule.installments.length,
    };
  });
}
