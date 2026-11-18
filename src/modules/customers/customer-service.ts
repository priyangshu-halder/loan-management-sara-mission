import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/audit-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission, requireAnyPermission, requireBranchScope, assertMakerCheckerSeparation } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { z } from "zod";
import crypto from "crypto";
import {
  saveCustomerApplicationForm,
  deleteStoredFile,
} from "@/lib/storage/storage-provider";

function validateDocumentPayload(doc: string | null | undefined, fieldName: string) {
  if (!doc) return;
  if (doc.startsWith("data:")) {
    const match = doc.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      throw new ValidationError(`Invalid data URI format for ${fieldName}`);
    }
    const mimeType = match[1].toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(mimeType)) {
      throw new ValidationError(
        `Invalid file format "${mimeType}" for ${fieldName}. Allowed formats: JPG, PNG, WEBP, PDF`
      );
    }
    const base64Len = match[2].length;
    const approximateBytes = Math.ceil((base64Len * 3) / 4);
    if (approximateBytes > 5 * 1024 * 1024) {
      throw new ValidationError(`${fieldName} exceeds the 5MB size limit.`);
    }
  }
}

const customerSchema = z.object({
  organizationId: z.string().uuid(),
  customerCode: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(8).max(30).regex(/^[+0-9()\s-]+$/),
  email: z.string().email().max(100).optional().or(z.literal("")),
  branchId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid({ message: "Center / Group is required. Every customer must belong to a group." }),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  guardianName: z.string().max(120).optional().nullable().or(z.literal("")),
  dateOfBirth: z.union([z.string(), z.date()]).optional().nullable(),
  gender: z.string().max(20).optional().nullable().or(z.literal("")),
  aadhaarNumber: z.string().max(30).optional().nullable().or(z.literal("")),
  panNumber: z.string().max(30).optional().nullable().or(z.literal("")),
  occupation: z.string().max(100).optional().nullable().or(z.literal("")),
  residentialAddress: z.string().max(1000).optional().nullable().or(z.literal("")),
  nomineeName: z.string().max(120).optional().nullable().or(z.literal("")),
  guarantorName: z.string().max(120).optional().nullable().or(z.literal("")),
  passportPhoto: z.string().optional().nullable().or(z.literal("")),
  aadhaarFrontDoc: z.string().optional().nullable().or(z.literal("")),
  aadhaarBackDoc: z.string().optional().nullable().or(z.literal("")),
  panPhoto: z.string().optional().nullable().or(z.literal("")),

  // Personal and Family Details
  maritalStatus: z
    .enum(["SINGLE", "MARRIED", "WIDOWED", "DIVORCED", "OTHER", "Single", "Married", "Widowed", "Divorced", "Other"])
    .optional()
    .nullable()
    .or(z.literal("")),
  familyMembers: z
    .union([z.number().int().min(0), z.string()])
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine(
      (val) => {
        if (val === "" || val === null || val === undefined) return true;
        const n = typeof val === "number" ? val : parseInt(val, 10);
        return !isNaN(n) && n >= 0 && Number.isInteger(n);
      },
      { message: "Family members must be a non-negative integer" }
    ),

  // Occupation and Financial Details
  primaryOccupation: z.string().max(120).optional().nullable().or(z.literal("")),
  communityId: z.string().uuid().optional().nullable().or(z.literal("")),
  educationId: z.string().uuid().optional().nullable().or(z.literal("")),
  annualIncome: z
    .union([z.number().min(0), z.string()])
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine(
      (val) => {
        if (val === "" || val === null || val === undefined) return true;
        const num = typeof val === "number" ? val : parseFloat(val);
        return !isNaN(num) && num >= 0;
      },
      { message: "Annual income must be a valid non-negative number" }
    ),

  applicationFormFile: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      buffer: z.instanceof(Buffer),
    })
    .optional(),
});

const groupSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  branchId: z.string().uuid().nullable().optional(),
  meetingDay: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const updateGroupSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  branchId: z.string().uuid().nullable().optional(),
  meetingDay: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const assignmentSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  groupId: z.string().uuid(),
  role: z.enum(["MEMBER", "AGENT", "LEAD"]).default("MEMBER"),
});

