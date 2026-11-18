import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import {
  requireOrganizationScope,
  requirePermission,
} from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import {
  postJournalEntry,
  reverseJournalEntry,
  JournalLineInput,
} from "@/modules/accounting/posting-service";
import { getTodayBusinessDate } from "@/lib/dates/dates";

const openSavingsAccountSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  accountNumber: z.string().min(3).max(60),
  productName: z.string().min(2).max(80).default("General Savings"),
  minBalance: z.string().refine((v) => Number(v) >= 0).default("0.0000"),
  interestRate: z.string().refine((v) => Number(v) >= 0).default("3.5000"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const depositSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.string().refine((v) => Number(v) > 0, "Deposit amount must be positive"),
  transactionRef: z.string().min(3).max(60),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cashAccountId: z.string().uuid().optional(),
  note: z.string().min(2).max(200).optional(),
});

const withdrawalSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  amount: z.string().refine((v) => Number(v) > 0, "Withdrawal amount must be positive"),
  transactionRef: z.string().min(3).max(60),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cashAccountId: z.string().uuid().optional(),
  note: z.string().min(2).max(200).optional(),
});

const reverseTransactionSchema = z.object({
  organizationId: z.string().uuid(),
  transactionId: z.string().uuid(),
  reversalReason: z.string().min(5).max(300),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const postInterestSchema = z.object({
  organizationId: z.string().uuid(),
  accountId: z.string().uuid(),
  accrualPeriod: z.string().regex(/^\d{4}-\d{2}$/), // e.g. "2026-10"
  calculationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  daysCount: z.number().int().min(1).max(366).default(30),
});

/**
 * Opens a new savings account for a registered member.
 */
export async function openSavingsAccount(
  caller: AuthenticatedUser,
  input: z.input<typeof openSavingsAccountSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.account.manage");

  const parsed = openSavingsAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid savings account payload");
  }

  const payload = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer || customer.organizationId !== payload.organizationId) {
    throw new NotFoundError("Customer", payload.customerId);
  }

  const existingAccount = await prisma.savingsAccount.findFirst({
    where: { organizationId: payload.organizationId, accountNumber: payload.accountNumber },
  });

  if (existingAccount) {
    throw new ValidationError("Savings account number already exists");
  }

  const account = await prisma.savingsAccount.create({
    data: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      accountNumber: payload.accountNumber,
      productName: payload.productName,
      minBalance: payload.minBalance,
      interestRate: payload.interestRate,
      balance: "0.0000",
      status: payload.status,
    },
    include: {
      customer: true,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "savings.account.opened",
    entityType: "SavingsAccount",
    entityId: account.id,
    metadata: {
      accountNumber: payload.accountNumber,
      customerId: payload.customerId,
      productName: payload.productName,
    },
  });

  return account;
}

/**
 * Deposits funds into an active savings account, creates a savings transaction,
 * and atomically posts balanced General Ledger entries (Debit Cash, Credit Savings Liability).
 */
