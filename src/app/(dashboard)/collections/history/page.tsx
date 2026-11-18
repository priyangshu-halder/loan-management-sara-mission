import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { CollectionHistoryClient, HistoryReceiptItem } from "./CollectionHistoryClient";

export default async function CollectionHistoryPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "collection.receipt.create");

  const [receipts, organization, branch] = await Promise.all([
    prisma.collectionReceipt.findMany({
      where: {
        organizationId: user.organizationId,
      },
      include: {
        loanAccount: {
          include: {
            customer: {
              include: {
                customerGroups: { include: { group: true } },
              },
            },
            scheme: true,
          },
        },
        allocations: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, code: true },
    }),
    prisma.branch.findFirst({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: { name: true, code: true },
    }),
  ]);

  const mappedReceipts: HistoryReceiptItem[] = receipts.map((r) => {
    const group = r.loanAccount.customer.customerGroups[0]?.group;
    const alloc = r.allocations[0];

    return {
      id: r.id,
      receiptNumber: r.receiptNumber,
      businessDate: r.businessDate,
      amount: r.amount.toString(),
      paymentMethod: r.paymentMethod,
      reference: r.reference,
      status: r.status,
      isReversed: r.isReversed,
      createdAt: r.createdAt.toISOString(),
      customer: {
        id: r.loanAccount.customer.id,
        customerCode: r.loanAccount.customer.customerCode,
        fullName: r.loanAccount.customer.fullName,
        phone: r.loanAccount.customer.phone,
        groupName: group?.name || "Independent",
      },
      loanAccount: {
        id: r.loanAccount.id,
        loanAccountNumber: r.loanAccount.loanAccountNumber,
        schemeName: r.loanAccount.scheme.name,
      },
      allocations: alloc
        ? {
            principalAmount: alloc.principalAmount.toString(),
            interestAmount: alloc.interestAmount.toString(),
          }
        : null,
    };
  });

  const orgInfo = {
    name: organization?.name || "RPS RAYHAN TECH",
    branchName: branch?.name || "HEAD OFFICE BRANCH",
    gstin: "19AABCR1234F1Z5",
    helpline: "+91 98765 43210",
  };

  return (
    <CollectionHistoryClient
      receipts={mappedReceipts}
      orgInfo={orgInfo}
    />
  );
}