export async function createCustomer(caller: AuthenticatedUser, input: z.infer<typeof customerSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "customer.create");

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid customer payload");
  }

  const payload = parsed.data;

  validateDocumentPayload(payload.passportPhoto, "Passport Photo");
  validateDocumentPayload(payload.aadhaarFrontDoc, "Aadhaar Front Document");
  validateDocumentPayload(payload.aadhaarBackDoc, "Aadhaar Back Document");
  validateDocumentPayload(payload.panPhoto, "PAN Photo");

  if (payload.communityId) {
    const community = await prisma.masterCatalogItem.findFirst({
      where: { id: payload.communityId, organizationId: payload.organizationId },
    });
    if (!community) {
      throw new NotFoundError("MasterCatalogItem (Community/Religion)", payload.communityId);
    }
  }

  if (payload.educationId) {
    const education = await prisma.masterCatalogItem.findFirst({
      where: { id: payload.educationId, organizationId: payload.organizationId },
    });
    if (!education) {
      throw new NotFoundError("MasterCatalogItem (Education/Literacy)", payload.educationId);
    }
  }

  // Verify Mandatory Group exists and is accessible
  const group = await prisma.group.findUnique({
    where: { id: payload.groupId },
  });
  if (!group || group.organizationId !== payload.organizationId) {
    throw new NotFoundError("Group", payload.groupId);
  }

  if (group.branchId) {
    requireBranchScope(caller, group.branchId);
  }

  const assignedBranchId = payload.branchId || group.branchId || null;

  const orConditions: Prisma.CustomerWhereInput[] = [
    { customerCode: payload.customerCode },
    { phone: payload.phone },
  ];

  if (payload.aadhaarNumber && payload.aadhaarNumber.trim().length > 0) {
    orConditions.push({ aadhaarNumber: payload.aadhaarNumber.trim() });
  }

  const existingCustomer = await prisma.customer.findFirst({
    where: {
      organizationId: payload.organizationId,
      OR: orConditions,
    },
  });

  if (existingCustomer) {
    if (existingCustomer.customerCode === payload.customerCode) {
      throw new ConflictError(
        `Customer code "${payload.customerCode}" already exists in this organization`
      );
    } else if (existingCustomer.phone === payload.phone) {
      throw new ConflictError(
        `Phone number "${payload.phone}" is already registered in this organization`
      );
    } else {
      throw new ConflictError(
        `Aadhaar number "${payload.aadhaarNumber}" is already registered in this organization`
      );
    }
  }

  let dateOfBirth: Date | null = null;
  if (payload.dateOfBirth) {
    const d = new Date(payload.dateOfBirth);
    if (!isNaN(d.getTime())) {
      dateOfBirth = d;
    }
  }

  let familyMembers: number | null = null;
  if (payload.familyMembers !== undefined && payload.familyMembers !== null && payload.familyMembers !== "") {
    familyMembers = typeof payload.familyMembers === "number" ? payload.familyMembers : parseInt(payload.familyMembers, 10);
  }

  let annualIncome: Prisma.Decimal | null = null;
  if (payload.annualIncome !== undefined && payload.annualIncome !== null && payload.annualIncome !== "") {
    annualIncome = new Prisma.Decimal(payload.annualIncome);
  }

  const maritalStatus = payload.maritalStatus ? payload.maritalStatus.toUpperCase() : null;
  const primaryOccupation = payload.primaryOccupation?.trim() || null;
  const occupation = payload.occupation?.trim() || primaryOccupation || null;

  const tempCustomerId = crypto.randomUUID();
  let savedFileMetadata: { fileName: string; storagePath: string; mimeType: string; fileSize: number } | null = null;

  if (payload.applicationFormFile) {
    savedFileMetadata = await saveCustomerApplicationForm(
      payload.organizationId,
      tempCustomerId,
      payload.applicationFormFile
    );
  }

  try {
    const createdCustomer = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          id: tempCustomerId,
          organizationId: payload.organizationId,
          customerCode: payload.customerCode,
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email || null,
          branchId: assignedBranchId,
          groupId: payload.groupId,
          status: payload.status,
          guardianName: payload.guardianName || null,
          dateOfBirth,
          gender: payload.gender || null,
          aadhaarNumber: payload.aadhaarNumber ? payload.aadhaarNumber.trim() : null,
          panNumber: payload.panNumber ? payload.panNumber.trim().toUpperCase() : null,
          occupation,
          residentialAddress: payload.residentialAddress || null,
          nomineeName: payload.nomineeName || null,
          guarantorName: payload.guarantorName || null,
          passportPhoto: payload.passportPhoto || null,
          aadhaarFrontDoc: payload.aadhaarFrontDoc || null,
          aadhaarBackDoc: payload.aadhaarBackDoc || null,
          panPhoto: payload.panPhoto || null,

          // Personal and Family Details
          maritalStatus,
          familyMembers,

          // Occupation and Financial Details
          primaryOccupation,
          communityId: payload.communityId || null,
          educationId: payload.educationId || null,
          annualIncome,
        },
        include: {
          branch: true,
          community: true,
          education: true,
          group: true,
          documents: true,
        },
      });

      // Mandatory CustomerGroup record
      await tx.customerGroup.create({
        data: {
          organizationId: payload.organizationId,
          customerId: customer.id,
          groupId: payload.groupId,
          role: "MEMBER",
          status: "ACTIVE",
        },
      });

      // CustomerDocument record if file uploaded
      if (savedFileMetadata) {
        await tx.customerDocument.create({
          data: {
            organizationId: payload.organizationId,
            customerId: customer.id,
            documentType: "APPLICATION_FORM",
            fileName: savedFileMetadata.fileName,
            storagePath: savedFileMetadata.storagePath,
            mimeType: savedFileMetadata.mimeType,
            fileSize: savedFileMetadata.fileSize,
          },
        });
      }

      return customer;
    });

    await recordAuditEvent({
      organizationId: caller.organizationId,
      actorId: caller.userId,
      action: "CUSTOMER_CREATED",
      entityType: "Customer",
      entityId: createdCustomer.id,
      metadata: {
        customerCode: createdCustomer.customerCode,
        phone: createdCustomer.phone,
        groupId: payload.groupId,
        groupName: group.name,
        hasApplicationForm: Boolean(savedFileMetadata),
      },
    });

    return createdCustomer;
  } catch (err) {
    if (savedFileMetadata) {
      await deleteStoredFile(savedFileMetadata.storagePath).catch(() => {});
    }
    throw err;
  }
}

