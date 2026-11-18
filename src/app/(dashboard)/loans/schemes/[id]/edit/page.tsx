import React from "react";
import { notFound } from "next/navigation";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { getLoanSchemeById } from "@/modules/loans/loan-scheme-service";
import { EditLoanSchemeClient } from "./EditLoanSchemeClient";
import { LoanSchemeItem } from "../../LoanSchemesClient";

interface Props {
  params: { id: string } | Promise<{ id: string }>;
}

export default async function EditLoanSchemePage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "loan.scheme.manage");

  const { id } = await Promise.resolve(params);

  try {
    const scheme = await getLoanSchemeById(user, id);
    return <EditLoanSchemeClient scheme={scheme as unknown as LoanSchemeItem} />;
  } catch {
    notFound();
  }
}
