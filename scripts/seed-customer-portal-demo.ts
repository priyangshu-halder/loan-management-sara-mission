import { prisma } from "../src/lib/db/prisma";

// Clean SVG base64 representations for realistic document preview
function createDocSvg(title: string, sub: string, bgColor: string, accentColor: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <rect width="600" height="380" rx="16" fill="${bgColor}" stroke="${accentColor}" stroke-width="3"/>
    <rect x="0" y="0" width="600" height="60" rx="16" fill="${accentColor}"/>
    <text x="30" y="38" font-family="sans-serif" font-size="20" font-weight="bold" fill="#ffffff">${title}</text>
    <rect x="30" y="90" width="120" height="150" rx="8" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
    <circle cx="90" cy="140" r="35" fill="#94a3b8"/>
    <path d="M 50 220 Q 90 180 130 220 Z" fill="#94a3b8"/>
    <text x="175" y="120" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1e293b">${sub}</text>
    <text x="175" y="150" font-family="monospace" font-size="14" fill="#475569">Document No: DOC-${Date.now().toString().slice(-6)}</text>
    <text x="175" y="180" font-family="sans-serif" font-size="13" fill="#64748b">Government of India / National KYC Registry</text>
    <rect x="175" y="200" width="380" height="40" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="190" y="225" font-family="monospace" font-size="13" font-weight="bold" fill="#0f172a">Verified UIDAI / NSDL Standard Record</text>
    <line x1="30" y1="270" x2="570" y2="270" stroke="#e2e8f0" stroke-width="2"/>
    <text x="30" y="310" font-family="sans-serif" font-size="12" fill="#64748b">Address: West Bengal, India</text>
    <text x="30" y="335" font-family="sans-serif" font-size="11" fill="#94a3b8">This electronic document has been cryptographically verified for underwritten microfinance operations.</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function createAvatarSvg(initial: string, bgColor: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" rx="100" fill="${bgColor}"/>
    <text x="100" y="125" font-family="sans-serif" font-size="80" font-weight="bold" fill="#ffffff" text-anchor="middle">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function seedCustomerDemo() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error("No organization found. Run db:seed first.");
    return;
  }

  // 1. Ensure Branches
  const kolkataBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "HO-001",
      },
    },
    update: { name: "Kolkata Head Office" },
    create: {
      organizationId: org.id,
      code: "HO-001",
      name: "Kolkata Head Office",
      status: "ACTIVE",
    },
  });

  const barasatBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "BR-002",
      },
    },
    update: { name: "Barasat Branch" },
    create: {
      organizationId: org.id,
      code: "BR-002",
      name: "Barasat Branch",
      status: "ACTIVE",
    },
  });

  // 2. Ensure Groups & Centers
  const bidhannagarCenter = await prisma.group.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "GRP-BIDHANNAGAR",
      },
    },
    update: { name: "Bidhannagar Mahila Center", branchId: kolkataBranch.id },
    create: {
      organizationId: org.id,
      code: "GRP-BIDHANNAGAR",
      name: "Bidhannagar Mahila Center",
      meetingDay: "WEDNESDAY",
      branchId: kolkataBranch.id,
      status: "ACTIVE",
    },
  });

  const maaTaraGroup = await prisma.group.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "GRP-MAATARA",
      },
    },
    update: { name: "Maa Tara JLG Group", branchId: kolkataBranch.id },
    create: {
      organizationId: org.id,
      code: "GRP-MAATARA",
      name: "Maa Tara JLG Group",
      meetingDay: "TUESDAY",
      branchId: kolkataBranch.id,
      status: "ACTIVE",
    },
  });

  const barasatNabapally = await prisma.group.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: "GRP-BARASAT-01",
      },
    },
    update: { name: "Barasat Nabapally Center", branchId: barasatBranch.id },
    create: {
      organizationId: org.id,
      code: "GRP-BARASAT-01",
      name: "Barasat Nabapally Center",
      meetingDay: "THURSDAY",
      branchId: barasatBranch.id,
      status: "ACTIVE",
    },
  });

  // 3. Customers matching reference screenshot
  const customersData = [
    {
      customerCode: "CUST-HO-001-260004",
      fullName: "MITHU MONDAL",
      guardianName: "MITHU",
      phone: "1234567890",
      email: "mithu.mondal@example.com",
      branchId: kolkataBranch.id,
      groupId: bidhannagarCenter.id,
      aadhaarNumber: "123456789012",
      panNumber: "ABCDE1234F",
      occupation: "TEXTILE SHOP",
      residentialAddress: "Bidhannagar Ward 12, Salt Lake, Kolkata 700091",
      nomineeName: "Subhas Mondal",
      guarantorName: "Tapan Roy",
      isKycVerified: true,
      initial: "M",
      color: "#2563eb",
    },
    {
      customerCode: "CUST-HO-001-260003",
      fullName: "DEMO DEMO",
      guardianName: "DEMO",
      phone: "1234567891",
      email: "demo.demo@example.com",
      branchId: kolkataBranch.id,
      groupId: bidhannagarCenter.id,
      aadhaarNumber: "123456789012",
      panNumber: "DEMOP1234K",
      occupation: "DAIRY & SMALL BUSINESS",
      residentialAddress: "Sector 5, Salt Lake, Kolkata 700091",
      nomineeName: "Rina Demo",
      guarantorName: "Mantu Ghosh",
      isKycVerified: true,
      initial: "D",
      color: "#059669",
    },
    {
      customerCode: "CUST-BR-260001",
      fullName: "ANJALI MONDAL",
      guardianName: "TAPAS MONDAL",
      phone: "9831122338",
      email: "anjali.mondal@example.com",
      branchId: barasatBranch.id,
      groupId: barasatNabapally.id,
      aadhaarNumber: "998877665544",
      panNumber: "ANJPM8877K",
      occupation: "HANDICRAFTS & JUTE BAGS",
      residentialAddress: "Nabapally Colony, Barasat, North 24 Parganas 700126",
      nomineeName: "Tapas Mondal",
      guarantorName: "Alok Sarkar",
      isKycVerified: true,
      initial: "A",
      color: "#7c3aed",
    },
    {
      customerCode: "CUST-HO-260002",
      fullName: "FATEMA BIBI",
      guardianName: "MUSTAFA MONDAL",
      phone: "9831122336",
      email: "fatema.bibi@example.com",
      branchId: kolkataBranch.id,
      groupId: maaTaraGroup.id,
      aadhaarNumber: "782344559012",
      panNumber: "FATPM7823P",
      occupation: "TAILORING & GARMENTS",
      residentialAddress: "Kaikhali Main Road, Kolkata 700052",
      nomineeName: "Mustafa Mondal",
      guarantorName: "Nazrul Islam",
      isKycVerified: false, // Pending KYC row in screenshot!
      initial: "F",
      color: "#d97706",
    },
    {
      customerCode: "CUST-HO-260001",
      fullName: "ANANYA KHATUN",
      guardianName: "RAHIM ALI",
      phone: "9831122334",
      email: "ananya.khatun@example.com",
      branchId: kolkataBranch.id,
      groupId: maaTaraGroup.id,
      aadhaarNumber: "451288901234",
      panNumber: "ANAKP4512L",
      occupation: "DAIRY & POULTRY FARMING",
      residentialAddress: "Rajarhat Action Area 2, Kolkata 700135",
      nomineeName: "Rahim Ali",
      guarantorName: "Jamal Mondal",
      isKycVerified: true,
      initial: "A",
      color: "#e11d48",
    },
  ];

  for (const c of customersData) {
    const passportPhoto = createAvatarSvg(c.initial, c.color);
    const aadhaarFrontDoc = createDocSvg("AADHAAR CARD - FRONT", `${c.fullName} - UIDAI`, "#f8fafc", "#0284c7");
    const aadhaarBackDoc = createDocSvg("AADHAAR CARD - BACK", `Address & QR Code - ${c.customerCode}`, "#f8fafc", "#0284c7");
    const panPhoto = createDocSvg("PERMANENT ACCOUNT NUMBER", `PAN: ${c.panNumber} - Income Tax Dept`, "#f8fafc", "#4f46e5");

    const cust = await prisma.customer.upsert({
      where: {
        organizationId_customerCode: {
          organizationId: org.id,
          customerCode: c.customerCode,
        },
      },
      update: {
        fullName: c.fullName,
        guardianName: c.guardianName,
        phone: c.phone,
        email: c.email,
        branchId: c.branchId,
        groupId: c.groupId,
        aadhaarNumber: c.isKycVerified ? c.aadhaarNumber : null,
        panNumber: c.panNumber,
        occupation: c.occupation,
        residentialAddress: c.residentialAddress,
        nomineeName: c.nomineeName,
        guarantorName: c.guarantorName,
        passportPhoto,
        aadhaarFrontDoc,
        aadhaarBackDoc,
        panPhoto,
        status: "ACTIVE",
      },
      create: {
        organizationId: org.id,
        groupId: c.groupId,
        customerCode: c.customerCode,
        fullName: c.fullName,
        guardianName: c.guardianName,
        phone: c.phone,
        email: c.email,
        branchId: c.branchId,
        aadhaarNumber: c.isKycVerified ? c.aadhaarNumber : null,
        panNumber: c.panNumber,
        occupation: c.occupation,
        residentialAddress: c.residentialAddress,
        nomineeName: c.nomineeName,
        guarantorName: c.guarantorName,
        passportPhoto,
        aadhaarFrontDoc,
        aadhaarBackDoc,
        panPhoto,
        status: "ACTIVE",
      },
    });

    // Link customer to group
    await prisma.customerGroup.upsert({
      where: {
        organizationId_customerId_groupId: {
          organizationId: org.id,
          customerId: cust.id,
          groupId: c.groupId,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        customerId: cust.id,
        groupId: c.groupId,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
  }

  console.log("Customer demo records successfully populated!");
}

seedCustomerDemo()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
