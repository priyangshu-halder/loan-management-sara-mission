import React from "react";
import { getCurrentUser, requirePermission } from "@/lib/permissions/auth-guard";
import { getLoanSchemes } from "@/modules/loans/loan-scheme-service";
import { LoanSchemesClient, LoanSchemeItem } from "./LoanSchemesClient";

export default async function LoanSchemesPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  requirePermission(user, "loan.scheme.read");
  const schemes = await getLoanSchemes(user);
  const serializedSchemes = JSON.parse(JSON.stringify(schemes));

  return <LoanSchemesClient initialSchemes={serializedSchemes as unknown as LoanSchemeItem[]} />;
}

