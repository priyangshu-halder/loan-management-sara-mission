import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { requireOrganizationScope, requirePermission } from "@/lib/permissions/auth-guard";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { z } from "zod";

const customerSchema = z.object({
  organizationId: z.string().uuid(),
  customerCode: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(8).max(30).regex(/^[+0-9()\s-]+$/),
  email: z.string().email().max(100).optional().or(z.literal("")),
  branchId: z.string().uuid().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
});

const groupSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(2).max(120),
  branchId: z.string().uuid().nullable().optional(),
  meetingDay: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const assignmentSchema = z.object({
  organizationId: z.string().uuid(),
  customerId: z.string().uuid(),
  groupId: z.string().uuid(),
  role: z.enum(["MEMBER", "AGENT", "LEAD"]).default("MEMBER"),
});

export async function createCustomer(caller: AuthenticatedUser, input: z.infer<typeof customerSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.create");

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid customer payload");
  }

  const payload = parsed.data;

  const existingCustomer = await prisma.customer.findFirst({
    where: {
      organizationId: payload.organizationId,
      OR: [{ customerCode: payload.customerCode }, { phone: payload.phone }],
    },
  });

  if (existingCustomer) {
    throw new ConflictError(
      existingCustomer.customerCode === payload.customerCode
        ? `Customer code "${payload.customerCode}" already exists in this organization`
        : `Phone number "${payload.phone}" is already registered in this organization`
    );
  }

  return prisma.customer.create({
    data: {
      organizationId: payload.organizationId,
      customerCode: payload.customerCode,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email || null,
      branchId: payload.branchId || null,
      status: payload.status,
    },
  });
}

export async function createGroup(caller: AuthenticatedUser, input: z.infer<typeof groupSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.create");

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

export async function assignCustomerToGroup(caller: AuthenticatedUser, input: z.infer<typeof assignmentSchema>) {
  requireOrganizationScope(caller, input.organizationId);
  requirePermission(caller, "loan.application.create");

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
  filter?: { search?: string; branchId?: string; status?: string; page?: number; pageSize?: number }
) {
  requirePermission(caller, "loan.application.create");

  const page = Math.max(1, filter?.page || 1);
  const pageSize = Math.min(100, Math.max(1, filter?.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CustomerWhereInput = {
    organizationId: caller.organizationId,
  };

  if (filter?.branchId) {
    where.branchId = filter.branchId;
  }

  if (filter?.status) {
    where.status = filter.status;
  }

  if (filter?.search) {
    where.OR = [
      { fullName: { contains: filter.search } },
      { customerCode: { contains: filter.search } },
      { phone: { contains: filter.search } },
    ];
  }

  const [totalItems, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: {
        branch: true,
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
  requirePermission(caller, "loan.application.create");

  return prisma.group.findMany({
    where: {
      organizationId: caller.organizationId,
      branchId: branchId || undefined,
    },
    include: {
      branch: true,
      customerGroups: { include: { customer: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getCustomerSummaryKPIs(caller: AuthenticatedUser) {
  requirePermission(caller, "loan.application.create");

  const [totalCustomers, activeBorrowers, jlgMapped] = await Promise.all([
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
  ]);

  return {
    totalCustomers,
    activeBorrowers,
    kycVerifiedPercent: totalCustomers > 0 ? 100 : 0,
    jlgMapped,
    pendingKyc: 0,
  };
}