export async function createGroup(caller: AuthenticatedUser, input: z.infer<typeof groupSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requireAnyPermission(caller, "group.create", "loan.application.create");

  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid group payload");
  }

  const payload = parsed.data;

  const existingGroup = await prisma.group.findFirst({
    where: {
      organizationId: payload.organizationId,
      OR: [{ code: payload.code }, { name: payload.name }],
    },
  });

  if (existingGroup) {
    throw new ConflictError(
      existingGroup.code === payload.code
        ? `Group code "${payload.code}" already exists in this organization`
        : `Group name "${payload.name}" already exists in this organization`
    );
  }

  return prisma.group.create({
    data: {
      organizationId: payload.organizationId,
      code: payload.code,
      name: payload.name,
      branchId: payload.branchId || null,
      meetingDay: payload.meetingDay || null,
      status: payload.status,
    },
  });
}

export async function updateGroup(caller: AuthenticatedUser, groupId: string, input: z.infer<typeof updateGroupSchema>) {
  requireAnyPermission(caller, "group.edit", "loan.application.create");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
  });

  if (!group || group.organizationId !== caller.organizationId) {
    throw new NotFoundError("Group", groupId);
  }

  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid update payload");
  }

  if (parsed.data.name && parsed.data.name !== group.name) {
    const conflict = await prisma.group.findFirst({
      where: {
        organizationId: caller.organizationId,
        name: parsed.data.name,
        NOT: { id: groupId },
      },
    });
    if (conflict) {
      throw new ConflictError(`Group name "${parsed.data.name}" already exists in this organization`);
    }
  }

  return prisma.group.update({
    where: { id: groupId },
    data: {
      name: parsed.data.name ?? group.name,
      branchId: parsed.data.branchId !== undefined ? (parsed.data.branchId || null) : group.branchId,
      meetingDay: parsed.data.meetingDay !== undefined ? (parsed.data.meetingDay || null) : group.meetingDay,
      status: parsed.data.status ?? group.status,
    },
  });
}

