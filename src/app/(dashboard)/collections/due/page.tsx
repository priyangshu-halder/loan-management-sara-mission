import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { DueCollectionClient, DueLoanItem } from "./DueCollectionClient";

export default async function DueCollectionPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "collection.receipt.create");

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [loanAccounts, cashAccounts, groups, organization, branch] = await Promise.all([
    prisma.loanAccount.findMany({
      where: {
        organizationId: user.organizationId,
        status: "ACTIVE",
        installments: {
          some: {
            status: { in: ["PENDING", "PARTIALLY_PAID"] },
          },
        },
      },
      include: {
        customer: {
          include: {
            customerGroups: {
              include: {
                group: true,
              },
            },
          },
        },
        scheme: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        installments: {
          where: {
            status: { in: ["PENDING", "PARTIALLY_PAID"] },
          },
          orderBy: { installmentNumber: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cashAccount.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
      },
    }),
    prisma.group.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: "asc" },
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

  const dueLoans: DueLoanItem[] = [];

  for (const acc of loanAccounts) {
    const inst = acc.installments[0];
    if (!inst) continue;

    const instDueDate = new Date(inst.dueDate);
    const instDueStr = instDueDate.toISOString().slice(0, 10);
    const diffTime = today.getTime() - instDueDate.getTime();
    const daysPastDue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    const principalDue = (Number(inst.principalDue) - Number(inst.principalPaid)).toFixed(2);
    const interestDue = (Number(inst.interestDue) - Number(inst.interestPaid)).toFixed(2);
    const remainingDue = (Number(inst.totalDue) - Number(inst.totalPaid)).toFixed(2);
    const group = acc.customer.customerGroups[0]?.group;

    dueLoans.push({
      id: acc.id,
      loanAccountNumber: acc.loanAccountNumber,
      principalOutstanding: acc.principalOutstanding.toString(),
      customer: {
        id: acc.customer.id,
        customerCode: acc.customer.customerCode,
        fullName: acc.customer.fullName,
        guardianName: acc.customer.guardianName,
        phone: acc.customer.phone,
        groupId: group?.id || null,
        groupName: group?.name || "Independent",
      },
      scheme: {
        id: acc.scheme.id,
        name: acc.scheme.name,
        code: acc.scheme.code,
      },
      installment: {
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        dueDate: instDueStr,
        principalDue,
        interestDue,
        totalDue: Number(inst.totalDue).toFixed(2),
        remainingDue: Number(remainingDue) > 0 ? remainingDue : "0.00",
        status: inst.status,
        daysPastDue,
      },
    });
  }

  // Sort by days past due descending (most urgent dues first)
  dueLoans.sort((a, b) => b.installment.daysPastDue - a.installment.daysPastDue);

  const orgInfo = {
    name: organization?.name || "RPS RAYHAN TECH",
    branchName: branch?.name || "HEAD OFFICE BRANCH",
    gstin: "19AABCR1234F1Z5",
    helpline: "+91 98765 43210",
  };

  return (
    <DueCollectionClient
      currentUserId={user.userId}
      loans={dueLoans}
      cashAccounts={cashAccounts}
      groups={groups}
      orgInfo={orgInfo}
    />
  );
}
