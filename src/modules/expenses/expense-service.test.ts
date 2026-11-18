import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createExpenseCategory,
  getExpenseCategories,
  createExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  postExpensePayment,
  reverseExpensePayment,
  getExpenses,
  getExpenseById,
  getExpenseSummary,
} from "./expense-service";
import { ValidationError } from "@/lib/errors/app-error";
import Decimal from "decimal.js";
import { readStoredFile } from "@/lib/storage/storage-provider";

describe("Expense workflow", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let cashAccountId: string;
  let rentCoaId: string;
  let categoryId: string;
  let postedExpenseId: string;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const cashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
    });
    cashAccountId = cashAccount.id;

    const rentCoa = await prisma.chartOfAccount.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: adminUser.organizationId,
          code: "5001",
        },
      },
    });
    rentCoaId = rentCoa.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("configures expense categories mapped to Chart of Accounts", async () => {
    const category = await createExpenseCategory(adminUser, {
      organizationId: adminUser.organizationId,
      code: "RENT",
      name: "Office Rent & Premises",
      description: "Branch office premises monthly lease payments",
      chartOfAccountId: rentCoaId,
    });

    categoryId = category.id;
    expect(category.code).toBe("RENT");
    expect(category.chartOfAccountId).toBe(rentCoaId);

    const categories = await getExpenseCategories(adminUser);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.some((c) => c.code === "RENT")).toBe(true);
  });

  it("handles expense lifecycle: draft -> submit -> reject -> resubmit -> approve", async () => {
    const expense = await createExpense(adminUser, {
      organizationId: adminUser.organizationId,
      categoryId,
      category: "Office Rent",
      amount: "3500.0000",
      expenseDate: "2026-10-22",
      payee: "City Commercial Properties",
      paymentMethod: "CASH",
      description: "Monthly premises lease payment",
      supportingRef: "RENT-INV-202610",
    });

    expect(expense.status).toBe("DRAFT");

    // Submit for review
    const submitted = await submitExpense(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
    });
    expect(submitted.status).toBe("SUBMITTED");

    // Reject with reason
    const rejected = await rejectExpense(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      rejectionReason: "Invoice reference requires verified stamp",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Invoice reference requires verified stamp");

    // Cannot approve directly from rejected state
    await expect(
      approveExpense(adminUser, {
        organizationId: adminUser.organizationId,
        expenseId: expense.id,
      })
    ).rejects.toThrow(ValidationError);

    // Resubmit
    const resubmitted = await submitExpense(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
    });
    expect(resubmitted.status).toBe("SUBMITTED");

    // Approve
    const approved = await approveExpense(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      reason: "Verified stamped invoice attached",
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvalReason).toBe("Verified stamped invoice attached");
  });

  it("posts an approved expense payment with atomic balanced General Ledger journal entry", async () => {
    const expense = await createExpense(adminUser, {
      organizationId: adminUser.organizationId,
      categoryId,
      category: "Office Rent",
      amount: "2500.0000",
      expenseDate: "2026-10-22",
      payee: "Office Landlord",
      paymentMethod: "CASH",
      description: "Monthly office rent",
      supportingRef: "INV-1001",
      autoSubmit: true,
    });

    expect(expense.status).toBe("SUBMITTED");

    await approveExpense(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      reason: "Approved for payment",
    });

    const cashBefore = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashAccountId } });

    const posted = await postExpensePayment(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      cashAccountId,
      paymentReference: `EXP-PAY-${Date.now().toString().slice(-6)}`,
      amount: "2500.0000",
    });

    postedExpenseId = posted.id;
    expect(posted.status).toBe("POSTED");
    expect(posted.journalEntryId).toBeDefined();

    // Verify cash balance decremented accurately
    const cashAfter = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    const expectedCash = new Decimal(cashBefore.balance).minus(2500);
    expect(new Decimal(cashAfter.balance).equals(expectedCash)).toBe(true);

    // Verify balanced GL entry exists
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: posted.journalEntryId! },
      include: { lines: true },
    });

    expect(journal.sourceModule).toBe("EXPENSES");
    expect(journal.sourceType).toBe("EXPENSE_PAYMENT");
    expect(journal.lines.length).toBe(2);

    const totalDebit = journal.lines.reduce((s, l) => s.plus(new Decimal(l.debit)), new Decimal(0));
    const totalCredit = journal.lines.reduce((s, l) => s.plus(new Decimal(l.credit)), new Decimal(0));
    expect(totalDebit.equals(2500)).toBe(true);
    expect(totalCredit.equals(2500)).toBe(true);
  });

  it("reverses a posted expense payment and restores cash balance with balanced reversal journal", async () => {
    const cashBefore = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashAccountId } });

    const reversed = await reverseExpensePayment(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: postedExpenseId,
      reversalReason: "Incorrect payee information entered on voucher",
    });

    expect(reversed.status).toBe("REVERSED");
    expect(reversed.isReversed).toBe(true);
    expect(reversed.reversalJournalEntryId).toBeDefined();

    // Verify cash balance restored
    const cashAfter = await prisma.cashAccount.findUniqueOrThrow({ where: { id: cashAccountId } });
    const expectedCash = new Decimal(cashBefore.balance).plus(2500);
    expect(new Decimal(cashAfter.balance).equals(expectedCash)).toBe(true);

    // Reversing an already reversed expense must be rejected
    await expect(
      reverseExpensePayment(adminUser, {
        organizationId: adminUser.organizationId,
        expenseId: postedExpenseId,
        reversalReason: "Duplicate reversal attempt",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("retrieves expense list, individual detail, and portfolio summary", async () => {
    const list = await getExpenses(adminUser, { limit: 10 });
    expect(list.total).toBeGreaterThan(0);
    expect(list.items.length).toBeGreaterThan(0);

    const detail = await getExpenseById(adminUser, postedExpenseId);
    expect(detail.id).toBe(postedExpenseId);
    expect(detail.isReversed).toBe(true);

    const summary = await getExpenseSummary(adminUser);
    expect(summary).toBeDefined();
    expect(summary.reversedCount).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid amount or unapproved expenses", async () => {
    await expect(
      createExpense(adminUser, {
        organizationId: adminUser.organizationId,
        category: "Invalid",
        amount: "0.0000",
        expenseDate: "2026-10-22",
        payee: "Vendor",
        paymentMethod: "CASH",
        description: "Bad amount",
      })
    ).rejects.toThrow(ValidationError);

    const draftExpense = await createExpense(adminUser, {
      organizationId: adminUser.organizationId,
      category: "Utilities",
      amount: "1200.0000",
      expenseDate: "2026-10-22",
      payee: "Utility Co",
      paymentMethod: "BANK_TRANSFER",
      description: "Utility bill",
    });

    await expect(
      postExpensePayment(adminUser, {
        organizationId: adminUser.organizationId,
        expenseId: draftExpense.id,
        cashAccountId,
        paymentReference: `EXP-${Date.now().toString().slice(-8)}`,
        amount: "1200.0000",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("records an expense with a PDF voucher attachment and verifies storage & retrieval", async () => {
    const pdfContent = Buffer.from("%PDF-1.4 Mock Expense Voucher PDF Content");
    const expense = await createExpense(adminUser, {
      organizationId: adminUser.organizationId,
      categoryId,
      category: "Office Rent",
      amount: "4200.0000",
      expenseDate: "2026-10-23",
      payee: "Metro Office Rentals",
      paymentMethod: "BANK_TRANSFER",
      description: "October lease payment with invoice",
      supportingRef: "LEASE-OCT-2026",
      attachmentFile: {
        fileName: "october_lease_bill.pdf",
        mimeType: "application/pdf",
        buffer: pdfContent,
      },
    });

    expect(expense.attachmentFileName).toBe("october_lease_bill.pdf");
    expect(expense.attachmentMimeType).toBe("application/pdf");
    expect(expense.attachmentFileSize).toBe(pdfContent.length);
    expect(expense.attachmentStoragePath).toBeDefined();

    // Verify stored file content matches
    const storedBuffer = await readStoredFile(expense.attachmentStoragePath!);
    expect(storedBuffer.equals(pdfContent)).toBe(true);

    // Verify detail retrieval includes attachment fields
    const fetched = await getExpenseById(adminUser, expense.id);
    expect(fetched.attachmentFileName).toBe("october_lease_bill.pdf");
    expect(fetched.attachmentFileSize).toBe(pdfContent.length);
  });

  it("records an expense with an image voucher attachment and verifies storage & retrieval", async () => {
    const imgContent = Buffer.from("fake-png-image-binary-data");
    const expense = await createExpense(adminUser, {
      organizationId: adminUser.organizationId,
      categoryId,
      category: "Office Rent",
      amount: "850.0000",
      expenseDate: "2026-10-23",
      payee: "Hardware Supply Depot",
      paymentMethod: "CASH",
      description: "Office repair supplies receipt",
      attachmentFile: {
        fileName: "receipt_receipt.png",
        mimeType: "image/png",
        buffer: imgContent,
      },
    });

    expect(expense.attachmentFileName).toBe("receipt_receipt.png");
    expect(expense.attachmentMimeType).toBe("image/png");
    expect(expense.attachmentFileSize).toBe(imgContent.length);

    const storedBuffer = await readStoredFile(expense.attachmentStoragePath!);
    expect(storedBuffer.equals(imgContent)).toBe(true);
  });

  it("rejects unsupported attachment file extensions or oversized files for expense vouchers", async () => {
    // Unsupported format (e.g. zip)
    await expect(
      createExpense(adminUser, {
        organizationId: adminUser.organizationId,
        category: "Office Rent",
        amount: "500.0000",
        expenseDate: "2026-10-23",
        payee: "Test Vendor",
        paymentMethod: "CASH",
        attachmentFile: {
          fileName: "dangerous_archive.zip",
          mimeType: "application/zip",
          buffer: Buffer.from("mock-zip"),
        },
      })
    ).rejects.toThrow(ValidationError);

    // Oversized (> 10MB)
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 10);
    await expect(
      createExpense(adminUser, {
        organizationId: adminUser.organizationId,
        category: "Office Rent",
        amount: "500.0000",
        expenseDate: "2026-10-23",
        payee: "Test Vendor",
        paymentMethod: "CASH",
        attachmentFile: {
          fileName: "huge_bill.pdf",
          mimeType: "application/pdf",
          buffer: oversizedBuffer,
        },
      })
    ).rejects.toThrow(/exceeds the maximum allowed limit/);
  });
});
