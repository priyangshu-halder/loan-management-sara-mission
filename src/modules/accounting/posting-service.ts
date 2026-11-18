import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  requireOrganizationScope,
  requirePermission,
} from "@/lib/permissions/auth-guard";
import {
  ConflictError,
  ForbiddenError,
  InvariantViolationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { Money, toDecimal } from "@/lib/money/money";
import { isValidCalendarDate, parseBusinessDateToUtcMidnight } from "@/lib/dates/dates";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import Decimal from "decimal.js";

export interface JournalLineInput {
  accountId: string;
  debit: Decimal | string | number;
  credit: Decimal | string | number;
  narration?: string;
  cashAccountId?: string;
}

export interface PostJournalCommand {
  organizationId: string;
  branchId?: string | null;
  businessDate: string; // YYYY-MM-DD
  postingDate?: Date | string; // Defaults to UTC midnight of businessDate
  sourceModule: "LOANS" | "COLLECTIONS" | "SAVINGS" | "TERM_DEPOSITS" | "EXPENSES" | "MANUAL";
  sourceType: string;
  sourceId?: string | null;
  description: string;
  lines: JournalLineInput[];
  idempotencyKey?: string;
}

export interface ReverseJournalCommand {
  organizationId: string;
  journalEntryId: string;
  reversalReason: string;
  businessDate: string; // Date on which reversal is recorded
  idempotencyKey?: string;
}

/**
 * Generates the next unique sequential journal entry number for an organization.
 */
async function generateEntryNumber(
  organizationId: string,
  businessDate: string,
  tx: Prisma.TransactionClient
): Promise<string> {
  const yyyymm = businessDate.replace(/-/g, "").slice(0, 6);
  const prefix = `JNL-${yyyymm}-`;

  const lastEntry = await tx.journalEntry.findFirst({
    where: {
      organizationId,
      entryNumber: { startsWith: prefix },
    },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });

  let nextSeq = 1;
  if (lastEntry) {
    const parts = lastEntry.entryNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return `${prefix}${nextSeq.toString().padStart(6, "0")}`;
}

/**
 * Calculates net balance delta for an account based on its normal balance rules.
 * - ASSET & EXPENSE: Debit increases (+), Credit decreases (-)
 * - LIABILITY, EQUITY & INCOME: Credit increases (+), Debit decreases (-)
 */
export function calculateAccountBalanceDelta(
  accountType: string,
  debit: Decimal,
  credit: Decimal
): Decimal {
  const normalizedType = accountType.toUpperCase();
  if (normalizedType === "ASSET" || normalizedType === "EXPENSE") {
    return debit.minus(credit);
  }
  if (
    normalizedType === "LIABILITY" ||
    normalizedType === "EQUITY" ||
    normalizedType === "INCOME"
  ) {
    return credit.minus(debit);
  }
  throw new Error(`Unknown account type for balance calculation: ${accountType}`);
}

/**
 * Central posting service executing balanced general ledger movements.
 */
export async function postJournalEntry(
  caller: AuthenticatedUser,
  command: PostJournalCommand,
  dbClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
) {
  requireOrganizationScope(caller, command.organizationId);

  // Validate permission (either explicit manual posting or caller domain permissions)
  if (command.sourceModule === "MANUAL") {
    requirePermission(caller, "accounting.ledger.read");
  }

  if (!isValidCalendarDate(command.businessDate)) {
    throw new ValidationError(`Invalid business date: "${command.businessDate}". Expected YYYY-MM-DD.`);
  }

  const postingDate = command.postingDate
    ? typeof command.postingDate === "string"
      ? new Date(command.postingDate)
      : command.postingDate
    : parseBusinessDateToUtcMidnight(command.businessDate);

  if (!command.description || command.description.trim() === "") {
    throw new ValidationError("Journal entry requires a non-empty description.");
  }

  if (!command.lines || command.lines.length < 2) {
    throw new ValidationError("Journal entry must contain at least two line items (debit and credit).");
  }

  // --- Strict Balanced Journal Invariant Check ---
  let totalDebit = Money.zero();
  let totalCredit = Money.zero();

  const validatedLines: Array<{
    accountId: string;
    cashAccountId?: string;
    debit: Decimal;
    credit: Decimal;
    narration?: string;
  }> = [];

  for (const line of command.lines) {
    const d = toDecimal(line.debit);
    const c = toDecimal(line.credit);

    if (d.isNegative() || c.isNegative()) {
      throw new ValidationError("Negative debit or credit amounts are strictly prohibited. Use separate lines.");
    }

    if (d.isZero() && c.isZero()) {
      throw new ValidationError("A journal line must specify a positive debit or credit amount.");
    }

    if (!d.isZero() && !c.isZero()) {
      throw new ValidationError("A single journal line cannot have both non-zero debit and credit.");
    }

    totalDebit = totalDebit.plus(d);
    totalCredit = totalCredit.plus(c);

    validatedLines.push({
      accountId: line.accountId,
      cashAccountId: line.cashAccountId,
      debit: d,
      credit: c,
      narration: line.narration,
    });
  }

  if (totalDebit.isZero()) {
    throw new InvariantViolationError("Total journal debit amount must be greater than zero.");
  }

  if (!totalDebit.equals(totalCredit)) {
    throw new InvariantViolationError(
      `Unbalanced journal entry rejected. Total debits (${totalDebit.toStorageString()}) must equal total credits (${totalCredit.toStorageString()}).`
    );
  }

  // --- Idempotency Check ---
  if (command.idempotencyKey) {
    const existing = await dbClient.idempotencyRecord.findUnique({
      where: {
        organizationId_operation_idempotencyKey: {
          organizationId: command.organizationId,
          operation: "JOURNAL_POST",
          idempotencyKey: command.idempotencyKey,
        },
      },
    });

    if (existing && existing.status === "COMPLETED" && existing.responsePayload) {
      const cached = JSON.parse(existing.responsePayload);
      const cachedEntry = await dbClient.journalEntry.findUnique({
        where: { id: cached.journalEntryId },
        include: { lines: { include: { account: true } } },
      });
      if (cachedEntry) {
        return cachedEntry;
      }
    }
  }

  // Execute in atomic transaction
  const executePosting = async (tx: Prisma.TransactionClient) => {
    // 1. Check Fiscal Period Locking
    const closedPeriod = await tx.fiscalPeriod.findFirst({
      where: {
        organizationId: command.organizationId,
        startDate: { lte: postingDate },
        endDate: { gte: postingDate },
        isClosed: true,
      },
    });

    if (closedPeriod) {
      throw new ForbiddenError(
        `Posting rejected: fiscal period "${closedPeriod.name}" is closed. Cannot post backdated transactions.`
      );
    }

    // 2. Fetch all involved accounts and verify organization scope
    const accountIds = Array.from(new Set(validatedLines.map((l) => l.accountId)));
    const accounts = await tx.chartOfAccount.findMany({
      where: {
        organizationId: command.organizationId,
        id: { in: accountIds },
      },
    });

    if (accounts.length !== accountIds.length) {
      throw new NotFoundError(
        "One or more chart of accounts not found in this organization."
      );
    }

    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    for (const acc of accounts) {
      if (!acc.isActive) {
        throw new ValidationError(`Account "${acc.code} - ${acc.name}" is inactive.`);
      }
    }

    // 3. Generate sequential entry number
    const entryNumber = await generateEntryNumber(command.organizationId, command.businessDate, tx);

    // 4. Create Journal Entry Header
    const journalEntry = await tx.journalEntry.create({
      data: {
        organizationId: command.organizationId,
        branchId: command.branchId || null,
        entryNumber,
        businessDate: command.businessDate,
        postingDate,
        sourceModule: command.sourceModule,
        sourceType: command.sourceType,
        sourceId: command.sourceId || null,
        description: command.description,
        postedById: caller.userId,
        status: "POSTED",
        totalDebit: totalDebit.amount,
        totalCredit: totalCredit.amount,
      },
    });

    // 5. Create Journal Lines and update account balance projections
    for (let i = 0; i < validatedLines.length; i++) {
      const line = validatedLines[i];
      const account = accountMap.get(line.accountId)!;

      await tx.journalLine.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: line.accountId,
          lineNumber: i + 1,
          debit: line.debit,
          credit: line.credit,
          narration: line.narration || null,
        },
      });

      // Update ChartOfAccount balance projection
      const delta = calculateAccountBalanceDelta(account.accountType, line.debit, line.credit);
      await tx.chartOfAccount.update({
        where: { id: account.id },
        data: {
          balance: {
            increment: delta,
          },
        },
      });

      // If specified or mapped to a CashAccount, update cash account balance projection
      let cashAcc = null;
      if (line.cashAccountId) {
        cashAcc = await tx.cashAccount.findUnique({
          where: { id: line.cashAccountId },
        });
      } else {
        cashAcc = await tx.cashAccount.findFirst({
          where: {
            organizationId: command.organizationId,
            chartOfAccountId: account.id,
          },
        });
      }

      if (cashAcc) {
        await tx.cashAccount.update({
          where: { id: cashAcc.id },
          data: {
            balance: {
              increment: delta,
            },
          },
        });
      }
    }

    // 6. Record idempotency if key provided
    if (command.idempotencyKey) {
      await tx.idempotencyRecord.upsert({
        where: {
          organizationId_operation_idempotencyKey: {
            organizationId: command.organizationId,
            operation: "JOURNAL_POST",
            idempotencyKey: command.idempotencyKey,
          },
        },
        update: {
          status: "COMPLETED",
          responsePayload: JSON.stringify({ journalEntryId: journalEntry.id }),
        },
        create: {
          organizationId: command.organizationId,
          operation: "JOURNAL_POST",
          idempotencyKey: command.idempotencyKey,
          status: "COMPLETED",
          responsePayload: JSON.stringify({ journalEntryId: journalEntry.id }),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days retention
        },
      });
    }

    // 7. Append audit event
    await recordAuditEvent(
      {
        organizationId: command.organizationId,
        actorId: caller.userId,
        action: "accounting.journal.posted",
        entityType: "JournalEntry",
        entityId: journalEntry.id,
        metadata: {
          entryNumber: journalEntry.entryNumber,
          sourceModule: command.sourceModule,
          sourceType: command.sourceType,
          totalAmount: totalDebit.toStorageString(),
        },
      },
      tx
    );

    return await tx.journalEntry.findUniqueOrThrow({
      where: { id: journalEntry.id },
      include: {
        lines: {
          include: { account: true },
          orderBy: { lineNumber: "asc" },
        },
      },
    });
  };

  if ("$transaction" in dbClient) {
    return await dbClient.$transaction(executePosting);
  }
  return await executePosting(dbClient as Prisma.TransactionClient);
}

