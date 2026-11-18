import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { prisma } from "@/lib/db/prisma";
import { AdvanceCollectionClient, AdvanceLoanItem } from "./AdvanceCollectionClient";

export default async function AdvanceCollectionPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "collection.receipt.create");

  const [loanAccounts, cashAccounts, groups, organization, branch] = await Promise.all([
    prisma.loanAccount.findMany({
      where: {
        organizationId: user.organizationId,
        status: "ACTIVE",
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
          where: { status: { in: ["PENDING", "PARTIALLY_PAID"] } },
          orderBy: { installmentNumber: "asc" },
          take: 2,
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

  const mappedLoans: AdvanceLoanItem[] = loanAccounts.map((acc) => {
    const inst = acc.installments[0];
    const principalDue = inst ? (Number(inst.principalDue) - Number(inst.principalPaid)).toFixed(2) : "0.00";
    const interestDue = inst ? (Number(inst.interestDue) - Number(inst.interestPaid)).toFixed(2) : "0.00";
    const remainingDue = inst
      ? (Number(inst.totalDue) - Number(inst.totalPaid)).toFixed(2)
      : parseFloat(acc.principalOutstanding.toString()).toFixed(2);
    const group = acc.customer.customerGroups[0]?.group;

    return {
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
      nextInstallment: inst
        ? {
            id: inst.id,
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate.toISOString().slice(0, 10),
            principalDue,
            interestDue,
            totalDue: Number(inst.totalDue).toFixed(2),
            remainingDue: Number(remainingDue) > 0 ? remainingDue : "0.00",
            status: inst.status,
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
    <AdvanceCollectionClient
      currentUserId={user.userId}
      loans={mappedLoans}
      cashAccounts={cashAccounts}
      groups={groups}
      orgInfo={orgInfo}
    />
  );
}
