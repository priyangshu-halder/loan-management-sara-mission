import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import { createCustomer, createGroup, assignCustomerToGroup } from "./customer-service";
import { ConflictError, ValidationError } from "@/lib/errors/app-error";

describe("Customer and group management", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let suffix: string;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a customer and rejects duplicate customer codes in the same organization", async () => {
    const uniqueCustomerCode = `CUST-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      customerCode: uniqueCustomerCode,
      fullName: "Asha Verma",
      phone: `+91-900000${suffix}`,
      email: `asha.${suffix}@example.com`,
      branchId: null,
      status: "ACTIVE",
    });

    expect(customer.customerCode).toBe(uniqueCustomerCode);
    expect(customer.fullName).toBe("Asha Verma");

    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        customerCode: uniqueCustomerCode,
        fullName: "Duplicate Customer",
        phone: `+91-900001${suffix}`,
        email: `duplicate.${suffix}@example.com`,
        branchId: null,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("creates a group and assigns an existing customer to it", async () => {
    const groupCode = `GROUP-ALPHA-${suffix}`;
    const group = await createGroup(adminUser, {
      organizationId: adminUser.organizationId,
      code: groupCode,
      name: `Alpha Group ${suffix}`,
      branchId: null,
      meetingDay: "MONDAY",
      status: "ACTIVE",
    });

    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      customerCode: `CUST-${Number(suffix) + 1}`,
      fullName: "Rahul Mehta",
      phone: `+91-900002${suffix}`,
      email: `rahul.${suffix}@example.com`,
      branchId: null,
      status: "ACTIVE",
    });

    const assignment = await assignCustomerToGroup(adminUser, {
      organizationId: adminUser.organizationId,
      customerId: customer.id,
      groupId: group.id,
      role: "MEMBER",
    });

    expect(group.code).toBe(groupCode);
    expect(assignment.customerId).toBe(customer.id);
    expect(assignment.groupId).toBe(group.id);
    expect(assignment.role).toBe("MEMBER");
  });

  it("rejects invalid customer payloads and out-of-scope access", async () => {
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        customerCode: "C",
        fullName: "",
        phone: "bad",
        email: "not-an-email",
        branchId: null,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ValidationError);

    const otherOrg = await prisma.organization.create({
      data: {
        code: "TEST-ORG-OUTER",
        name: "Outer Org",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });

    await expect(
      createCustomer(adminUser, {
        organizationId: otherOrg.id,
        customerCode: "CUST-OUTER",
        fullName: "Outer Customer",
        phone: "+91-9000000004",
        email: "outer@example.com",
        branchId: null,
        status: "ACTIVE",
      })
    ).rejects.toThrow();

    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});
