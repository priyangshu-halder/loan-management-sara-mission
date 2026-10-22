import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createCollectionReceipt, allocateReceiptToLoan } from "./collection-receipt-service";
import { ValidationError, ForbiddenError } from "@/lib/errors/app-error";

describe("Collection receipt and allocation", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let loanAccountId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        customerCode: `COLL-CUST-${Date.now().toString().slice(-6)}`,
        fullName: "Collection Customer",
        phone: `+91-${Date.now().toString().slice(-9)}`,
        email: `collection.${Date.now().toString().slice(-6)}@example.com`,
        status: "ACTIVE",
      },
    });

    const scheme = await prisma.loanScheme.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `COLL-SCHEME-${Date.now().toString().slice(-6)}`,
        name: "Collection Scheme",
        status: "PUBLISHED",
        versions: {
          create: [
            {
              versionNumber: 1,
              minPrincipal: "5000.0000",
              maxPrincipal: "200000.0000",
              termMonths: 12,
              interestRate: "12.0000",
              interestMethod: "REDUCING_BALANCE",
              repaymentFrequency: "MONTHLY",
              gracePeriodDays: 0,
              status: "PUBLISHED",
              isPublished: true,
              effectiveDate: new Date("2026-10-01T00:00:00.000Z"),
            },
          ],
        },
      },
      include: { versions: true },
    });

    const application = await prisma.loanApplication.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
        schemeId: scheme.id,
        requestedPrincipal: "100000.0000",
        requestedTermMonths: 12,
        purpose: "Collection test case",
        status: "APPROVED",
        approvalReason: "Approved for test",
        approvedAt: new Date(),
        approvedById: adminUser.userId,
      },
    });

    const cashAccount = await prisma.cashAccount.findFirstOrThrow({
      where: { organizationId: adminUser.organizationId, code: "CASH-VAULT-01" },
    });
    cashAccountId = cashAccount.id;

    const account = await prisma.loanAccount.create({
      data: {
        organizationId: adminUser.organizationId,
        customerId: customer.id,
        schemeId: scheme.id,
        loanAccountNumber: `COLL-LA-${Date.now().toString().slice(-8)}`,
        principalDisbursed: "100000.0000",
        principalOutstanding: "100000.0000",
        status: "ACTIVE",
        nextDueDate: new Date("2026-10-15T00:00:00.000Z"),
      },
    });
    loanAccountId = account.id;

    await prisma.loanDisbursement.create({
      data: {
        organizationId: adminUser.organizationId,
        applicationId: application.id,
        loanAccountId: account.id,
        amount: "100000.0000",
        disbursementDate: new Date("2026-10-01T00:00:00.000Z"),
        sourceReference: "COLL-DISB",
        status: "POSTED",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records a receipt and allocates it to principal under the configured policy", async () => {
    const receipt = await createCollectionReceipt(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      cashAccountId,
      receiptNumber: `RCPT-${Date.now().toString().slice(-8)}`,
      businessDate: "2026-10-12",
      amount: "15000.0000",
      paymentMethod: "CASH",
      reference: "COLL-TEST-1",
    });

    expect(receipt.status).toBe("POSTED");
    expect(receipt.amount).toBe("15000.0000");

    const allocation = await allocateReceiptToLoan(adminUser, {
      organizationId: adminUser.organizationId,
      receiptId: receipt.id,
      loanAccountId,
      principalAmount: "15000.0000",
      interestAmount: "0.0000",
      feeAmount: "0.0000",
      penaltyAmount: "0.0000",
    });

    expect(allocation.amount).toBe("15000.0000");
    expect(allocation.allocationType).toBe("PRINCIPAL");
  });

  it("rejects invalid receipt payloads and duplicate receipt numbers", async () => {
    const duplicateReceiptNumber = `RCPT-${Date.now().toString().slice(-8)}`;

    await expect(
      createCollectionReceipt(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId,
        cashAccountId,
        receiptNumber: "",
        businessDate: "2026-10-12",
        amount: "0.0000",
        paymentMethod: "CASH",
        reference: "BAD-RECEIPT",
      })
    ).rejects.toThrow(ValidationError);

    await createCollectionReceipt(adminUser, {
      organizationId: adminUser.organizationId,
      loanAccountId,
      cashAccountId,
      receiptNumber: duplicateReceiptNumber,
      businessDate: "2026-10-12",
      amount: "1000.0000",
      paymentMethod: "CASH",
      reference: "DUP-RECEIPT",
    });

    await expect(
      createCollectionReceipt(adminUser, {
        organizationId: adminUser.organizationId,
        loanAccountId,
        cashAccountId,
        receiptNumber: duplicateReceiptNumber,
        businessDate: "2026-10-12",
        amount: "2000.0000",
        paymentMethod: "BANK_TRANSFER",
        reference: "DUP-RECEIPT-AGAIN",
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
