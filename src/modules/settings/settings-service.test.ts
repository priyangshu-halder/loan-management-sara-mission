import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createUser } from "@/modules/identity/user-service";
import {
  getCompanySettings,
  updateCompanySettings,
  getGeneralPreferences,
  updateGeneralPreferences,
  getSystemPreferences,
  updateSystemPreferences,
  updateAdminAccount,
  getPublicSettings,
} from "./settings-service";
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/lib/errors/app-error";

describe("Settings Service Integration Tests", () => {
  let superAdminUser: Awaited<ReturnType<typeof login>>["user"];
  let operationalUser: Awaited<ReturnType<typeof login>>["user"];
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);

    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    superAdminUser = loginRes.user;

    // Create an operational staff member without administrative privileges
    const opUsername = `opstaff_${suffix}`;
    const opUserRecord = await createUser(superAdminUser, {
      organizationId: superAdminUser.organizationId,
      username: opUsername,
      email: `${opUsername}@example.com`,
      fullName: "Operational Staff",
      password: "StaffPassword@123",
      roleCodes: ["LOAN_OFFICER"],
    });

    const opLoginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: opUsername,
      password: "StaffPassword@123",
    });
    operationalUser = opLoginRes.user;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("retrieves default company settings and public settings", async () => {
    const settings = await getCompanySettings(superAdminUser.organizationId);
    expect(settings).toBeDefined();
    expect(settings.currency).toBe("INR");
    expect(settings.appName).toBeDefined();

    const publicSettings = await getPublicSettings(superAdminUser.organizationId);
    expect(publicSettings).toBeDefined();
    expect(publicSettings.currency).toBe(settings.currency);
  });

  it("allows superadmin to update company settings with validation", async () => {
    const updated = await updateCompanySettings(superAdminUser, {
      companyName: `Updated Rayhan Finance ${suffix}`,
      appName: `Rayhan Core ${suffix}`,
      officialEmail: `support.${suffix}@rayhan-mfi.local`,
      companyGstin: "27AAAAA0000A1Z5",
      currency: "INR",
      dateFormat: "YYYY-MM-DD",
    });

    expect(updated.companyName).toBe(`Updated Rayhan Finance ${suffix}`);
    expect(updated.appName).toBe(`Rayhan Core ${suffix}`);
    expect(updated.dateFormat).toBe("YYYY-MM-DD");

    const fetched = await getCompanySettings(superAdminUser.organizationId);
    expect(fetched.companyName).toBe(`Updated Rayhan Finance ${suffix}`);
    expect(fetched.officialEmail).toBe(`support.${suffix}@rayhan-mfi.local`);

    // Public settings reflects the new branding
    const publicSettings = await getPublicSettings(superAdminUser.organizationId);
    expect(publicSettings.companyName).toBe(`Updated Rayhan Finance ${suffix}`);
    expect(publicSettings.appName).toBe(`Rayhan Core ${suffix}`);
  });

  it("validates company logo payload", async () => {
    await expect(
      updateCompanySettings(superAdminUser, {
        companyLogo: "invalid-logo-string-not-uri",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("validates company official email", async () => {
    await expect(
      updateCompanySettings(superAdminUser, {
        officialEmail: "not-an-email",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("allows superadmin to update general preferences", async () => {
    const updated = await updateGeneralPreferences(superAdminUser, {
      defaultPaginationSize: 50,
      currencyDisplay: "CODE",
      autoPrintReceipt: true,
      receiptHeaderNote: "Thank you for banking with Rayhan",
      receiptFooterNote: "Computer generated receipt",
    });

    expect(updated.defaultPaginationSize).toBe(50);
    expect(updated.currencyDisplay).toBe("CODE");
    expect(updated.autoPrintReceipt).toBe(true);

    const fetched = await getGeneralPreferences(superAdminUser.organizationId);
    expect(fetched.defaultPaginationSize).toBe(50);
    expect(fetched.currencyDisplay).toBe("CODE");
    expect(fetched.receiptHeaderNote).toBe("Thank you for banking with Rayhan");
  });

  it("allows superadmin to update system preferences", async () => {
    const updated = await updateSystemPreferences(superAdminUser, {
      maintenanceMode: true,
      maintenanceMessage: "Scheduled maintenance in progress. Expected return at 04:00 AM.",
      maxLoginAttempts: 3,
      lockoutDurationMinutes: 30,
      loanApplicationPrefix: "LN-APP",
      customerCodePrefix: "CLI",
    });

    expect(updated.maintenanceMode).toBe(true);
    expect(updated.maintenanceMessage).toContain("Scheduled maintenance");
    expect(updated.maxLoginAttempts).toBe(3);
    expect(updated.customerCodePrefix).toBe("CLI");

    // Restore maintenance mode to false
    await updateSystemPreferences(superAdminUser, {
      maintenanceMode: false,
    });
  });

  it("allows superadmin to update profile and verify password change security", async () => {
    // 1. Updating name without password
    const profileUpdate = await updateAdminAccount(superAdminUser, {
      fullName: "Super Admin Primary",
    });
    expect(profileUpdate.success).toBe(true);
    expect(profileUpdate.user.fullName).toBe("Super Admin Primary");

    // 2. Reject password change with incorrect current password
    await expect(
      updateAdminAccount(superAdminUser, {
        currentPassword: "WrongCurrentPassword@123",
        newPassword: "NewSecretPassword@123",
        confirmPassword: "NewSecretPassword@123",
      })
    ).rejects.toThrow(UnauthorizedError);

    // 3. Reject password change with mismatched confirmation
    await expect(
      updateAdminAccount(superAdminUser, {
        currentPassword: "Admin@12345",
        newPassword: "NewSecretPassword@123",
        confirmPassword: "MismatchPassword@123",
      })
    ).rejects.toThrow(ValidationError);

    // 4. Reject password change with too short password
    await expect(
      updateAdminAccount(superAdminUser, {
        currentPassword: "Admin@12345",
        newPassword: "short",
        confirmPassword: "short",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("strictly denies operational staff from updating settings or admin credentials", async () => {
    await expect(
      updateCompanySettings(operationalUser, {
        companyName: "Hacked Company",
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      updateGeneralPreferences(operationalUser, {
        defaultPaginationSize: 100,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      updateSystemPreferences(operationalUser, {
        maintenanceMode: true,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      updateAdminAccount(operationalUser, {
        fullName: "Hacked Admin",
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