/**
 * Reverses a posted journal entry, creating an immutable compensating opposite journal entry.
 */
export async function reverseJournalEntry(
  caller: AuthenticatedUser,
  command: ReverseJournalCommand,
  dbClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
) {
  requireOrganizationScope(caller, command.organizationId);
  requirePermission(caller, "accounting.ledger.read");

  if (!command.reversalReason || command.reversalReason.trim() === "") {
    throw new ValidationError("A reason must be provided to reverse a posted journal entry.");
  }

  const executeReversal = async (tx: Prisma.TransactionClient) => {
    const original = await tx.journalEntry.findUnique({
      where: { id: command.journalEntryId },
      include: { lines: { include: { account: true } } },
    });

    if (!original) {
      throw new NotFoundError("JournalEntry", command.journalEntryId);
    }

    requireOrganizationScope(caller, original.organizationId);

    if (original.status === "REVERSED") {
      throw new ConflictError(`Journal entry "${original.entryNumber}" has already been reversed.`);
    }

    // Create opposite lines: debits become credits, credits become debits
    const oppositeLines: JournalLineInput[] = original.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      narration: `Reversal of line ${l.lineNumber}: ${l.narration || ""}`.trim(),
    }));

    // Post reversal journal entry
    const reversalEntry = await postJournalEntry(
      caller,
      {
        organizationId: command.organizationId,
        branchId: original.branchId,
        businessDate: command.businessDate,
        sourceModule: "MANUAL",
        sourceType: "REVERSAL",
        sourceId: original.id,
        description: `Reversal of ${original.entryNumber}. Reason: ${command.reversalReason}`,
        lines: oppositeLines,
        idempotencyKey: command.idempotencyKey,
      },
      tx
    );

    // Link original entry and reversal entry
    await tx.journalEntry.update({
      where: { id: original.id },
      data: {
        status: "REVERSED",
        reversalOfId: reversalEntry.id,
        reversalReason: command.reversalReason,
      },
    });

    // Record audit event
    await recordAuditEvent(
      {
        organizationId: command.organizationId,
        actorId: caller.userId,
        action: "accounting.journal.reversed",
        entityType: "JournalEntry",
        entityId: original.id,
        metadata: {
          originalEntryNumber: original.entryNumber,
          reversalEntryNumber: reversalEntry.entryNumber,
          reason: command.reversalReason,
        },
      },
      tx
    );

    return reversalEntry;
  };

  if ("$transaction" in dbClient) {
    return await dbClient.$transaction(executeReversal);
  }
  return await executeReversal(dbClient as Prisma.TransactionClient);
}

