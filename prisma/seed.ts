import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedAccountingData } from "./seed-accounting";
import { seedPermissionsAndProfiles } from "../src/lib/permissions/permission-seeder";

const prisma = new PrismaClient();

const SYSTEM_PERMISSIONS = [
  // Organizations and branches
  { code: "org.manage", module: "organizations", description: "Manage organization profile and settings" },
  { code: "branch.manage", module: "organizations", description: "Create and manage branch offices" },

  // Identity and Access
  { code: "user.manage", module: "identity", description: "Manage staff accounts and profiles" },
  { code: "user.role.assign", module: "identity", description: "Assign roles and branch scopes to users" },

  // Loans
  { code: "loan.scheme.read", module: "loans", description: "View loan schemes and interest rate tables" },
  { code: "loan.scheme.manage", module: "loans", description: "Create and update loan scheme versions" },
  { code: "loan.application.create", module: "loans", description: "Create and save draft loan applications" },
  { code: "loan.application.submit", module: "loans", description: "Submit loan applications for review" },
  { code: "loan.application.approve", module: "loans", description: "Approve or reject loan applications" },
  { code: "loan.disbursement.create", module: "loans", description: "Prepare disbursement vouchers" },
  { code: "loan.disbursement.approve", module: "loans", description: "Authorize loan disbursements (maker-checker)" },
  { code: "loan.disbursement.post", module: "loans", description: "Post loan disbursement and ledger entries" },
  { code: "loan.account.read", module: "loans", description: "View loan accounts and repayment schedules" },
  { code: "loan.account.manage", module: "loans", description: "Manage rescheduling, waivers, or closure" },

  // Collections
  { code: "collection.receipt.create", module: "collections", description: "Record daily collection repayments" },
  { code: "collection.receipt.reverse", module: "collections", description: "Request or authorize receipt reversals" },
  { code: "collection.sheet.manage", module: "collections", description: "Generate and reconcile collection sheets" },

  // Savings & Deposits
  { code: "savings.account.manage", module: "savings", description: "Open and service savings accounts" },
  { code: "savings.deposit.create", module: "savings", description: "Accept member savings deposits" },
  { code: "savings.withdrawal.approve", module: "savings", description: "Authorize savings withdrawals" },
  { code: "deposit.product.manage", module: "term-deposits", description: "Manage RD and FD product parameters" },
  { code: "deposit.interest.post", module: "term-deposits", description: "Run and post periodic deposit interest" },

  // Expenses
  { code: "expense.submit", module: "expenses", description: "Submit operational expense vouchers" },
  { code: "expense.approve", module: "expenses", description: "Approve operational expense claims" },
  { code: "expense.post", module: "expenses", description: "Post expense payouts and journal entries" },

  // Accounting
  { code: "accounting.ledger.read", module: "accounting", description: "View chart of accounts, cashbook, daybook" },
  { code: "accounting.period.close", module: "accounting", description: "Lock and close fiscal accounting periods" },

  // Reports & Audit
  { code: "report.read", module: "reports", description: "View operational and portfolio reports" },
  { code: "report.export", module: "reports", description: "Export sensitive reports and client statements" },
  { code: "audit.event.read", module: "audit", description: "Inspect system audit trails and privileged logs" },
];

async function main() {
  console.log("Seeding baseline permissions...");
  for (const perm of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, module: perm.module },
      create: perm,
    });
  }
  console.log(`Seeded ${SYSTEM_PERMISSIONS.length} permissions.`);

  // Seed default Demo Organization
  const org = await prisma.organization.upsert({
    where: { code: "RAYHAN-MFI" },
    update: {},
    create: {
      code: "RAYHAN-MFI",
      name: "Rayhan Microfinance Operations",
      currency: "INR",
      timezone: "Asia/Kolkata",
    },
  });
  console.log(`Seeded organization: ${org.name} (${org.code})`);

  // Seed Main Branch
  const mainBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "MAIN-001",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: "MAIN-001",
      name: "Head Office Branch",
    },
  });
  console.log(`Seeded branch: ${mainBranch.name} (${mainBranch.code})`);

  // Seed Organization Admin Role with all permissions
  const orgAdminRole = await prisma.role.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "ORG_ADMIN",
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: "ORG_ADMIN",
      name: "Organization Administrator",
      description: "Full control over organization settings, staff, products, and ledger.",
      isSystem: true,
    },
  });

  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: orgAdminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: orgAdminRole.id,
        permissionId: perm.id,
      },
    });
  }
  console.log(`Assigned ${allPerms.length} permissions to role: ${orgAdminRole.code}`);

  // Seed initial Admin User (password: Admin@12345)
  const passwordHash = await bcrypt.hash("Admin@12345", 10);
  const adminUser = await prisma.user.upsert({
    where: {
      organizationId_username: {
        organizationId: org.id,
        username: "admin",
      },
    },
    update: {
      passwordHash,
    },
    create: {
      organizationId: org.id,
      username: "admin",
      email: "admin@rayhan-mfi.local",
      fullName: "System Administrator",
      passwordHash,
      status: "ACTIVE",
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: orgAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: orgAdminRole.id,
    },
  });

  // Assign organization-wide scope to admin user
  const existingScope = await prisma.userScope.findFirst({
    where: {
      userId: adminUser.id,
      scopeType: "ORGANIZATION",
      branchId: null,
    },
  });

  if (!existingScope) {
    await prisma.userScope.create({
      data: {
        userId: adminUser.id,
        branchId: null,
        scopeType: "ORGANIZATION",
      },
    });
  }

  console.log(`Seeded default admin user: ${adminUser.username} (${adminUser.email})`);

  // Seed granular permissions and reusable permission profiles
  await seedPermissionsAndProfiles(org.id);

  // Seed Accounting Foundation
  await seedAccountingData();
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