export async function depositToSavingsAccount(
  caller: AuthenticatedUser,
  input: z.input<typeof depositSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.deposit.create");

  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid deposit request");
  }

  const payload = parsed.data;
  const businessDate = payload.businessDate || getTodayBusinessDate();

  return prisma.$transaction(async (tx) => {
    // Acquire row-level pessimistic lock for update
    const [lockedAccount] = await tx.$queryRaw<
      Array<{ id: string; organizationId: string; balance: string; minBalance: string | null; status: string }>
    >`SELECT id, organizationId, balance, minBalance, status FROM savings_accounts WHERE id = ${payload.accountId} FOR UPDATE`;

    if (!lockedAccount || lockedAccount.organizationId !== payload.organizationId) {
      throw new NotFoundError("SavingsAccount", payload.accountId);
    }

    if (lockedAccount.status !== "ACTIVE") {
      throw new ForbiddenError("Only active savings accounts can receive deposits");
    }

    const duplicateRef = await tx.savingsTransaction.findFirst({
      where: { organizationId: payload.organizationId, transactionRef: payload.transactionRef },
    });

    if (duplicateRef) {
      throw new ValidationError("Duplicate transaction reference is not allowed");
    }

    const account = await tx.savingsAccount.findUnique({
      where: { id: payload.accountId },
      include: { customer: true },
    });

    if (!account) {
      throw new NotFoundError("SavingsAccount", payload.accountId);
    }

    const depositAmount = new Decimal(payload.amount);
    const balanceAfter = new Decimal(lockedAccount.balance).plus(depositAmount);

    let journalEntryId: string | null = null;
    let cashAccountIdToRecord: string | null = null;

    // Resolve Cash Account & Chart of Accounts
    let cashAccount = null;
    if (payload.cashAccountId) {
      cashAccount = await tx.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
      if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
        throw new NotFoundError("CashAccount", payload.cashAccountId);
      }
    } else {
      cashAccount = await tx.cashAccount.findFirst({
        where: { organizationId: payload.organizationId, isActive: true },
      });
    }

    if (cashAccount) {
      cashAccountIdToRecord = cashAccount.id;
    }

    // Lookup 2001 Member Savings Deposit Liability
    const savingsCoa = await tx.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "2001" } },
    });

    if (cashAccount && savingsCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: cashAccount.chartOfAccountId,
          debit: depositAmount,
          credit: 0,
          narration: `Member savings deposit (${payload.transactionRef}) - ${account.accountNumber}`,
        },
        {
          accountId: savingsCoa.id,
          debit: 0,
          credit: depositAmount,
          narration: `Savings liability credit for ${account.customer.fullName} (${account.accountNumber})`,
        },
      ];

      const journal = await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate,
          sourceModule: "SAVINGS",
          sourceType: "SAVINGS_DEPOSIT",
          sourceId: account.id,
          description: `Savings deposit ${payload.transactionRef} for ${account.accountNumber}`,
          idempotencyKey: `SAV-DEP-${payload.transactionRef}`,
          lines: journalLines,
        },
        tx
      );
      journalEntryId = journal.id;
    }

    const transaction = await tx.savingsTransaction.create({
      data: {
        organizationId: payload.organizationId,
        accountId: payload.accountId,
        type: "DEPOSIT",
        amount: depositAmount.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        businessDate,
        cashAccountId: cashAccountIdToRecord,
        journalEntryId,
        transactionRef: payload.transactionRef,
        note: payload.note ?? null,
        status: "POSTED",
      },
      include: {
        account: true,
        cashAccount: true,
      },
    });

    await tx.savingsAccount.update({
      where: { id: payload.accountId },
      data: { balance: balanceAfter.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "savings.deposit.posted",
        entityType: "SavingsTransaction",
        entityId: transaction.id,
        metadata: {
          accountId: payload.accountId,
          amount: depositAmount.toFixed(4),
          balanceAfter: balanceAfter.toFixed(4),
          transactionRef: payload.transactionRef,
          journalEntryId,
        },
      },
      tx
    );

    return transaction;
  });
}

/**
 * Withdraws funds from an active savings account after validating balance and minimum thresholds.
 * Atomically posts balanced General Ledger entries (Debit Savings Liability, Credit Cash).
 */
