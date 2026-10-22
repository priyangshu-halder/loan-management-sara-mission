import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createExpense, approveExpense, postExpensePayment } from "./expense-service";
import { ValidationError } from "@/lib/errors/app-error";

describe("Expense workflow", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let cashAccountId: string;

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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates, approves, and posts an expense payment when authorized", async () => {
    const expense = await createExpense(adminUser, {
      organizationId: adminUser.organizationId,
      category: "Office Rent",
      amount: "2500.0000",
      expenseDate: "2026-10-22",
      payee: "Office Landlord",
      paymentMethod: "CASH",
      description: "Monthly office rent",
      supportingRef: "INV-1001",
    });

    expect(expense.status).toBe("DRAFT");

    const approved = await approveExpense(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      reason: "Approved for payment",
    });

    expect(approved.status).toBe("APPROVED");

    const posted = await postExpensePayment(adminUser, {
      organizationId: adminUser.organizationId,
      expenseId: expense.id,
      cashAccountId,
      paymentReference: `EXP-${Date.now().toString().slice(-8)}`,
      amount: "2500.0000",
    });

    expect(posted.status).toBe("POSTED");
    expect(posted.amount).toBe("2500.0000");
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
});
