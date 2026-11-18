import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { createCollectionReceipt } from "./collection-receipt-service";

const generateSheetSchema = z.object({
  organizationId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  notes: z.string().max(300).optional(),
});

const collectItemSchema = z.object({
  organizationId: z.string().uuid(),
  sheetId: z.string().uuid(),
  itemId: z.string().uuid(),
  cashAccountId: z.string().uuid(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE"]),
  amount: z.string().refine((v) => Number(v) > 0, "Collection amount must be positive"),
  reference: z.string().optional(),
});

const reconcileSheetSchema = z.object({
  organizationId: z.string().uuid(),
  sheetId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export async function generateCollectionSheet(
  caller: AuthenticatedUser,
  input: z.infer<typeof generateSheetSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "collection.sheet.manage");

  const parsed = generateSheetSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid collection sheet request");
  }

  const payload = parsed.data;
  const targetDate = new Date(`${payload.businessDate}T23:59:59.999Z`);

  // Unique sequential sheet number: CS-YYYYMMDD-XXXX
  const dateStr = payload.businessDate.replace(/-/g, "");
  const count = await prisma.collectionSheet.count({
    where: {
      organizationId: payload.organizationId,
      sheetNumber: { startsWith: `CS-${dateStr}-` },
    },
  });
  const sheetNumber = `CS-${dateStr}-${(count + 1).toString().padStart(4, "0")}`;

  // Find eligible loans
  const loanWhere: Record<string, unknown> = {
    organizationId: payload.organizationId,
    status: "ACTIVE",
    installments: {
      some: {
        dueDate: { lte: targetDate },
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
    },
  };

  if (payload.groupId) {
    loanWhere.customer = {
      customerGroups: { some: { groupId: payload.groupId } },
    };
  } else if (payload.branchId) {
    loanWhere.customer = { branchId: payload.branchId };
  }

  const loans = await prisma.loanAccount.findMany({
    where: loanWhere,
    include: {
      customer: true,
      installments: {
        where: {
          dueDate: { lte: targetDate },
          status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        },
      },
    },
  });

  if (loans.length === 0) {
    throw new ValidationError(
      "No active loans have installments due on or before the specified date for this scope"
    );
  }

  let totalExpected = new Decimal(0);
  const itemsToCreate: Array<{
    organizationId: string;
    loanAccountId: string;
    customerId: string;
    expectedAmount: Decimal;
    status: string;
  }> = [];

  for (const loan of loans) {
    let loanExpected = new Decimal(0);
    for (const inst of loan.installments) {
      const unpaid = Decimal.max(
        0,
        new Decimal(inst.totalDue.toString()).minus(new Decimal(inst.totalPaid.toString()))
      );
      loanExpected = loanExpected.plus(unpaid);
    }

    if (loanExpected.gt(0)) {
      totalExpected = totalExpected.plus(loanExpected);
      itemsToCreate.push({
        organizationId: payload.organizationId,
        loanAccountId: loan.id,
        customerId: loan.customerId,
        expectedAmount: loanExpected,
        status: "PENDING",
      });
    }
  }

  return prisma.$transaction(async (tx) => {
    const sheet = await tx.collectionSheet.create({
      data: {
        organizationId: payload.organizationId,
        branchId: payload.branchId ?? null,
        groupId: payload.groupId ?? null,
        sheetNumber,
        businessDate: payload.businessDate,
        totalExpected,
        totalCollected: new Decimal(0),
        status: "DRAFT",
        generatedById: caller.userId,
        notes: payload.notes ?? null,
      },
    });

    await tx.collectionSheetItem.createMany({
      data: itemsToCreate.map((item) => ({
        ...item,
        collectionSheetId: sheet.id,
      })),
    });

    await recordAuditEvent(
      {
        organizationId: payload.organizationId,
        actorId: caller.userId,
        action: "collection.sheet.generated",
        entityType: "CollectionSheet",
        entityId: sheet.id,
        metadata: {
          sheetNumber,
          businessDate: payload.businessDate,
          totalExpected: totalExpected.toFixed(4),
          itemsCount: itemsToCreate.length,
        },
      },
      tx
    );

    return {
      ...sheet,
      itemsCount: itemsToCreate.length,
    };
  });
}

export async function getCollectionSheets(
  caller: AuthenticatedUser,
  options: {
    businessDate?: string;
    branchId?: string;
    groupId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  requirePermission(caller, "collection.sheet.manage");

  const where: Record<string, unknown> = {
    organizationId: caller.organizationId,
  };

  if (options.businessDate) where.businessDate = options.businessDate;
  if (options.branchId) where.branchId = options.branchId;
  if (options.groupId) where.groupId = options.groupId;
  if (options.status && options.status !== "ALL") where.status = options.status;

  const [items, total] = await Promise.all([
    prisma.collectionSheet.findMany({
      where,
      include: {
        branch: { select: { id: true, code: true, name: true } },
        group: { select: { id: true, code: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    }),
    prisma.collectionSheet.count({ where }),
  ]);

  return { items, total };
}

export async function getCollectionSheetById(caller: AuthenticatedUser, sheetId: string) {
  requirePermission(caller, "collection.sheet.manage");

  const sheet = await prisma.collectionSheet.findUnique({
    where: { id: sheetId },
    include: {
      branch: true,
      group: true,
      items: {
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              customerCode: true,
              phone: true,
            },
          },
          loanAccount: {
            select: {
              id: true,
              loanAccountNumber: true,
              principalOutstanding: true,
              status: true,
            },
          },
          receipt: {
            select: {
              id: true,
              receiptNumber: true,
              amount: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!sheet || sheet.organizationId !== caller.organizationId) {
    throw new NotFoundError("CollectionSheet", sheetId);
  }

  return sheet;
}

export async function collectSheetItem(
  caller: AuthenticatedUser,
  input: z.infer<typeof collectItemSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "collection.sheet.manage");

  const parsed = collectItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid collect item request");
  }

  const payload = parsed.data;

  const sheet = await prisma.collectionSheet.findUnique({
    where: { id: payload.sheetId },
    include: { items: true },
  });

  if (!sheet || sheet.organizationId !== payload.organizationId) {
    throw new NotFoundError("CollectionSheet", payload.sheetId);
  }

  if (sheet.status === "RECONCILED") {
    throw new ValidationError("Cannot record collections on a reconciled sheet");
  }

  const item = sheet.items.find((i) => i.id === payload.itemId);
  if (!item) {
    throw new NotFoundError("CollectionSheetItem", payload.itemId);
  }

  // Generate unique receipt number
  const receiptNumber = `RCPT-${sheet.sheetNumber.slice(3)}-${Date.now().toString().slice(-4)}`;

  // Post receipt via collection receipt service
  const receiptResult = await createCollectionReceipt(caller, {
    organizationId: payload.organizationId,
    loanAccountId: item.loanAccountId,
    cashAccountId: payload.cashAccountId,
    receiptNumber,
    businessDate: sheet.businessDate,
    amount: payload.amount,
    paymentMethod: payload.paymentMethod,
    reference: payload.reference ?? `Sheet: ${sheet.sheetNumber}`,
  });

  const collectedAmount = new Decimal(payload.amount);
  const newCollectedTotal = new Decimal(item.collectedAmount).plus(collectedAmount);
  const expected = new Decimal(item.expectedAmount);
  const newStatus = newCollectedTotal.gte(expected) ? "COLLECTED" : "PARTIALLY_COLLECTED";

  // Update item and sheet
  await prisma.collectionSheetItem.update({
    where: { id: item.id },
    data: {
      collectedAmount: newCollectedTotal,
      status: newStatus,
      receiptId: receiptResult.id,
    },
  });

  await prisma.collectionSheet.update({
    where: { id: sheet.id },
    data: {
      totalCollected: { increment: collectedAmount },
      status: "IN_PROGRESS",
    },
  });

  return {
    success: true,
    receipt: receiptResult,
    itemStatus: newStatus,
  };
}

export async function reconcileCollectionSheet(
  caller: AuthenticatedUser,
  input: z.infer<typeof reconcileSheetSchema>
) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "collection.sheet.manage");

  const parsed = reconcileSheetSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid reconcile request");
  }

  const payload = parsed.data;

  const sheet = await prisma.collectionSheet.findUnique({
    where: { id: payload.sheetId },
    include: { items: true },
  });

  if (!sheet || sheet.organizationId !== payload.organizationId) {
    throw new NotFoundError("CollectionSheet", payload.sheetId);
  }

  if (sheet.status === "RECONCILED") {
    throw new ValidationError("Collection sheet is already reconciled");
  }

  const updated = await prisma.collectionSheet.update({
    where: { id: sheet.id },
    data: {
      status: "RECONCILED",
      reconciledById: caller.userId,
      reconciledAt: new Date(),
      notes: payload.notes ? `${sheet.notes ? sheet.notes + "\n" : ""}${payload.notes}` : sheet.notes,
    },
  });

  await recordAuditEvent({
    organizationId: payload.organizationId,
    actorId: caller.userId,
    action: "collection.sheet.reconciled",
    entityType: "CollectionSheet",
    entityId: sheet.id,
    metadata: {
      sheetNumber: sheet.sheetNumber,
      totalExpected: sheet.totalExpected.toString(),
      totalCollected: sheet.totalCollected.toString(),
    },
  });

  return updated;
}

