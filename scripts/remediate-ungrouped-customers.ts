import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function auditAndRemediateUngroupedCustomers() {
  console.log("==================================================================");
  console.log("CUSTOMER GROUP AFFILIATION AUDIT & REMEDIATION REPORT");
  console.log("==================================================================");

  // 1. Fetch all customers and their group assignments
  const customers = await prisma.customer.findMany({
    include: {
      customerGroups: {
        include: {
          group: true,
        },
      },
      organization: true,
      branch: true,
    },
  });

  const totalCustomers = customers.length;
  const ungrouped = customers.filter((c) => c.customerGroups.length === 0);
  const alreadyGrouped = customers.filter((c) => c.customerGroups.length > 0);

  console.log(`Total Customers in Database: ${totalCustomers}`);
  console.log(`Already Assigned to Group:   ${alreadyGrouped.length}`);
  console.log(`Ungrouped Customers Count:   ${ungrouped.length}`);
  console.log("------------------------------------------------------------------");

  if (ungrouped.length === 0) {
    console.log("✓ All customers are assigned to valid groups. Ready for mandatory group migration.");
    return { total: totalCustomers, ungrouped: 0, remediated: 0 };
  }

  console.log("\n[WARNING] Found ungrouped customers requiring explicit group assignment:");
  ungrouped.forEach((c, idx) => {
    console.log(
      `  ${idx + 1}. [${c.customerCode}] ${c.fullName} (Org: ${c.organization.code}, Branch: ${
        c.branch?.name || "Main"
      })`
    );
  });

  console.log("\nExecuting audited explicit remediation into dedicated holding groups...");

  let remediatedCount = 0;

  for (const c of ungrouped) {
    // Find or create an explicit, clearly identified administrative holding group per branch/organization
    const holdingGroupCode = `GRP-HOLDING-${(c.branch?.code || c.organization.code || "MAIN").toUpperCase()}`;
    const holdingGroupName = `Pending Center Reassignment (${c.branch?.name || c.organization.name})`;

    const holdingGroup = await prisma.group.upsert({
      where: {
        organizationId_code: {
          organizationId: c.organizationId,
          code: holdingGroupCode,
        },
      },
      update: {},
      create: {
        organizationId: c.organizationId,
        branchId: c.branchId,
        code: holdingGroupCode,
        name: holdingGroupName,
        meetingDay: "MONDAY",
        status: "ACTIVE",
      },
    });

    // Create audited customerGroup link
    await prisma.customerGroup.create({
      data: {
        organizationId: c.organizationId,
        customerId: c.id,
        groupId: holdingGroup.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    // Record audit event for compliance and traceability
    await prisma.auditEvent.create({
      data: {
        organizationId: c.organizationId,
        action: "CUSTOMER_GROUP_REMEDIATION",
        entityType: "Customer",
        entityId: c.id,
        metadata: JSON.stringify({
          customerCode: c.customerCode,
          assignedHoldingGroup: holdingGroup.code,
          reason: "Migration to mandatory customer group constraint. Requires staff field verification.",
          timestamp: new Date().toISOString(),
        }),
      },
    });

    remediatedCount++;
  }

  console.log(`\n✓ Remediated ${remediatedCount} customer(s).`);
  console.log("Each record has been placed in an audited 'Pending Center Reassignment' group");
  console.log("and an audit event has been recorded. Staff can reassign to specific field centers.");
  console.log("==================================================================\n");

  return { total: totalCustomers, ungrouped: ungrouped.length, remediated: remediatedCount };
}

if (require.main === module) {
  auditAndRemediateUngroupedCustomers()
    .catch((err) => {
      console.error("Remediation error:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