export async function deleteGroup(caller: AuthenticatedUser, groupId: string) {
  requireAnyPermission(caller, "group.delete", "loan.application.create");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      customerGroups: true,
      collectionSheets: true,
    },
  });

  if (!group || group.organizationId !== caller.organizationId) {
    throw new NotFoundError("Group", groupId);
  }

  if (group.customerGroups.length > 0) {
    throw new ValidationError(
      `Cannot delete group "${group.name}". It currently has ${group.customerGroups.length} assigned member(s). Reassign or remove members first.`
    );
  }

  if (group.collectionSheets.length > 0) {
    throw new ValidationError(
      `Cannot delete group "${group.name}". It is linked to existing collection sheets.`
    );
  }

  return prisma.group.delete({
    where: { id: groupId },
  });
}

export async function assignCustomerToGroup(caller: AuthenticatedUser, input: z.infer<typeof assignmentSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requireAnyPermission(caller, "group.membership.manage", "group.edit", "loan.application.create");

  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid group assignment payload");
  }

  const payload = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: payload.customerId } });
  if (!customer || customer.organizationId !== payload.organizationId) {
    throw new NotFoundError("Customer", payload.customerId);
  }

  const group = await prisma.group.findUnique({ where: { id: payload.groupId } });
  if (!group || group.organizationId !== payload.organizationId) {
    throw new NotFoundError("Group", payload.groupId);
  }

  const existingAssignment = await prisma.customerGroup.findFirst({
    where: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      groupId: payload.groupId,
    },
  });

  if (existingAssignment) {
    throw new ConflictError("Customer is already assigned to this group");
  }

  return prisma.customerGroup.create({
    data: {
      organizationId: payload.organizationId,
      customerId: payload.customerId,
      groupId: payload.groupId,
      role: payload.role,
      status: "ACTIVE",
    },
  });
}