export async function withdrawFromSavingsAccount(
  caller: AuthenticatedUser,
  input: z.input<typeof withdrawalSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.withdrawal.approve");

  const parsed = withdrawalSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid withdrawal request");
  }

  const payload = parsed.data;
  const businessDate = payload.businessDate || getTodayBusinessDate();

  return prisma.$transaction(async (tx) => {
    // Acquire row-level pessimistic lock for update
    const [lockedAccount] = await tx.$queryRaw<
      Array<{ id: string; organizationId: string; balance: string; minBalance: string | null; status: string }>
    >`SELECT id, organizationId, balance, minBalance, status FROM savings_accounts WHERE id = ${payload.accountId} FOR UPDATE`;

    if (!lockedAccount || lockedAccount.organizationId !== payload.organizationId) {
      throw new NotFoundError("SavingsAccount", payload.accountId);
    }

    if (lockedAccount.status !== "ACTIVE") {
      throw new ForbiddenError("Only active savings accounts can be withdrawn from");
    }

    const duplicateRef = await tx.savingsTransaction.findFirst({
      where: { organizationId: payload.organizationId, transactionRef: payload.transactionRef },
    });

    if (duplicateRef) {
      throw new ValidationError("Duplicate transaction reference is not allowed");
    }

    const withdrawalAmount = new Decimal(payload.amount);
    const currentBalance = new Decimal(lockedAccount.balance);
    const minBalance = new Decimal(lockedAccount.minBalance || 0);

    if (withdrawalAmount.gt(currentBalance.minus(minBalance))) {
      throw new ValidationError("Withdrawal amount exceeds available savings balance");
    }

    const balanceAfter = currentBalance.minus(withdrawalAmount);

    const account = await tx.savingsAccount.findUnique({
      where: { id: payload.accountId },
      include: { customer: true },
    });

    if (!account) {
      throw new NotFoundError("SavingsAccount", payload.accountId);
    }

    let journalEntryId: string | null = null;
    let cashAccountIdToRecord: string | null = null;

    let cashAccount = null;
    if (payload.cashAccountId) {
      cashAccount = await tx.cashAccount.findUnique({ where: { id: payload.cashAccountId } });
      if (!cashAccount || cashAccount.organizationId !== payload.organizationId) {
        throw new NotFoundError("CashAccount", payload.cashAccountId);
      }
    } else {
      cashAccount = await tx.cashAccount.findFirst({
        where: { organizationId: payload.organizationId, isActive: true },
      });
    }

    if (cashAccount) {
      cashAccountIdToRecord = cashAccount.id;
    }

    const savingsCoa = await tx.chartOfAccount.findUnique({
      where: { organizationId_code: { organizationId: payload.organizationId, code: "2001" } },
    });

    if (cashAccount && savingsCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: savingsCoa.id,
          debit: withdrawalAmount,
          credit: 0,
          narration: `Member savings withdrawal (${payload.transactionRef}) - ${account.accountNumber}`,
        },
        {
          accountId: cashAccount.chartOfAccountId,
          debit: 0,
          credit: withdrawalAmount,
          narration: `Cash payout for savings withdrawal to ${account.customer.fullName} (${account.accountNumber})`,
        },
      ];

      const journal = await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate,
          sourceModule: "SAVINGS",
          sourceType: "SAVINGS_WITHDRAWAL",
          sourceId: account.id,
          description: `Savings withdrawal ${payload.transactionRef} for ${account.accountNumber}`,
          idempotencyKey: `SAV-WD-${payload.transactionRef}`,
          lines: journalLines,
        },
        tx
      );
      journalEntryId = journal.id;
    }

    const transaction = await tx.savingsTransaction.create({
      data: {
        organizationId: payload.organizationId,
        accountId: payload.accountId,
        type: "WITHDRAWAL",
        amount: withdrawalAmount.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        businessDate,
        cashAccountId: cashAccountIdToRecord,
        journalEntryId,
        transactionRef: payload.transactionRef,
        note: payload.note ?? null,
        status: "POSTED",
      },
      include: {
        account: true,
        cashAccount: true,
      },
    });

    await tx.savingsAccount.update({
      where: { id: payload.accountId },
      data: { balance: balanceAfter.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "savings.withdrawal.posted",
        entityType: "SavingsTransaction",
        entityId: transaction.id,
        metadata: {
          accountId: payload.accountId,
          amount: withdrawalAmount.toFixed(4),
          balanceAfter: balanceAfter.toFixed(4),
          transactionRef: payload.transactionRef,
          journalEntryId,
        },
      },
      tx
    );

    return transaction;
  });
}

/**
 * Reverses a posted savings deposit or withdrawal with linked compensating General Ledger entries.
 */
