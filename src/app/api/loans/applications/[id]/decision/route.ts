import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import {
  approveLoanApplication,
  rejectLoanApplication,
} from "@/modules/loans/loan-application-service";
import { AppError, ValidationError } from "@/lib/errors/app-error";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const action = body.action;

    if (action === "APPROVE") {
      const application = await approveLoanApplication(user, {
        organizationId: user.organizationId,
        applicationId: params.id,
        approvalReason: body.approvalReason || body.notes || "Approved by Credit Committee",
        enforceMakerChecker: body.enforceMakerChecker ?? true,
      });
      return NextResponse.json({ success: true, application });
    }

    if (action === "REJECT") {
      if (!body.rejectionReason || body.rejectionReason.trim().length < 5) {
        throw new ValidationError("A detailed rejection reason (minimum 5 characters) is mandatory");
      }
      const application = await rejectLoanApplication(user, {
        organizationId: user.organizationId,
        applicationId: params.id,
        rejectionReason: body.rejectionReason,
        enforceMakerChecker: body.enforceMakerChecker ?? true,
      });
      return NextResponse.json({ success: true, application });
    }

    throw new ValidationError(`Unsupported decision action: "${action}". Must be APPROVE or REJECT.`);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toJSON(), { status: err.statusCode });
    }
    console.error("Loan application decision error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to record loan decision" } },
      { status: 500 }
    );
  }
}