export async function getCustomers(
  caller: AuthenticatedUser,
  filter?: {
    search?: string;
    branchId?: string;
    status?: string;
    kycStatus?: "VERIFIED" | "PENDING" | string;
    page?: number;
    pageSize?: number;
  }
) {
  requireAnyPermission(
    caller,
    "customer.list.view",
    "customer.detail.view",
    "loan.application.create",
    "loan.application.view",
    "loan.account.read",
    "savings.account.view",
    "reports.customer.view"
  );

  const page = Math.max(1, filter?.page || 1);
  const pageSize = Math.min(500, Math.max(1, filter?.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CustomerWhereInput = {
    organizationId: caller.organizationId,
  };

  if (filter?.branchId && filter.branchId !== "ALL") {
    where.branchId = filter.branchId;
  }

  if (filter?.status && filter.status !== "ALL") {
    where.status = filter.status;
  }

  if (filter?.kycStatus && filter.kycStatus !== "ALL") {
    if (filter.kycStatus === "VERIFIED") {
      where.aadhaarNumber = { not: null };
    } else if (filter.kycStatus === "PENDING") {
      where.aadhaarNumber = null;
    }
  }

  if (filter?.search && filter.search.trim()) {
    const term = filter.search.trim();
    where.OR = [
      { fullName: { contains: term } },
      { customerCode: { contains: term } },
      { phone: { contains: term } },
      { aadhaarNumber: { contains: term } },
      { occupation: { contains: term } },
      { primaryOccupation: { contains: term } },
      { guardianName: { contains: term } },
    ];
  }

  const [totalItems, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: {
        branch: true,
        group: true,
        community: true,
        education: true,
        documents: true,
        customerGroups: { include: { group: true } },
        loanAccounts: { select: { id: true, status: true, principalOutstanding: true } },
        savingsAccounts: { select: { id: true, status: true, balance: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

export async function getGroups(caller: AuthenticatedUser, branchId?: string) {
  requireAnyPermission(caller, "group.view", "customer.list.view", "loan.account.read", "loan.application.create");

  return prisma.group.findMany({
    where: {
      organizationId: caller.organizationId,
      branchId: branchId && branchId !== "ALL" ? branchId : undefined,
    },
    include: {
      branch: true,
      customerGroups: { include: { customer: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getCustomerSummaryKPIs(caller: AuthenticatedUser) {
  requireAnyPermission(caller, "customer.list.view", "reports.customer.view", "loan.application.create");

  const [totalCustomers, activeBorrowers, jlgMapped, verifiedCount] = await Promise.all([
    prisma.customer.count({ where: { organizationId: caller.organizationId } }),
    prisma.customer.count({
      where: {
        organizationId: caller.organizationId,
        loanAccounts: { some: { status: "ACTIVE" } },
      },
    }),
    prisma.customerGroup.count({
      where: {
        organizationId: caller.organizationId,
        status: "ACTIVE",
      },
    }),
    prisma.customer.count({
      where: {
        organizationId: caller.organizationId,
        aadhaarNumber: { not: null },
      },
    }),
  ]);

  const pendingKyc = Math.max(0, totalCustomers - verifiedCount);
  const kycVerifiedPercent = totalCustomers > 0 ? Math.round((verifiedCount / totalCustomers) * 100) : 0;

  return {
    totalCustomers,
    activeBorrowers,
    kycVerifiedPercent,
    jlgMapped,
    pendingKyc,
  };
}

export async function getCustomerById(caller: AuthenticatedUser, customerId: string) {
  requireAnyPermission(
    caller,
    "customer.detail.view",
    "customer.list.view",
    "loan.application.view",
    "loan.application.create",
    "loan.account.read"
  );

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      branch: true,
      group: true,
      community: true,
      education: true,
      documents: true,
      customerGroups: { include: { group: true } },
      loanAccounts: true,
      savingsAccounts: true,
    },
  });

  if (!customer || customer.organizationId !== caller.organizationId) {
    throw new NotFoundError("Customer", customerId);
  }

  return customer;
}

const updateCustomerSchema = customerSchema
  .partial()
  .omit({ organizationId: true })
  .extend({
    removeApplicationForm: z.boolean().optional(),
  });

export async function updateCustomer(
  caller: AuthenticatedUser,
  customerId: string,
  input: z.infer<typeof updateCustomerSchema>
) {
  requireAnyPermission(caller, "customer.edit", "loan.application.create");

  const existingCustomer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!existingCustomer || existingCustomer.organizationId !== caller.organizationId) {
    throw new NotFoundError("Customer", customerId);
  }

  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid update payload");
  }

  const payload = parsed.data;

  validateDocumentPayload(payload.passportPhoto, "Passport Photo");
  validateDocumentPayload(payload.aadhaarFrontDoc, "Aadhaar Front Document");
  validateDocumentPayload(payload.aadhaarBackDoc, "Aadhaar Back Document");
  validateDocumentPayload(payload.panPhoto, "PAN Photo");

  if (payload.communityId) {
    const community = await prisma.masterCatalogItem.findFirst({
      where: { id: payload.communityId, organizationId: caller.organizationId },
    });
    if (!community) {
      throw new NotFoundError("MasterCatalogItem (Community/Religion)", payload.communityId);
    }
  }

  if (payload.educationId) {
    const education = await prisma.masterCatalogItem.findFirst({
      where: { id: payload.educationId, organizationId: caller.organizationId },
    });
    if (!education) {
      throw new NotFoundError("MasterCatalogItem (Education/Literacy)", payload.educationId);
    }
  }

  if (payload.groupId) {
    const group = await prisma.group.findUnique({
      where: { id: payload.groupId },
    });
    if (!group || group.organizationId !== caller.organizationId) {
      throw new NotFoundError("Group", payload.groupId);
    }
    if (group.branchId) {
      requireBranchScope(caller, group.branchId);
    }
  }

  if (payload.customerCode && payload.customerCode !== existingCustomer.customerCode) {
    const conflict = await prisma.customer.findFirst({
      where: {
        organizationId: caller.organizationId,
        customerCode: payload.customerCode,
        id: { not: customerId },
      },
    });
    if (conflict) {
      throw new ConflictError(`Customer code "${payload.customerCode}" already exists`);
    }
  }

  if (payload.phone && payload.phone !== existingCustomer.phone) {
    const conflict = await prisma.customer.findFirst({
      where: {
        organizationId: caller.organizationId,
        phone: payload.phone,
        id: { not: customerId },
      },
    });
    if (conflict) {
      throw new ConflictError(`Phone number "${payload.phone}" already exists`);
    }
  }

  let dateOfBirth = existingCustomer.dateOfBirth;
  if (payload.dateOfBirth !== undefined) {
    if (payload.dateOfBirth === null || payload.dateOfBirth === "") {
      dateOfBirth = null;
    } else {
      const d = new Date(payload.dateOfBirth);
      if (!isNaN(d.getTime())) {
        dateOfBirth = d;
      }
    }
  }

  let familyMembers: number | null | undefined = undefined;
  if (payload.familyMembers !== undefined) {
    if (payload.familyMembers === null || payload.familyMembers === "") {
      familyMembers = null;
    } else {
      familyMembers = typeof payload.familyMembers === "number" ? payload.familyMembers : parseInt(payload.familyMembers, 10);
    }
  }

  let annualIncome: Prisma.Decimal | null | undefined = undefined;
  if (payload.annualIncome !== undefined) {
    if (payload.annualIncome === null || payload.annualIncome === "") {
      annualIncome = null;
    } else {
      annualIncome = new Prisma.Decimal(payload.annualIncome);
    }
  }

  let newDocMetadata: { fileName: string; storagePath: string; mimeType: string; fileSize: number } | null = null;
  if (payload.applicationFormFile) {
    newDocMetadata = await saveCustomerApplicationForm(
      caller.organizationId,
      customerId,
      payload.applicationFormFile
    );
  }

  try {
    let oldDocPathToDelete: string | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      if (payload.removeApplicationForm || newDocMetadata) {
        const existingDoc = await tx.customerDocument.findFirst({
          where: {
            organizationId: caller.organizationId,
            customerId,
            documentType: "APPLICATION_FORM",
          },
        });
        if (existingDoc) {
          oldDocPathToDelete = existingDoc.storagePath;
          await tx.customerDocument.delete({
            where: { id: existingDoc.id },
          });
        }
      }

      if (newDocMetadata) {
        await tx.customerDocument.create({
          data: {
            organizationId: caller.organizationId,
            customerId,
            documentType: "APPLICATION_FORM",
            fileName: newDocMetadata.fileName,
            storagePath: newDocMetadata.storagePath,
            mimeType: newDocMetadata.mimeType,
            fileSize: newDocMetadata.fileSize,
          },
        });
      }

      const cust = await tx.customer.update({
        where: { id: customerId },
        data: {
          ...(payload.customerCode ? { customerCode: payload.customerCode } : {}),
          ...(payload.fullName ? { fullName: payload.fullName } : {}),
          ...(payload.phone ? { phone: payload.phone } : {}),
          ...(payload.email !== undefined ? { email: payload.email || null } : {}),
          ...(payload.branchId !== undefined ? { branchId: payload.branchId || null } : {}),
          ...(payload.groupId ? { groupId: payload.groupId } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.guardianName !== undefined ? { guardianName: payload.guardianName || null } : {}),
          dateOfBirth,
          ...(payload.gender !== undefined ? { gender: payload.gender || null } : {}),
          ...(payload.aadhaarNumber !== undefined ? { aadhaarNumber: payload.aadhaarNumber ? payload.aadhaarNumber.trim() : null } : {}),
          ...(payload.panNumber !== undefined ? { panNumber: payload.panNumber ? payload.panNumber.trim().toUpperCase() : null } : {}),
          ...(payload.occupation !== undefined ? { occupation: payload.occupation || null } : {}),
          ...(payload.residentialAddress !== undefined ? { residentialAddress: payload.residentialAddress || null } : {}),
          ...(payload.nomineeName !== undefined ? { nomineeName: payload.nomineeName || null } : {}),
          ...(payload.guarantorName !== undefined ? { guarantorName: payload.guarantorName || null } : {}),
          ...(payload.passportPhoto !== undefined ? { passportPhoto: payload.passportPhoto || null } : {}),
          ...(payload.aadhaarFrontDoc !== undefined ? { aadhaarFrontDoc: payload.aadhaarFrontDoc || null } : {}),
          ...(payload.aadhaarBackDoc !== undefined ? { aadhaarBackDoc: payload.aadhaarBackDoc || null } : {}),
          ...(payload.panPhoto !== undefined ? { panPhoto: payload.panPhoto || null } : {}),

          // Personal and Family Details
          ...(payload.maritalStatus !== undefined ? { maritalStatus: payload.maritalStatus ? payload.maritalStatus.toUpperCase() : null } : {}),
          ...(payload.familyMembers !== undefined ? { familyMembers } : {}),

          // Occupation and Financial Details
          ...(payload.primaryOccupation !== undefined ? { primaryOccupation: payload.primaryOccupation?.trim() || null } : {}),
          ...(payload.communityId !== undefined ? { communityId: payload.communityId || null } : {}),
          ...(payload.educationId !== undefined ? { educationId: payload.educationId || null } : {}),
          ...(payload.annualIncome !== undefined ? { annualIncome } : {}),
        },
        include: {
          branch: true,
          group: true,
          community: true,
          education: true,
          documents: true,
          customerGroups: { include: { group: true } },
          loanAccounts: true,
          savingsAccounts: true,
        },
      });

      // Synchronize customerGroups if groupId changed
      if (payload.groupId && payload.groupId !== existingCustomer.groupId) {
        await tx.customerGroup.upsert({
          where: {
            organizationId_customerId_groupId: {
              organizationId: caller.organizationId,
              customerId,
              groupId: payload.groupId,
            },
          },
          update: { status: "ACTIVE" },
          create: {
            organizationId: caller.organizationId,
            customerId,
            groupId: payload.groupId,
            role: "MEMBER",
            status: "ACTIVE",
          },
        });
      }

      return cust;
    });

    if (oldDocPathToDelete) {
      await deleteStoredFile(oldDocPathToDelete).catch(() => {});
    }

    const sanitizedUpdatedFields = Object.keys(payload).filter(
      (k) => k !== "applicationFormFile"
    );
    if (newDocMetadata) sanitizedUpdatedFields.push("applicationForm");
    if (payload.removeApplicationForm) sanitizedUpdatedFields.push("applicationForm (removed)");

    await recordAuditEvent({
      organizationId: caller.organizationId,
      actorId: caller.userId,
      action: "CUSTOMER_UPDATED",
      entityType: "Customer",
      entityId: customerId,
      metadata: {
        customerCode: updated.customerCode,
        updatedFields: sanitizedUpdatedFields,
        groupId: updated.groupId,
      },
    });

    return updated;
  } catch (err) {
    if (newDocMetadata) {
      await deleteStoredFile(newDocMetadata.storagePath).catch(() => {});
    }
    throw err;
  }
}

export async function verifyCustomerKyc(
  caller: AuthenticatedUser,
  customerId: string,
  status: "VERIFIED" | "REJECTED",
  reason?: string
) {
  if (status === "VERIFIED") {
    requirePermission(caller, "customer.kyc.verify");
  } else {
    requirePermission(caller, "customer.kyc.reject");
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer || customer.organizationId !== caller.organizationId) {
    throw new NotFoundError("Customer", customerId);
  }

  // Maker-checker check: find who created the customer
  const creationAudit = await prisma.auditEvent.findFirst({
    where: {
      organizationId: caller.organizationId,
      entityType: "Customer",
      entityId: customer.id,
      action: "CUSTOMER_CREATED",
    },
    orderBy: { createdAt: "asc" },
  });

  if (creationAudit?.actorId) {
    assertMakerCheckerSeparation(creationAudit.actorId, caller.userId, "KYC verification");
  }

  const updated = customer;

  await prisma.approvalHistory.create({
    data: {
      organizationId: caller.organizationId,
      entityType: "CUSTOMER_KYC",
      entityId: customer.id,
      action: status === "VERIFIED" ? "APPROVE" : "REJECT",
      statusBefore: customer.status,
      statusAfter: status,
      makerId: creationAudit?.actorId || null,
      checkerId: caller.userId,
      comments: reason || (status === "VERIFIED" ? "KYC documents verified" : "KYC documents rejected"),
    },
  });

  await recordAuditEvent({
    organizationId: caller.organizationId,
    actorId: caller.userId,
    action: `CUSTOMER_KYC_${status}`,
    entityType: "Customer",
    entityId: customer.id,
    metadata: {
      customerCode: customer.customerCode,
      status,
      reason,
    },
  });

  return updated;
}

export async function getBranches(caller: AuthenticatedUser) {
  return prisma.branch.findMany({
    where: {
      organizationId: caller.organizationId,
      status: "ACTIVE",
    },
    orderBy: { name: "asc" },
  });
}

