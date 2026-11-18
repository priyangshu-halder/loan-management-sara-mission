import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login, validateSession } from "@/modules/identity/auth-service";
import { createUser, updateStaff, deleteOrDeactivateStaff } from "@/modules/identity/user-service";
import {
  getStaffPermissionSummary,
  updateStaffPermissions,
} from "./permission-management-service";
import { createCustomer, verifyCustomerKyc } from "@/modules/customers/customer-service";
import { ForbiddenError, ValidationError } from "@/lib/errors/app-error";

describe("Staff Management & Granular Permissions Integration Suite", () => {
  let superAdminUser: Awaited<ReturnType<typeof login>>["user"];
  let operationalUser: Awaited<ReturnType<typeof login>>["user"];
  let opUserId: string;
  let opUsername: string;
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);

    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    superAdminUser = loginRes.user;

    // Create initial operational staff
    opUsername = `staff_${suffix}`;
    const opUserRecord = await createUser(superAdminUser, {
      organizationId: superAdminUser.organizationId,
      username: opUsername,
      email: `${opUsername}@example.com`,
      fullName: "Staff Member",
      password: "StaffPassword@123",
      roleCodes: ["LOAN_OFFICER"],
    });
    opUserId = opUserRecord.id;

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

  it("retrieves full permission summary, profiles, and staff details for superadmin", async () => {
    const summary = await getStaffPermissionSummary(superAdminUser, opUserId);
    expect(summary.allPermissions.length).toBeGreaterThan(50);
    expect(summary.profiles.length).toBeGreaterThanOrEqual(7);
    expect(summary.selectedStaff).toBeDefined();
    expect(summary.selectedStaff?.id).toBe(opUserId);
    expect(summary.selectedStaff?.username).toBe(opUsername);
  });

  it("strictly denies operational staff from viewing or managing permissions", async () => {
    await expect(getStaffPermissionSummary(operationalUser, opUserId)).rejects.toThrow(ForbiddenError);

    await expect(
      updateStaffPermissions(operationalUser, {
        targetUserId: opUserId,
        permissions: { "customer.create": true },
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("updates staff member permissions and applies reusable profiles", async () => {
    // 1. Assign KYC_VERIFIER profile
    const kycProfile = await prisma.permissionProfile.findFirst({
      where: {
        organizationId: superAdminUser.organizationId,
        code: "KYC_VERIFIER",
      },
    });
    expect(kycProfile).toBeDefined();

    await updateStaffPermissions(superAdminUser, {
      targetUserId: opUserId,
      permissionProfileId: kycProfile!.id,
      permissions: {
        "customer.create": true,
        "customer.delete": false, // explicitly revoke
      },
    });

    // 2. Refresh staff summary
    const summary = await getStaffPermissionSummary(superAdminUser, opUserId);
    expect(summary.selectedStaff?.permissionProfileId).toBe(kycProfile!.id);
    expect(summary.selectedStaff?.effectivePermissions).toContain("customer.kyc.verify");
    expect(summary.selectedStaff?.effectivePermissions).toContain("customer.create");
    expect(summary.selectedStaff?.effectivePermissions).not.toContain("customer.delete");

    // 3. Authenticate as staff member and verify effective permissions in session
    const refreshedLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: opUsername,
      password: "StaffPassword@123",
    });
    expect(refreshedLogin.user.permissions.has("customer.kyc.verify")).toBe(true);
    expect(refreshedLogin.user.permissions.has("customer.create")).toBe(true);
    expect(refreshedLogin.user.permissions.has("customer.delete")).toBe(false);
  });

  it("immediately enforces permission revocation in user_permissions", async () => {
    // Revoke customer.create
    await updateStaffPermissions(superAdminUser, {
      targetUserId: opUserId,
      permissions: {
        "customer.create": false,
      },
    });

    const staffLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: opUsername,
      password: "StaffPassword@123",
    });
    expect(staffLogin.user.permissions.has("customer.create")).toBe(false);

    // Attempting to create customer must fail with ForbiddenError
    await expect(
      createCustomer(staffLogin.user, {
        organizationId: staffLogin.user.organizationId,
        groupId: "00000000-0000-0000-0000-000000000001",
        customerCode: `CUST-NO-PERM-${suffix}`,
        fullName: "Unauthorized Customer Creation",
        phone: "+91-9111111111",
        email: "unauth@example.com",
        branchId: null,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows editing staff information without creating duplicate records", async () => {
    const updated = await updateStaff(superAdminUser, opUserId, {
      fullName: "Updated Staff Name",
      email: `updated.${opUsername}@example.com`,
      roleCodes: ["LOAN_OFFICER"],
    });

    expect(updated.id).toBe(opUserId);
    expect(updated.fullName).toBe("Updated Staff Name");
    expect(updated.email).toBe(`updated.${opUsername}@example.com`);

    const inDb = await prisma.user.findUnique({ where: { id: opUserId } });
    expect(inDb?.fullName).toBe("Updated Staff Name");
  });

  it("prevents self-deletion and deletion of last active Superadmin", async () => {
    // 1. Self deletion/deactivation prevention
    await expect(deleteOrDeactivateStaff(superAdminUser, superAdminUser.userId)).rejects.toThrow(
      ValidationError
    );

    // 2. Last active Superadmin deletion prevention
    const superAdminRecord = await prisma.user.findUnique({
      where: { id: superAdminUser.userId },
    });
    if (superAdminRecord) {
      await expect(
        deleteOrDeactivateStaff(
          { ...superAdminUser, userId: "another-admin-id" },
          superAdminUser.userId
        )
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("deactivates staff member, preserves historical records, and invalidates active sessions", async () => {
    // Create temporary staff to delete
    const tempUsername = `temp_staff_${suffix}`;
    const tempStaff = await createUser(superAdminUser, {
      organizationId: superAdminUser.organizationId,
      username: tempUsername,
      email: `${tempUsername}@example.com`,
      fullName: "Temporary Staff",
      password: "TempPassword@123",
      roleCodes: ["LOAN_OFFICER"],
    });

    // Login temp staff to establish session
    const tempLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: tempUsername,
      password: "TempPassword@123",
    });
    expect(tempLogin.token).toBeDefined();

    // Verify session is active
    const activeSession = await validateSession(tempLogin.token);
    expect(activeSession).not.toBeNull();

    // Deactivate staff
    const result = await deleteOrDeactivateStaff(superAdminUser, tempStaff.id);
    expect(result.status).toBe("DEACTIVATED");

    // Session is now invalidated
    const revokedSession = await validateSession(tempLogin.token);
    expect(revokedSession).toBeNull();

    // User cannot log in anymore
    await expect(
      login({
        organizationCode: "RAYHAN-MFI",
        username: tempUsername,
        password: "TempPassword@123",
      })
    ).rejects.toThrow();

    // Database record still exists (soft-deleted / historical preservation)
    const dbRecord = await prisma.user.findUnique({ where: { id: tempStaff.id } });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.status).toBe("DEACTIVATED");
  });

  it("enforces Maker-Checker separation on KYC verification", async () => {
    // 1. Create Maker staff
    const makerUsername = `maker_${suffix}`;
    const makerUser = await createUser(superAdminUser, {
      organizationId: superAdminUser.organizationId,
      username: makerUsername,
      email: `${makerUsername}@example.com`,
      fullName: "Maker Staff",
      password: "MakerPassword@123",
      roleCodes: ["LOAN_OFFICER"],
    });
    // Grant customer.create to maker
    await updateStaffPermissions(superAdminUser, {
      targetUserId: makerUser.id,
      permissions: {
        "customer.create": true,
        "customer.kyc.verify": true, // Even if maker has verify permission, they cannot verify own work!
      },
    });

    const makerLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: makerUsername,
      password: "MakerPassword@123",
    });

    // 2. Create Checker staff
    const checkerUsername = `checker_${suffix}`;
    const checkerUser = await createUser(superAdminUser, {
      organizationId: superAdminUser.organizationId,
      username: checkerUsername,
      email: `${checkerUsername}@example.com`,
      fullName: "Checker Staff",
      password: "CheckerPassword@123",
      roleCodes: ["LOAN_OFFICER"],
    });
    // Grant customer.kyc.verify to checker
    await updateStaffPermissions(superAdminUser, {
      targetUserId: checkerUser.id,
      permissions: {
        "customer.kyc.verify": true,
      },
    });

    const checkerLogin = await login({
      organizationCode: "RAYHAN-MFI",
      username: checkerUsername,
      password: "CheckerPassword@123",
    });

    // 3. Maker creates a group and a customer
    const testGroup = await prisma.group.create({
      data: {
        organizationId: makerLogin.user.organizationId,
        code: `GRP-MK-${suffix}`,
        name: `Maker Checker Group ${suffix}`,
        status: "ACTIVE",
      },
    });

    const customer = await createCustomer(makerLogin.user, {
      organizationId: makerLogin.user.organizationId,
      groupId: testGroup.id,
      customerCode: `CUST-MK-${suffix}`,
      fullName: "Maker-Checker KYC Customer",
      phone: `+91-98${suffix.padStart(8, "0")}`,
      email: `mk.${suffix}@example.com`,
      branchId: null,
      status: "ACTIVE",
    });

    // 4. Maker attempts to verify their own customer KYC -> MUST BE REJECTED
    await expect(
      verifyCustomerKyc(makerLogin.user, customer.id, "VERIFIED", "Self verification attempt")
    ).rejects.toThrow(ForbiddenError);

    // 5. Distinct checker verifies KYC -> MUST SUCCEED
    const verified = await verifyCustomerKyc(
      checkerLogin.user,
      customer.id,
      "VERIFIED",
      "Verified by independent checker"
    );
    expect(verified).toBeDefined();

    // 6. Verify ApprovalHistory record
    const history = await prisma.approvalHistory.findFirst({
      where: {
        entityType: "CUSTOMER_KYC",
        entityId: customer.id,
      },
    });
    expect(history).toBeDefined();
    expect(history?.makerId).toBe(makerUser.id);
    expect(history?.statusAfter).toBe("VERIFIED");
    expect(history?.checkerId).toBe(checkerUser.id);
    expect(history?.action).toBe("APPROVE");
    expect(history?.statusAfter).toBe("VERIFIED");
  });
});
