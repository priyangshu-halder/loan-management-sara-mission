import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { login } from "@/modules/identity/auth-service";
import {
  createCustomer,
  createGroup,
  updateGroup,
  deleteGroup,
  assignCustomerToGroup,
  getCustomerById,
  updateCustomer,
  getCustomers,
  getBranches,
} from "./customer-service";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { getMasterCatalogItems } from "@/modules/master-data/catalog-service";
import { readStoredFile } from "@/lib/storage/storage-provider";

describe("Customer and group management", () => {
  let adminUser: Awaited<ReturnType<typeof login>>["user"];
  let suffix: string;
  let sharedGroup: { id: string; code: string; name: string };

  const getUniquePhone = () => `+91-9${Math.floor(100000000 + Math.random() * 900000000)}`;

  beforeAll(async () => {
    suffix = Date.now().toString().slice(-6);
    const loginRes = await login({
      organizationCode: "RAYHAN-MFI",
      username: "admin",
      password: "Admin@12345",
    });
    adminUser = loginRes.user;

    sharedGroup = await createGroup(adminUser, {
      organizationId: adminUser.organizationId,
      code: `GRP-SHARED-${suffix}`,
      name: `Shared Test Group ${suffix}`,
      meetingDay: "MONDAY",
      status: "ACTIVE",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a customer and rejects duplicate customer codes in the same organization", async () => {
    const uniqueCustomerCode = `CUST-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: uniqueCustomerCode,
      fullName: "Asha Verma",
      phone: getUniquePhone(),
      email: `asha.${suffix}@example.com`,
      branchId: null,
      status: "ACTIVE",
    });

    expect(customer.customerCode).toBe(uniqueCustomerCode);
    expect(customer.fullName).toBe("Asha Verma");
    expect(customer.groupId).toBe(sharedGroup.id);

    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: sharedGroup.id,
        customerCode: uniqueCustomerCode,
        fullName: "Duplicate Customer",
        phone: getUniquePhone(),
        email: `duplicate.${suffix}@example.com`,
        branchId: null,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("enforces mandatory group selection on customer creation", async () => {
    // 1. Missing groupId entirely
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        customerCode: `CUST-NOGRP-${suffix}`,
        fullName: "Ungrouped Individual",
        phone: getUniquePhone(),
        status: "ACTIVE",
      } as any)
    ).rejects.toThrow(ValidationError);

    // 2. Non-existent groupId UUID
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: "00000000-0000-0000-0000-000000000000",
        customerCode: `CUST-BADGRP-${suffix}`,
        fullName: "Non-existent Group Member",
        phone: getUniquePhone(),
        status: "ACTIVE",
      })
    ).rejects.toThrow(NotFoundError);

    // 3. Group belonging to another organization
    const foreignOrg = await prisma.organization.create({
      data: {
        code: `FOR-ORG-${suffix}`,
        name: "Foreign Organization",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });

    const foreignGroup = await prisma.group.create({
      data: {
        organizationId: foreignOrg.id,
        code: `FOR-GRP-${suffix}`,
        name: "Foreign Group",
        status: "ACTIVE",
      },
    });

    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: foreignGroup.id,
        customerCode: `CUST-OUTGRP-${suffix}`,
        fullName: "Cross Org Group Attempt",
        phone: getUniquePhone(),
        status: "ACTIVE",
      })
    ).rejects.toThrow(NotFoundError);

    await prisma.group.deleteMany({ where: { organizationId: foreignOrg.id } });
    await prisma.organization.delete({ where: { id: foreignOrg.id } });
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

    // Customer created in sharedGroup
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: `CUST-${Number(suffix) + 1}`,
      fullName: "Rahul Mehta",
      phone: getUniquePhone(),
      email: `rahul.${suffix}@example.com`,
      branchId: null,
      status: "ACTIVE",
    });

    // Assign customer as an additional member/lead in the new group
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
        groupId: sharedGroup.id,
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
        code: `TEST-ORG-OUTER-${suffix}`,
        name: "Outer Org",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });

    await expect(
      createCustomer(adminUser, {
        organizationId: otherOrg.id,
        groupId: sharedGroup.id,
        customerCode: `CUST-OUTER-${suffix}`,
        fullName: "Outer Customer",
        phone: getUniquePhone(),
        email: "outer@example.com",
        branchId: null,
        status: "ACTIVE",
      })
    ).rejects.toThrow();

    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });

  it("creates a customer with full KYC, documents, nominee, guarantor, and group affiliation", async () => {
    const group = await createGroup(adminUser, {
      organizationId: adminUser.organizationId,
      code: `GRP-KYC-${suffix}`,
      name: `Kyc Affiliation Group ${suffix}`,
      meetingDay: "WEDNESDAY",
      status: "ACTIVE",
    });

    const aadhaar = `9999${suffix.padStart(8, "0")}`.slice(0, 12);
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      customerCode: `CUST-KYC-${suffix}`,
      fullName: "Pooja Sharma",
      guardianName: "Rajesh Sharma",
      phone: getUniquePhone(),
      email: `pooja.${suffix}@example.com`,
      dateOfBirth: "1992-05-14",
      gender: "FEMALE",
      aadhaarNumber: aadhaar,
      panNumber: "ABCDE1234F",
      groupId: group.id,
      occupation: "Tailoring & Handicrafts",
      residentialAddress: "House No 42, Ward 3, Rampur Village",
      nomineeName: "Sunita Sharma",
      guarantorName: "Vikram Sharma",
      passportPhoto: "data:image/jpeg;base64,mockPassportPhotoData",
      aadhaarFrontDoc: "data:image/jpeg;base64,mockAadhaarFrontData",
      aadhaarBackDoc: "data:image/jpeg;base64,mockAadhaarBackData",
      panPhoto: "data:image/jpeg;base64,mockPanPhotoData",
      status: "ACTIVE",
    });

    expect(customer.guardianName).toBe("Rajesh Sharma");
    expect(customer.aadhaarNumber).toBe(aadhaar);
    expect(customer.panNumber).toBe("ABCDE1234F");
    expect(customer.nomineeName).toBe("Sunita Sharma");
    expect(customer.guarantorName).toBe("Vikram Sharma");
    expect(customer.passportPhoto).toBe("data:image/jpeg;base64,mockPassportPhotoData");
    expect(customer.aadhaarFrontDoc).toBe("data:image/jpeg;base64,mockAadhaarFrontData");
    expect(customer.aadhaarBackDoc).toBe("data:image/jpeg;base64,mockAadhaarBackData");
    expect(customer.panPhoto).toBe("data:image/jpeg;base64,mockPanPhotoData");

    const fetched = await getCustomerById(adminUser, customer.id);
    expect(fetched.customerGroups).toHaveLength(1);
    expect(fetched.customerGroups[0].groupId).toBe(group.id);
    expect(fetched.groupId).toBe(group.id);

    // Rejects duplicate Aadhaar number
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: group.id,
        customerCode: `CUST-DIFF-${suffix}`,
        fullName: "Another Customer",
        phone: getUniquePhone(),
        aadhaarNumber: aadhaar,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("creates a customer with application form document upload and verifies secure storage", async () => {
    const extCode = `CUST-DOC-${suffix}`;
    const fileContent = Buffer.from("%PDF-1.4 Application Form Test Content for Customer Onboarding");

    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: extCode,
      fullName: "Application Document Customer",
      phone: getUniquePhone(),
      email: `appdoc.${suffix}@example.com`,
      applicationFormFile: {
        fileName: "customer_application_signed.pdf",
        buffer: fileContent,
        mimeType: "application/pdf",
      },
      status: "ACTIVE",
    });

    expect(customer.id).toBeDefined();
    expect(customer.groupId).toBe(sharedGroup.id);

    // Verify CustomerDocument metadata in DB
    const docs = await prisma.customerDocument.findMany({
      where: { customerId: customer.id, documentType: "APPLICATION_FORM" },
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].fileName).toBe("customer_application_signed.pdf");
    expect(docs[0].mimeType).toBe("application/pdf");
    expect(docs[0].fileSize).toBe(fileContent.length);

    // Verify file content is stored outside public webroot and can be read
    const storedBytes = await readStoredFile(docs[0].storagePath);
    expect(storedBytes.equals(fileContent)).toBe(true);

    // Verify getCustomerById includes documents
    const fetched = await getCustomerById(adminUser, customer.id);
    expect(fetched.documents).toHaveLength(1);
    expect(fetched.documents[0].documentType).toBe("APPLICATION_FORM");
  });

  it("updates and replaces application form document on customer edit, and handles removal", async () => {
    const custCode = `CUST-UPDOC-${suffix}`;
    const initialContent = Buffer.from("%PDF-1.4 Initial Application Form");

    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: custCode,
      fullName: "Doc Replace Customer",
      phone: getUniquePhone(),
      applicationFormFile: {
        fileName: "initial_form.pdf",
        buffer: initialContent,
        mimeType: "application/pdf",
      },
      status: "ACTIVE",
    });

    const initialDocs = await prisma.customerDocument.findMany({
      where: { customerId: customer.id, documentType: "APPLICATION_FORM" },
    });
    expect(initialDocs).toHaveLength(1);
    const initialStoragePath = initialDocs[0].storagePath;

    // 1. Replace application form with new file
    const newContent = Buffer.from("%PDF-1.4 Replaced Application Form Content");
    await updateCustomer(adminUser, customer.id, {
      applicationFormFile: {
        fileName: "replaced_form.pdf",
        buffer: newContent,
        mimeType: "application/pdf",
      },
    });

    const replacedDocs = await prisma.customerDocument.findMany({
      where: { customerId: customer.id, documentType: "APPLICATION_FORM" },
    });
    expect(replacedDocs).toHaveLength(1);
    expect(replacedDocs[0].fileName).toBe("replaced_form.pdf");

    // Old file should be deleted from storage
    await expect(readStoredFile(initialStoragePath)).rejects.toThrow();

    // New file must be present
    const newStoredBytes = await readStoredFile(replacedDocs[0].storagePath);
    expect(newStoredBytes.equals(newContent)).toBe(true);

    // 2. Remove application form via removeApplicationForm flag
    await updateCustomer(adminUser, customer.id, {
      removeApplicationForm: true,
    });

    const afterRemovalDocs = await prisma.customerDocument.findMany({
      where: { customerId: customer.id, documentType: "APPLICATION_FORM" },
    });
    expect(afterRemovalDocs).toHaveLength(0);

    // Replaced file should now also be cleaned up
    await expect(readStoredFile(replacedDocs[0].storagePath)).rejects.toThrow();
  });

  it("rejects invalid application form file formats and oversized files", async () => {
    // 1. Invalid file format (.zip / application/zip)
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: sharedGroup.id,
        customerCode: `CUST-INV1-${suffix}`,
        fullName: "Bad Format Customer",
        phone: getUniquePhone(),
        applicationFormFile: {
          fileName: "archive.zip",
          buffer: Buffer.from("PK12345"),
          mimeType: "application/zip",
        },
        status: "ACTIVE",
      })
    ).rejects.toThrow(ValidationError);

    // 2. Oversized file (> 10MB)
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024); // 10MB + 1KB
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: sharedGroup.id,
        customerCode: `CUST-INV2-${suffix}`,
        fullName: "Oversized Doc Customer",
        phone: getUniquePhone(),
        applicationFormFile: {
          fileName: "huge_scan.pdf",
          buffer: largeBuffer,
          mimeType: "application/pdf",
        },
        status: "ACTIVE",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("verifies customer bank fields are completely removed and not stored in database", async () => {
    const extCode = `CUST-NOBANK-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: extCode,
      fullName: "No Bank Customer",
      phone: getUniquePhone(),
      status: "ACTIVE",
    });

    // Check customer object returned
    expect((customer as any).bankAccountNumber).toBeUndefined();
    expect((customer as any).bankName).toBeUndefined();
    expect((customer as any).bankIfscCode).toBeUndefined();
    expect((customer as any).bankAccountStatus).toBeUndefined();
    expect((customer as any).bankPassbookDoc).toBeUndefined();

    // Check direct database record
    const dbCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect((dbCustomer as any).bankAccountNumber).toBeUndefined();
    expect((dbCustomer as any).bankName).toBeUndefined();
    expect((dbCustomer as any).bankIfscCode).toBeUndefined();
  });

  it("creates a customer with extended personal, family, occupation, and catalog data", async () => {
    const communities = await getMasterCatalogItems(adminUser, "COMMUNITY_RELIGION");
    const educations = await getMasterCatalogItems(adminUser, "EDUCATION_LITERACY");
    const testCommunity = communities[0];
    const testEducation = educations[0];

    const extCode = `CUST-EXT-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: extCode,
      fullName: "Kavita Sen",
      phone: getUniquePhone(),
      email: `kavita.${suffix}@example.com`,
      maritalStatus: "MARRIED",
      familyMembers: 4,
      primaryOccupation: "Organic Dairy Farming",
      communityId: testCommunity.id,
      educationId: testEducation.id,
      annualIncome: "240000.00",
      status: "ACTIVE",
    });

    expect(customer.maritalStatus).toBe("MARRIED");
    expect(customer.familyMembers).toBe(4);
    expect(customer.primaryOccupation).toBe("Organic Dairy Farming");
    expect(customer.occupation).toBe("Organic Dairy Farming"); // Backward-compatible mirroring
    expect(customer.communityId).toBe(testCommunity.id);
    expect(customer.educationId).toBe(testEducation.id);
    expect(Number(customer.annualIncome)).toBe(240000);

    // Verify relations retrieved through getCustomerById
    const fetched = await getCustomerById(adminUser, customer.id);
    expect(fetched.community?.id).toBe(testCommunity.id);
    expect(fetched.community?.name).toBe(testCommunity.name);
    expect(fetched.education?.id).toBe(testEducation.id);
    expect(fetched.education?.name).toBe(testEducation.name);
  });

  it("enforces strict validations on extended fields: family members, annual income, and catalog relations", async () => {
    // 1. Negative family members
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: sharedGroup.id,
        customerCode: `CUST-V3-${suffix}`,
        fullName: "Test Customer",
        phone: getUniquePhone(),
        familyMembers: -1,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ValidationError);

    // 2. Negative annual income
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: sharedGroup.id,
        customerCode: `CUST-V4-${suffix}`,
        fullName: "Test Customer",
        phone: getUniquePhone(),
        annualIncome: -500,
        status: "ACTIVE",
      })
    ).rejects.toThrow(ValidationError);

    // 3. Non-existent master catalog UUID
    await expect(
      createCustomer(adminUser, {
        organizationId: adminUser.organizationId,
        groupId: sharedGroup.id,
        customerCode: `CUST-V6-${suffix}`,
        fullName: "Test Customer",
        phone: getUniquePhone(),
        communityId: "00000000-0000-0000-0000-000000000000",
        status: "ACTIVE",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("updates extended fields via updateCustomer and preserves audit trail", async () => {
    const custCode = `CUST-UP2-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: custCode,
      fullName: "Pre-Update Customer",
      phone: getUniquePhone(),
      status: "ACTIVE",
    });

    const updated = await updateCustomer(adminUser, customer.id, {
      maritalStatus: "DIVORCED",
      familyMembers: 2,
      primaryOccupation: "Retail Store Owner",
      annualIncome: "480000.00",
    });

    expect(updated.maritalStatus).toBe("DIVORCED");
    expect(updated.familyMembers).toBe(2);
    expect(updated.primaryOccupation).toBe("Retail Store Owner");
    expect(Number(updated.annualIncome)).toBe(480000);

    // Check audit event log
    const auditLogs = await prisma.auditEvent.findMany({
      where: {
        entityId: customer.id,
        action: "CUSTOMER_UPDATED",
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    const metadata = auditLogs[0].metadata ? JSON.parse(auditLogs[0].metadata) : {};
    expect(metadata.updatedFields).toContain("primaryOccupation");
    expect(metadata.updatedFields).toContain("annualIncome");
  });

  it("filters and searches customers by primaryOccupation and profile fields", async () => {
    const searchCode = `CUST-SCH-${suffix}`;
    const uniqueOcc = `FishSpecialist-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: searchCode,
      fullName: "Search Test Member",
      phone: getUniquePhone(),
      primaryOccupation: uniqueOcc,
      status: "ACTIVE",
    });

    // Search by primaryOccupation
    const resByOcc = await getCustomers(adminUser, { search: uniqueOcc });
    expect(resByOcc.items.some((c) => c.id === customer.id)).toBe(true);

    // Search by customerCode
    const resByCode = await getCustomers(adminUser, { search: searchCode });
    expect(resByCode.items.some((c) => c.id === customer.id)).toBe(true);
  });

  it("updates customer profile and documents via updateCustomer and enforces constraints", async () => {
    const custCode = `CUST-UPD-${suffix}`;
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: sharedGroup.id,
      customerCode: custCode,
      fullName: "Initial Name",
      phone: getUniquePhone(),
      status: "ACTIVE",
    });

    // Update customer info and KYC
    const updated = await updateCustomer(adminUser, customer.id, {
      fullName: "Updated Full Name",
      guardianName: "Updated Guardian",
      occupation: "TEXTILE BUSINESS",
      aadhaarNumber: `8888${suffix.padStart(8, "0")}`.slice(0, 12),
      passportPhoto: "data:image/jpeg;base64,newPassportPhoto",
    });

    expect(updated.fullName).toBe("Updated Full Name");
    expect(updated.guardianName).toBe("Updated Guardian");
    expect(updated.occupation).toBe("TEXTILE BUSINESS");
    expect(updated.passportPhoto).toBe("data:image/jpeg;base64,newPassportPhoto");

    // Test search filter by occupation and kycStatus
    const resVerified = await getCustomers(adminUser, {
      search: "TEXTILE BUSINESS",
      kycStatus: "VERIFIED",
    });
    expect(resVerified.items.some((c) => c.id === customer.id)).toBe(true);

    const resPending = await getCustomers(adminUser, {
      kycStatus: "PENDING",
    });
    // customer has aadhaarNumber, so should not be in pending
    expect(resPending.items.some((c) => c.id === customer.id)).toBe(false);

    // Test getBranches
    const branches = await getBranches(adminUser);
    expect(Array.isArray(branches)).toBe(true);
    expect(branches.length).toBeGreaterThan(0);
  });

  it("updates and deletes a group, preventing deletion when members are assigned", async () => {
    const groupCode = `GRP-UD-${suffix}`;
    const group = await createGroup(adminUser, {
      organizationId: adminUser.organizationId,
      code: groupCode,
      name: `Original Name ${suffix}`,
      meetingDay: "WEDNESDAY",
      status: "ACTIVE",
    });

    // Update group name and meeting day
    const updated = await updateGroup(adminUser, group.id, {
      name: `Updated Name ${suffix}`,
      meetingDay: "FRIDAY",
      status: "ACTIVE",
    });
    expect(updated.name).toBe(`Updated Name ${suffix}`);
    expect(updated.meetingDay).toBe("FRIDAY");

    // Create customer directly belonging to group
    const customer = await createCustomer(adminUser, {
      organizationId: adminUser.organizationId,
      groupId: group.id,
      customerCode: `CUST-G-${suffix}`,
      fullName: "Group Assigned Member",
      phone: getUniquePhone(),
      status: "ACTIVE",
    });

    // Delete should fail because of assigned member
    await expect(deleteGroup(adminUser, group.id)).rejects.toThrow(ValidationError);

    // Reassign customer to sharedGroup
    await updateCustomer(adminUser, customer.id, {
      groupId: sharedGroup.id,
    });

    // Remove the secondary customerGroup assignment
    await prisma.customerGroup.deleteMany({
      where: { groupId: group.id },
    });

    // Delete should succeed now
    const deleted = await deleteGroup(adminUser, group.id);
    expect(deleted.id).toBe(group.id);

    const lookup = await prisma.group.findUnique({ where: { id: group.id } });
    expect(lookup).toBeNull();
  });
});
