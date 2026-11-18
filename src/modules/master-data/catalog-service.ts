import { prisma } from "@/lib/db/prisma";
import { requireOrganizationScope, requirePermission, requireAnyPermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { z } from "zod";

export const DEFAULT_CATALOGS: Record<string, Array<{ code: string; name: string; sortOrder: number }>> = {
  COMMUNITY_RELIGION: [
    { code: "HINDU", name: "Hindu", sortOrder: 1 },
    { code: "MUSLIM", name: "Muslim", sortOrder: 2 },
    { code: "CHRISTIAN", name: "Christian", sortOrder: 3 },
    { code: "SIKH", name: "Sikh", sortOrder: 4 },
    { code: "BUDDHIST", name: "Buddhist", sortOrder: 5 },
    { code: "JAIN", name: "Jain", sortOrder: 6 },
    { code: "PARSI", name: "Parsi / Zoroastrian", sortOrder: 7 },
    { code: "OTHER", name: "Other / Not Disclosed", sortOrder: 8 },
  ],
  EDUCATION_LITERACY: [
    { code: "ILLITERATE", name: "Illiterate / No Formal Education", sortOrder: 1 },
    { code: "PRIMARY", name: "Primary (Class 1 - 5)", sortOrder: 2 },
    { code: "MIDDLE", name: "Middle School (Class 6 - 8)", sortOrder: 3 },
    { code: "SECONDARY", name: "Secondary / 10th Pass", sortOrder: 4 },
    { code: "HIGHER_SECONDARY", name: "Higher Secondary / 12th Pass", sortOrder: 5 },
    { code: "DIPLOMA", name: "Vocational / Technical Diploma", sortOrder: 6 },
    { code: "GRADUATE", name: "Graduate / Bachelor's Degree", sortOrder: 7 },
    { code: "POST_GRADUATE", name: "Post Graduate / Master's Degree", sortOrder: 8 },
    { code: "PROFESSIONAL", name: "Doctorate / Professional Qualification", sortOrder: 9 },
    { code: "OTHER", name: "Other", sortOrder: 10 },
  ],
};

const createItemSchema = z.object({
  category: z.string().min(2).max(60).regex(/^[A-Z0-9_]+$/),
  code: z.string().min(1).max(60).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(255).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(255).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function getMasterCatalogItems(
  caller: AuthenticatedUser,
  category: string,
  includeInactive = false
) {
  requireAnyPermission(
    caller,
    "customer.list.view",
    "customer.detail.view",
    "customer.create",
    "customer.edit",
    "loan.application.create",
    "loan.application.view",
    "loan.account.read",
    "settings.manage",
    "org.manage"
  );

  const normalizedCategory = category.trim().toUpperCase();

  // Check if items exist
  let items = await prisma.masterCatalogItem.findMany({
    where: {
      organizationId: caller.organizationId,
      category: normalizedCategory,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Auto-seed default entries if this organization has not yet configured this catalog
  if (items.length === 0 && DEFAULT_CATALOGS[normalizedCategory]) {
    const defaults = DEFAULT_CATALOGS[normalizedCategory];
    await prisma.masterCatalogItem.createMany({
      data: defaults.map((d) => ({
        organizationId: caller.organizationId,
        category: normalizedCategory,
        code: d.code,
        name: d.name,
        sortOrder: d.sortOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    items = await prisma.masterCatalogItem.findMany({
      where: {
        organizationId: caller.organizationId,
        category: normalizedCategory,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  return items;
}

export async function createMasterCatalogItem(
  caller: AuthenticatedUser,
  input: z.input<typeof createItemSchema>
) {
  requireAnyPermission(caller, "settings.manage", "org.manage", "customer.create", "loan.application.create");

  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid catalog payload");
  }

  const { category, code, name, description, sortOrder } = parsed.data;

  const existing = await prisma.masterCatalogItem.findUnique({
    where: {
      organizationId_category_code: {
        organizationId: caller.organizationId,
        category,
        code,
      },
    },
  });

  if (existing) {
    throw new ConflictError(
      `Catalog entry with code "${code}" already exists in category "${category}"`
    );
  }

  return prisma.masterCatalogItem.create({
    data: {
      organizationId: caller.organizationId,
      category,
      code,
      name,
      description: description || null,
      sortOrder,
      isActive: true,
    },
  });
}

export async function updateMasterCatalogItem(
  caller: AuthenticatedUser,
  id: string,
  input: z.input<typeof updateItemSchema>
) {
  requireAnyPermission(caller, "settings.manage", "org.manage", "customer.edit", "loan.application.create");

  const existing = await prisma.masterCatalogItem.findUnique({
    where: { id },
  });

  if (!existing || existing.organizationId !== caller.organizationId) {
    throw new NotFoundError("MasterCatalogItem", id);
  }

  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid catalog update payload");
  }

  return prisma.masterCatalogItem.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });
}

export async function deleteMasterCatalogItem(caller: AuthenticatedUser, id: string) {
  requireAnyPermission(caller, "settings.manage", "org.manage", "customer.delete", "loan.application.create");

  const existing = await prisma.masterCatalogItem.findUnique({
    where: { id },
    include: {
      customersWithCommunity: { select: { id: true }, take: 1 },
      customersWithEducation: { select: { id: true }, take: 1 },
    },
  });

  if (!existing || existing.organizationId !== caller.organizationId) {
    throw new NotFoundError("MasterCatalogItem", id);
  }

  if (
    existing.customersWithCommunity.length > 0 ||
    existing.customersWithEducation.length > 0
  ) {
    // If referenced, soft-deactivate rather than cascade-failing
    return prisma.masterCatalogItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  return prisma.masterCatalogItem.delete({
    where: { id },
  });
}
