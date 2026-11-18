import React from "react";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  getCustomers,
  getCustomerSummaryKPIs,
  getBranches,
} from "@/modules/customers/customer-service";
import { getLoanSchemes } from "@/modules/loans/loan-scheme-service";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: {
    search?: string;
    branchId?: string;
    status?: string;
    kycStatus?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [kpis, customersResult, branches, allSchemes] = await Promise.all([
    getCustomerSummaryKPIs(user),
    getCustomers(user, {
      search: searchParams?.search,
      branchId: searchParams?.branchId,
      status: searchParams?.status,
      kycStatus: searchParams?.kycStatus,
      page: 1,
      pageSize: 200,
    }),
    getBranches(user),
    getLoanSchemes(user).catch(() => []),
  ]);

  const publishedSchemes = allSchemes
    .filter((s) => s.status === "PUBLISHED" && s.versions && s.versions.length > 0)
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      status: s.status,
      versions: s.versions.map((v) => ({
        versionNumber: v.versionNumber,
        minPrincipal: String(v.minPrincipal),
        maxPrincipal: String(v.maxPrincipal),
        termMonths: v.termMonths,
        interestRate: String(v.interestRate),
        interestMethod: v.interestMethod,
        repaymentFrequency: v.repaymentFrequency,
      })),
    }));

  const serializedCustomers = JSON.parse(JSON.stringify(customersResult.items));
  const serializedBranches = JSON.parse(JSON.stringify(branches));
  const serializedKpis = JSON.parse(JSON.stringify(kpis));

  return (
    <CustomersClient
      initialCustomers={serializedCustomers}
      branches={serializedBranches}
      loanSchemes={publishedSchemes}
      kpis={serializedKpis}
      currentUserId={user.userId}
      currentUserName={user.email || "Maker Staff"}
    />
  );
}
