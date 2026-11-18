import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  getMasterCatalogItems,
  createMasterCatalogItem,
  updateMasterCatalogItem,
  deleteMasterCatalogItem,
  DEFAULT_CATALOGS,
} from "./catalog-service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";

describe("Master Catalog Service", () => {
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

  it("auto-seeds DEFAULT_CATALOGS for COMMUNITY_RELIGION and EDUCATION_LITERACY", async () => {
    const communities = await getMasterCatalogItems(adminUser, "COMMUNITY_RELIGION");
    expect(communities.length).toBeGreaterThanOrEqual(DEFAULT_CATALOGS.COMMUNITY_RELIGION.length);
    expect(communities.some((c) => c.code === "HINDU" && c.name === "Hindu")).toBe(true);
    expect(communities.some((c) => c.code === "MUSLIM" && c.name === "Muslim")).toBe(true);

    const educations = await getMasterCatalogItems(adminUser, "EDUCATION_LITERACY");
    expect(educations.length).toBeGreaterThanOrEqual(DEFAULT_CATALOGS.EDUCATION_LITERACY.length);
    expect(educations.some((e) => e.code === "GRADUATE")).toBe(true);
  });

  it("creates a custom catalog item and prevents duplicates in the same category", async () => {
    const customCode = `CUSTOM_${suffix}`;
    const item = await createMasterCatalogItem(adminUser, {
      category: "COMMUNITY_RELIGION",
      code: customCode,
      name: `Custom Community ${suffix}`,
      description: "Test community item",
      sortOrder: 99,
    });

    expect(item.code).toBe(customCode);
    expect(item.name).toBe(`Custom Community ${suffix}`);
    expect(item.organizationId).toBe(adminUser.organizationId);

    // Re-creating the same code in the same category should throw ConflictError
    await expect(
      createMasterCatalogItem(adminUser, {
        category: "COMMUNITY_RELIGION",
        code: customCode,
        name: "Duplicate Name",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("updates and deactivates a catalog item", async () => {
    const code = `UPD_${suffix}`;
    const created = await createMasterCatalogItem(adminUser, {
      category: "EDUCATION_LITERACY",
      code,
      name: "Original Education Name",
      sortOrder: 50,
    });

    const updated = await updateMasterCatalogItem(adminUser, created.id, {
      name: "Updated Education Name",
      sortOrder: 51,
      isActive: false,
    });

    expect(updated.name).toBe("Updated Education Name");
    expect(updated.sortOrder).toBe(51);
    expect(updated.isActive).toBe(false);

    // Querying active items should not include the deactivated item
    const activeItems = await getMasterCatalogItems(adminUser, "EDUCATION_LITERACY", false);
    expect(activeItems.some((i) => i.id === created.id)).toBe(false);

    // Querying with includeInactive=true should include it
    const allItems = await getMasterCatalogItems(adminUser, "EDUCATION_LITERACY", true);
    expect(allItems.some((i) => i.id === created.id)).toBe(true);
  });

  it("deletes an unreferenced catalog item and protects tenant isolation", async () => {
    const code = `DEL_${suffix}`;
    const item = await createMasterCatalogItem(adminUser, {
      category: "COMMUNITY_RELIGION",
      code,
      name: "To Delete",
    });

    const deleted = await deleteMasterCatalogItem(adminUser, item.id);
    expect(deleted.id).toBe(item.id);

    // Subsequent delete or lookup should throw NotFoundError
    await expect(deleteMasterCatalogItem(adminUser, item.id)).rejects.toThrow(NotFoundError);

    // Tenant isolation: create another organization
    const otherOrg = await prisma.organization.create({
      data: {
        code: `ORG-CAT-${suffix}`,
        name: "Other Org for Catalog",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });

    const otherOrgUser = {
      ...adminUser,
      organizationId: otherOrg.id,
      organizationCode: otherOrg.code,
    };

    // Other org cannot update or delete item from adminUser org
    const itemInAdminOrg = await createMasterCatalogItem(adminUser, {
      category: "COMMUNITY_RELIGION",
      code: `ISO_${suffix}`,
      name: "Admin Org Item",
    });

    await expect(
      updateMasterCatalogItem(otherOrgUser, itemInAdminOrg.id, { name: "Hacked" })
    ).rejects.toThrow(NotFoundError);

    await expect(
      deleteMasterCatalogItem(otherOrgUser, itemInAdminOrg.id)
    ).rejects.toThrow(NotFoundError);

    // Clean up
    await prisma.masterCatalogItem.delete({ where: { id: itemInAdminOrg.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });

  it("soft-deactivates instead of deleting when catalog item is referenced by a customer", async () => {
    const code = `REF_${suffix}`;
    const item = await createMasterCatalogItem(adminUser, {
      category: "COMMUNITY_RELIGION",
      code,
      name: `Referenced Community ${suffix}`,
    });

    const group = (await prisma.group.findFirst({
      where: { organizationId: adminUser.organizationId },
    })) ?? (await prisma.group.create({
      data: {
        organizationId: adminUser.organizationId,
        code: `GRP-CAT-${suffix}`,
        name: `Catalog Test Group ${suffix}`,
        status: "ACTIVE",
      },
    }));

    // Create a customer referencing this community item
    const customer = await prisma.customer.create({
      data: {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `CUST-REF-${suffix}`,
        fullName: "Referenced Customer",
        phone: `+91-8888${suffix.slice(-6)}`,
        communityId: item.id,
      },
    });

    // Attempting delete should soft-deactivate because of foreign relation
    const res = await deleteMasterCatalogItem(adminUser, item.id);
    expect(res.isActive).toBe(false);

    const lookup = await prisma.masterCatalogItem.findUnique({ where: { id: item.id } });
    expect(lookup?.isActive).toBe(false);

    // Clean up customer then item
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.masterCatalogItem.delete({ where: { id: item.id } });
  });
});