export async function reverseSavingsTransaction(
  caller: AuthenticatedUser,
  input: z.input<typeof reverseTransactionSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "savings.withdrawal.approve");

  const parsed = reverseTransactionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid reversal payload");
  }

  const payload = parsed.data;
  const businessDate = payload.businessDate || getTodayBusinessDate();

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.savingsTransaction.findUnique({
      where: { id: payload.transactionId },
      include: { account: true },
    });

    if (!transaction || transaction.organizationId !== payload.organizationId) {
      throw new NotFoundError("SavingsTransaction", payload.transactionId);
    }

    if (transaction.isReversed || transaction.status === "REVERSED") {
      throw new ValidationError("Savings transaction has already been reversed");
    }

    // Acquire row-level pessimistic lock for update
    const [lockedAccount] = await tx.$queryRaw<
      Array<{ id: string; organizationId: string; balance: string; minBalance: string | null; status: string }>
    >`SELECT id, organizationId, balance, minBalance, status FROM savings_accounts WHERE id = ${transaction.accountId} FOR UPDATE`;

    if (!lockedAccount) {
      throw new NotFoundError("SavingsAccount", transaction.accountId);
    }

    const txAmount = new Decimal(transaction.amount);
    const currentBalance = new Decimal(lockedAccount.balance);

    // If reversing a deposit, verify the balance will not become negative
    if (transaction.type === "DEPOSIT") {
      if (currentBalance.minus(txAmount).isNegative()) {
        throw new ValidationError("Cannot reverse deposit: account has insufficient balance to absorb reversal");
      }
    }

    const newBalance = transaction.type === "DEPOSIT"
      ? currentBalance.minus(txAmount)
      : currentBalance.plus(txAmount);

    let reversalJournalId: string | null = null;

    if (transaction.journalEntryId) {
      const reversalJournal = await reverseJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          journalEntryId: transaction.journalEntryId,
          reversalReason: `Reversing savings ${transaction.type.toLowerCase()} ${transaction.transactionRef}: ${payload.reversalReason}`,
          businessDate,
          idempotencyKey: `REV-SAV-${transaction.id}`,
        },
        tx
      );
      reversalJournalId = reversalJournal.id;
    }

    const updatedTransaction = await tx.savingsTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "REVERSED",
        isReversed: true,
        reversedAt: new Date(),
        reversedById: caller.userId,
        reversalReason: payload.reversalReason,
        reversalJournalEntryId: reversalJournalId,
      },
    });

    await tx.savingsAccount.update({
      where: { id: transaction.accountId },
      data: { balance: newBalance.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "savings.transaction.reversed",
        entityType: "SavingsTransaction",
        entityId: transaction.id,
        metadata: {
          accountId: transaction.accountId,
          reversedAmount: transaction.amount,
          balanceAfterReversal: newBalance.toFixed(4),
          reversalReason: payload.reversalReason,
          reversalJournalId,
        },
      },
      tx
    );

    return updatedTransaction;
  });
}

/**
 * Calculates and posts periodic interest to an active savings account.
 * Guaranteed idempotent per account and accrual period (e.g. "2026-10").
 */
