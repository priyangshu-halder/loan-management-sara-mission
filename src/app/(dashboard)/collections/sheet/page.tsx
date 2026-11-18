import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { CollectionSheetClient, SheetRecordItem } from "./CollectionSheetClient";

export default async function CollectionSheetPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "collection.receipt.create");

  const [receipts, loanAccounts, groups] = await Promise.all([
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
      take: 500,
    }),
    prisma.loanAccount.findMany({
      where: {
        organizationId: user.organizationId,
        status: "ACTIVE",
      },
      include: {
        customer: {
          include: {
            customerGroups: { include: { group: true } },
          },
        },
        scheme: true,
        installments: {
          where: { status: { in: ["PENDING", "PARTIALLY_PAID"] } },
          orderBy: { installmentNumber: "asc" },
          take: 3,
        },
      },
    }),
    prisma.group.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const records: SheetRecordItem[] = [];

  // 1. Process Paid Receipts
  for (const r of receipts) {
    const group = r.loanAccount.customer.customerGroups[0]?.group;
    const mode = r.paymentMethod === "BANK_TRANSFER" ? "NETBANKING" : r.paymentMethod;

    records.push({
      id: `rcpt-${r.id}`,
      type: "PAID",
      date: r.businessDate,
      receiptNumber: r.receiptNumber,
      customerCode: r.loanAccount.customer.customerCode,
      customerName: r.loanAccount.customer.fullName,
      phone: r.loanAccount.customer.phone,
      groupName: group?.name || "Independent",
      groupId: group?.id || null,
      loanAccountNumber: r.loanAccount.loanAccountNumber,
      schemeName: r.loanAccount.scheme.name,
      dueAmount: r.amount.toString(),
      collectedAmount: r.amount.toString(),
      paymentMode: mode,
      status: r.isReversed ? "REVERSED" : "PAID",
    });
  }

  // 2. Process Pending Dues
  for (const acc of loanAccounts) {
    const inst = acc.installments[0];
    if (!inst) continue;

    const group = acc.customer.customerGroups[0]?.group;
    const remainingDue = (Number(inst.totalDue) - Number(inst.totalPaid)).toFixed(2);
    const instDueDateStr = inst.dueDate.toISOString().slice(0, 10);

    records.push({
      id: `inst-${inst.id}`,
      type: "DUE",
      date: instDueDateStr,
      receiptNumber: "",
      customerCode: acc.customer.customerCode,
      customerName: acc.customer.fullName,
      phone: acc.customer.phone,
      groupName: group?.name || "Independent",
      groupId: group?.id || null,
      loanAccountNumber: acc.loanAccountNumber,
      schemeName: acc.scheme.name,
      dueAmount: remainingDue,
      collectedAmount: "0.00",
      paymentMode: "—",
      status: "PENDING DUE",
    });
  }

  // Sort by date descending
  records.sort((a, b) => (b.date > a.date ? 1 : -1));

  return (
    <CollectionSheetClient
      initialRecords={records}
      groups={groups}
    />
  );
}