export async function postSavingsInterest(
  caller: AuthenticatedUser,
  input: z.input<typeof postInterestSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "deposit.interest.post");

  const parsed = postInterestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid savings interest payload");
  }

  const payload = parsed.data;
  const calculationDate = payload.calculationDate || getTodayBusinessDate();
  const accrualKey = `${payload.organizationId}:SAVINGS:${payload.accountId}:${payload.accrualPeriod}`;

  return prisma.$transaction(async (tx) => {
    const existingPosting = await tx.depositInterestPosting.findUnique({
      where: { accrualKey },
    });
    if (existingPosting) {
      throw new ValidationError(`Interest for savings account has already been posted for period ${payload.accrualPeriod}`);
    }

    // Acquire row-level pessimistic lock for update
    const [lockedAccount] = await tx.$queryRaw<
      Array<{ id: string; organizationId: string; balance: string; interestRate: string | null; status: string }>
    >`SELECT id, organizationId, balance, interestRate, status FROM savings_accounts WHERE id = ${payload.accountId} FOR UPDATE`;

    if (!lockedAccount || lockedAccount.organizationId !== payload.organizationId) {
      throw new NotFoundError("SavingsAccount", payload.accountId);
    }

    const currentBalance = new Decimal(lockedAccount.balance);
    const annualRate = new Decimal(lockedAccount.interestRate || "3.5000");

    if (currentBalance.lte(0) || annualRate.lte(0)) {
      throw new ValidationError("Account balance or interest rate is zero; no interest to post");
    }

    // Interest = Principal * (Rate / 100) * (Days / 365)
    const daysDecimal = new Decimal(payload.daysCount);
    const interestAmount = currentBalance
      .times(annualRate)
      .div(100)
      .times(daysDecimal)
      .div(365)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    if (interestAmount.lte(0)) {
      throw new ValidationError("Calculated interest amount is less than 0.0001");
    }

    const balanceAfter = currentBalance.plus(interestAmount);

    const account = await tx.savingsAccount.findUnique({
      where: { id: payload.accountId },
      include: { customer: true },
    });
    if (!account) {
      throw new NotFoundError("SavingsAccount", payload.accountId);
    }

    let journalEntryId: string | null = null;

    // Lookup 5004 Interest Expense on Member Deposits & 2001 Member Savings Liability
    const [intExpCoa, savingsCoa] = await Promise.all([
      tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: "5004" } },
      }),
      tx.chartOfAccount.findUnique({
        where: { organizationId_code: { organizationId: payload.organizationId, code: "2001" } },
      }),
    ]);

    if (intExpCoa && savingsCoa) {
      const journalLines: JournalLineInput[] = [
        {
          accountId: intExpCoa.id,
          debit: interestAmount,
          credit: 0,
          narration: `Periodic savings interest expense (${payload.accrualPeriod}) for ${account.accountNumber}`,
        },
        {
          accountId: savingsCoa.id,
          debit: 0,
          credit: interestAmount,
          narration: `Savings interest credit for ${account.customer.fullName} (${account.accountNumber})`,
        },
      ];

      const journal = await postJournalEntry(
        caller,
        {
          organizationId: payload.organizationId,
          businessDate: calculationDate,
          sourceModule: "SAVINGS",
          sourceType: "INTEREST_POSTING",
          sourceId: account.id,
          description: `Savings interest for ${account.accountNumber} (${payload.accrualPeriod})`,
          idempotencyKey: `SAV-INT-${accrualKey}`,
          lines: journalLines,
        },
        tx
      );
      journalEntryId = journal.id;
    }

    const posting = await tx.depositInterestPosting.create({
      data: {
        organizationId: payload.organizationId,
        savingsAccountId: account.id,
        accountType: "SAVINGS",
        accrualPeriod: payload.accrualPeriod,
        accrualKey,
        calculationDate,
        rateApplied: annualRate.toFixed(4),
        interestAmount: interestAmount.toFixed(4),
        balanceBasis: currentBalance.toFixed(4),
        journalEntryId,
        status: "POSTED",
      },
    });

    const txRef = `INT-${payload.accrualPeriod.replace("-", "")}-${Date.now().toString().slice(-4)}`;
    await tx.savingsTransaction.create({
      data: {
        organizationId: payload.organizationId,
        accountId: account.id,
        type: "INTEREST",
        amount: interestAmount.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        businessDate: calculationDate,
        journalEntryId,
        transactionRef: txRef,
        note: `Periodic interest credit for period ${payload.accrualPeriod}`,
        status: "POSTED",
      },
    });

    await tx.savingsAccount.update({
      where: { id: account.id },
      data: { balance: balanceAfter.toFixed(4) },
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "savings.interest.posted",
        entityType: "DepositInterestPosting",
        entityId: posting.id,
        metadata: {
          accountId: account.id,
          accrualPeriod: payload.accrualPeriod,
          interestAmount: interestAmount.toFixed(4),
          balanceAfter: balanceAfter.toFixed(4),
          journalEntryId,
        },
      },
      tx
    );

    return posting;
  });
}

/**
 * Retrieves savings accounts with pagination and filters.
 */
export async function getSavingsAccounts(
  caller: AuthenticatedUser,
  options: {
    status?: string;
    customerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  requirePermission(caller, "savings.account.manage");

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
      { accountNumber: { contains: options.search } },
      { customer: { fullName: { contains: options.search } } },
      { customer: { customerCode: { contains: options.search } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.savingsAccount.findMany({
      where,
      include: {
        customer: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.savingsAccount.count({ where }),
  ]);

  return { items, total };
}

/**
 * Retrieves savings account details including its transaction history.
 */
export async function getSavingsAccountById(caller: AuthenticatedUser, accountId: string) {
  requirePermission(caller, "savings.account.manage");

  const account = await prisma.savingsAccount.findUnique({
    where: { id: accountId },
    include: {
      customer: true,
      transactions: {
        include: { cashAccount: true },
        orderBy: { createdAt: "desc" },
      },
      interestPostings: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!account || account.organizationId !== caller.organizationId) {
    throw new NotFoundError("SavingsAccount", accountId);
  }

  return account;
}
