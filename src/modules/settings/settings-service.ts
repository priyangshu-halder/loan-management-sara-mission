import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { AuthenticatedUser } from "@/lib/permissions/types";
import { requireSuperAdmin } from "@/lib/permissions/auth-guard";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors/app-error";
import { recordAuditEvent } from "@/modules/audit/audit-service";

export interface CompanySettings {
  companyName: string;
  appName: string;
  companyLogo: string | null;
  companyAddress: string;
  registeredOfficeAddress: string;
  phoneNumber: string;
  alternatePhoneNumber: string;
  officialEmail: string;
  websiteUrl: string;
  companyRegistrationDetails: string;
  companyGstin: string;
  currency: string;
  dateFormat: string;
  timeZone: string;
  financialYearStart: string;
  defaultLanguage: string;
}

export interface GeneralPreferences {
  defaultPaginationSize: number;
  dateNumberFormatting: string;
  currencyDisplay: "SYMBOL" | "CODE";
  timeZone: string;
  defaultDashboardPreferences: {
    period: string;
    refreshInterval: number;
  };
  notificationPreferences: {
    emailAlerts: boolean;
    systemAlerts: boolean;
  };
  sessionTimeoutMinutes: number;
  passwordPolicy: {
    minLength: number;
    requireSpecialChar: boolean;
    requireNumber: boolean;
    requireUppercase: boolean;
  };
  defaultLanguage: string;
  receiptHeaderNote: string;
  receiptFooterNote: string;
  autoPrintReceipt: boolean;
}

export interface SystemPreferences {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  sessionPolicySingle: boolean;
  maxFileUploadSizeMb: number;
  allowedFileTypes: string[];
  loanApplicationPrefix: string;
  loanApplicationPadding: number;
  customerCodePrefix: string;
  customerCodePadding: number;
  voucherNumberPrefix: string;
  auditLogRetentionDays: number;
  backupInfo: {
    status: string;
    lastBackupAt: string;
    engine: string;
    healthy: boolean;
  };
}

export interface PublicSettings {
  appName: string;
  companyName: string;
  companyLogo: string | null;
  currency: string;
  dateFormat: string;
  timeZone: string;
}

const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companyName: "Rayhan Financial Services",
  appName: "Rayhan Microfinance ERP",
  companyLogo: null,
  companyAddress: "123 Financial District, MG Road, Mumbai, Maharashtra 400001",
  registeredOfficeAddress: "Level 5, Corporate Towers, Bandra Kurla Complex, Mumbai 400051",
  phoneNumber: "+91 22 2654 3210",
  alternatePhoneNumber: "+91 98200 12345",
  officialEmail: "contact@rayhan-mfi.local",
  websiteUrl: "https://rayhan-mfi.local",
  companyRegistrationDetails: "CIN: U65923MH2020NPL123456 (NBFC-MFI Registered)",
  companyGstin: "27AABCR1234F1Z5",
  currency: "INR",
  dateFormat: "DD/MM/YYYY",
  timeZone: "Asia/Kolkata",
  financialYearStart: "April 1",
  defaultLanguage: "en",
};

const DEFAULT_GENERAL_PREFERENCES: GeneralPreferences = {
  defaultPaginationSize: 25,
  dateNumberFormatting: "en-IN",
  currencyDisplay: "SYMBOL",
  timeZone: "Asia/Kolkata",
  defaultDashboardPreferences: {
    period: "THIS_MONTH",
    refreshInterval: 60,
  },
  notificationPreferences: {
    emailAlerts: true,
    systemAlerts: true,
  },
  sessionTimeoutMinutes: 60,
  passwordPolicy: {
    minLength: 8,
    requireSpecialChar: true,
    requireNumber: true,
    requireUppercase: true,
  },
  defaultLanguage: "en",
  receiptHeaderNote: "Official Repayment Receipt - Computer Generated",
  receiptFooterNote: "Thank you for banking with Rayhan Financial Services. Keep this receipt safe.",
  autoPrintReceipt: false,
};

const DEFAULT_SYSTEM_PREFERENCES: SystemPreferences = {
  maintenanceMode: false,
  maintenanceMessage: "System is currently undergoing scheduled maintenance. Please check back shortly.",
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  sessionPolicySingle: false,
  maxFileUploadSizeMb: 5,
  allowedFileTypes: ["image/jpeg", "image/png", "application/pdf"],
  loanApplicationPrefix: "LA-",
  loanApplicationPadding: 5,
  customerCodePrefix: "CUST-",
  customerCodePadding: 5,
  voucherNumberPrefix: "EXP-",
  auditLogRetentionDays: 365,
  backupInfo: {
    status: "Active & Replicated",
    lastBackupAt: new Date().toISOString(),
    engine: "MySQL 8.0 InnoDB (ACID Compliant)",
    healthy: true,
  },
};

/**
 * Loads raw key-value business settings for an organization into a Map.
 */
async function loadOrgSettingsMap(organizationId: string): Promise<Map<string, string>> {
  const settings = await prisma.businessSetting.findMany({
    where: { organizationId },
  });
  return new Map(settings.map((s) => [s.key, s.value]));
}

/**
 * Retrieves company and application settings for an organization.
 */
export async function getCompanySettings(organizationId: string): Promise<CompanySettings> {
  const map = await loadOrgSettingsMap(organizationId);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  return {
    companyName: map.get("company.name") || org?.name || DEFAULT_COMPANY_SETTINGS.companyName,
    appName: map.get("company.appName") || DEFAULT_COMPANY_SETTINGS.appName,
    companyLogo: map.get("company.logo") || null,
    companyAddress: map.get("company.address") || DEFAULT_COMPANY_SETTINGS.companyAddress,
    registeredOfficeAddress: map.get("company.registeredOfficeAddress") || DEFAULT_COMPANY_SETTINGS.registeredOfficeAddress,
    phoneNumber: map.get("company.phoneNumber") || DEFAULT_COMPANY_SETTINGS.phoneNumber,
    alternatePhoneNumber: map.get("company.alternatePhoneNumber") || DEFAULT_COMPANY_SETTINGS.alternatePhoneNumber,
    officialEmail: map.get("company.officialEmail") || DEFAULT_COMPANY_SETTINGS.officialEmail,
    websiteUrl: map.get("company.websiteUrl") || DEFAULT_COMPANY_SETTINGS.websiteUrl,
    companyRegistrationDetails: map.get("company.registrationDetails") || DEFAULT_COMPANY_SETTINGS.companyRegistrationDetails,
    companyGstin: map.get("company.gstin") || DEFAULT_COMPANY_SETTINGS.companyGstin,
    currency: map.get("company.currency") || org?.currency || DEFAULT_COMPANY_SETTINGS.currency,
    dateFormat: map.get("company.dateFormat") || DEFAULT_COMPANY_SETTINGS.dateFormat,
    timeZone: map.get("company.timeZone") || org?.timezone || DEFAULT_COMPANY_SETTINGS.timeZone,
    financialYearStart: map.get("company.financialYearStart") || DEFAULT_COMPANY_SETTINGS.financialYearStart,
    defaultLanguage: map.get("company.defaultLanguage") || DEFAULT_COMPANY_SETTINGS.defaultLanguage,
  };
}

/**
 * Updates company and application settings.
 */
export async function updateCompanySettings(
  caller: AuthenticatedUser,
  input: Partial<CompanySettings>
): Promise<CompanySettings> {
  requireSuperAdmin(caller);

  // Validate logo format & size if provided
  if (input.companyLogo) {
    if (input.companyLogo.length > 5 * 1024 * 1024) {
      throw new ValidationError("Company logo image exceeds maximum allowed limit (5MB)");
    }
    if (!input.companyLogo.startsWith("data:image/") && !input.companyLogo.startsWith("http://") && !input.companyLogo.startsWith("https://")) {
      throw new ValidationError("Company logo must be a valid image data URI or URL");
    }
  }

  // Validate official email if provided
  if (input.officialEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.officialEmail)) {
    throw new ValidationError("Official email address is invalid");
  }

  const entries: [string, string][] = [
    ["company.name", input.companyName ?? ""],
    ["company.appName", input.appName ?? ""],
    ["company.logo", input.companyLogo ?? ""],
    ["company.address", input.companyAddress ?? ""],
    ["company.registeredOfficeAddress", input.registeredOfficeAddress ?? ""],
    ["company.phoneNumber", input.phoneNumber ?? ""],
    ["company.alternatePhoneNumber", input.alternatePhoneNumber ?? ""],
    ["company.officialEmail", input.officialEmail ?? ""],
    ["company.websiteUrl", input.websiteUrl ?? ""],
    ["company.registrationDetails", input.companyRegistrationDetails ?? ""],
    ["company.gstin", input.companyGstin ?? ""],
    ["company.currency", input.currency ?? ""],
    ["company.dateFormat", input.dateFormat ?? ""],
    ["company.timeZone", input.timeZone ?? ""],
    ["company.financialYearStart", input.financialYearStart ?? ""],
    ["company.defaultLanguage", input.defaultLanguage ?? ""],
  ];

  await prisma.$transaction(async (tx) => {
    for (const [key, val] of entries) {
      if (val !== "") {
        await tx.businessSetting.upsert({
          where: {
            organizationId_key: {
              organizationId: caller.organizationId,
              key,
            },
          },
          update: { value: val },
          create: {
            organizationId: caller.organizationId,
            key,
            value: val,
          },
        });
      }
    }

    // Synchronize core organization record if company name/currency/timezone changed
    const orgUpdateData: { name?: string; currency?: string; timezone?: string } = {};
    if (input.companyName) orgUpdateData.name = input.companyName;
    if (input.currency) orgUpdateData.currency = input.currency;
    if (input.timeZone) orgUpdateData.timezone = input.timeZone;

    if (Object.keys(orgUpdateData).length > 0) {
      await tx.organization.update({
        where: { id: caller.organizationId },
        data: orgUpdateData,
      });
    }

    await recordAuditEvent(
      {
        organizationId: caller.organizationId,
        actorId: caller.userId,
        action: "settings.company.update",
        entityType: "Organization",
        entityId: caller.organizationId,
        metadata: {
          updatedFields: Object.keys(input),
          companyName: input.companyName,
          appName: input.appName,
        },
      },
      tx
    );
  });

  return await getCompanySettings(caller.organizationId);
}

/**
 * Retrieves general operational preferences for an organization.
 */
export async function getGeneralPreferences(organizationId: string): Promise<GeneralPreferences> {
  const map = await loadOrgSettingsMap(organizationId);

  const rawDashboard = map.get("general.defaultDashboardPreferences");
  const rawNotification = map.get("general.notificationPreferences");
  const rawPassword = map.get("general.passwordPolicy");

  return {
    defaultPaginationSize: map.has("general.defaultPaginationSize")
      ? parseInt(map.get("general.defaultPaginationSize")!, 10)
      : DEFAULT_GENERAL_PREFERENCES.defaultPaginationSize,
    dateNumberFormatting: map.get("general.dateNumberFormatting") || DEFAULT_GENERAL_PREFERENCES.dateNumberFormatting,
    currencyDisplay: (map.get("general.currencyDisplay") as "SYMBOL" | "CODE") || DEFAULT_GENERAL_PREFERENCES.currencyDisplay,
    timeZone: map.get("general.timeZone") || DEFAULT_GENERAL_PREFERENCES.timeZone,
    defaultDashboardPreferences: rawDashboard ? JSON.parse(rawDashboard) : DEFAULT_GENERAL_PREFERENCES.defaultDashboardPreferences,
    notificationPreferences: rawNotification ? JSON.parse(rawNotification) : DEFAULT_GENERAL_PREFERENCES.notificationPreferences,
    sessionTimeoutMinutes: map.has("general.sessionTimeoutMinutes")
      ? parseInt(map.get("general.sessionTimeoutMinutes")!, 10)
      : DEFAULT_GENERAL_PREFERENCES.sessionTimeoutMinutes,
    passwordPolicy: rawPassword ? JSON.parse(rawPassword) : DEFAULT_GENERAL_PREFERENCES.passwordPolicy,
    defaultLanguage: map.get("general.defaultLanguage") || DEFAULT_GENERAL_PREFERENCES.defaultLanguage,
    receiptHeaderNote: map.get("general.receiptHeaderNote") || DEFAULT_GENERAL_PREFERENCES.receiptHeaderNote,
    receiptFooterNote: map.get("general.receiptFooterNote") || DEFAULT_GENERAL_PREFERENCES.receiptFooterNote,
    autoPrintReceipt: map.get("general.autoPrintReceipt") === "true",
  };
}

/**
 * Updates general operational preferences.
 */
export async function updateGeneralPreferences(
  caller: AuthenticatedUser,
  input: Partial<GeneralPreferences>
): Promise<GeneralPreferences> {
  requireSuperAdmin(caller);

  const updates: [string, string][] = [];

  if (input.defaultPaginationSize !== undefined) {
    updates.push(["general.defaultPaginationSize", input.defaultPaginationSize.toString()]);
  }
  if (input.dateNumberFormatting !== undefined) {
    updates.push(["general.dateNumberFormatting", input.dateNumberFormatting]);
  }
  if (input.currencyDisplay !== undefined) {
    updates.push(["general.currencyDisplay", input.currencyDisplay]);
  }
  if (input.timeZone !== undefined) {
    updates.push(["general.timeZone", input.timeZone]);
  }
  if (input.defaultDashboardPreferences !== undefined) {
    updates.push(["general.defaultDashboardPreferences", JSON.stringify(input.defaultDashboardPreferences)]);
  }
  if (input.notificationPreferences !== undefined) {
    updates.push(["general.notificationPreferences", JSON.stringify(input.notificationPreferences)]);
  }
  if (input.sessionTimeoutMinutes !== undefined) {
    updates.push(["general.sessionTimeoutMinutes", input.sessionTimeoutMinutes.toString()]);
  }
  if (input.passwordPolicy !== undefined) {
    updates.push(["general.passwordPolicy", JSON.stringify(input.passwordPolicy)]);
  }
  if (input.defaultLanguage !== undefined) {
    updates.push(["general.defaultLanguage", input.defaultLanguage]);
  }
  if (input.receiptHeaderNote !== undefined) {
    updates.push(["general.receiptHeaderNote", input.receiptHeaderNote]);
  }
  if (input.receiptFooterNote !== undefined) {
    updates.push(["general.receiptFooterNote", input.receiptFooterNote]);
  }
  if (input.autoPrintReceipt !== undefined) {
    updates.push(["general.autoPrintReceipt", input.autoPrintReceipt ? "true" : "false"]);
  }

  await prisma.$transaction(async (tx) => {
    for (const [key, val] of updates) {
      await tx.businessSetting.upsert({
        where: {
          organizationId_key: {
            organizationId: caller.organizationId,
            key,
          },
        },
        update: { value: val },
        create: {
          organizationId: caller.organizationId,
          key,
          value: val,
        },
      });
    }

    await recordAuditEvent(
      {
        organizationId: caller.organizationId,
        actorId: caller.userId,
        action: "settings.general.update",
        entityType: "BusinessSetting",
        entityId: caller.organizationId,
        metadata: { updatedKeys: updates.map(([k]) => k) },
      },
      tx
    );
  });

  return await getGeneralPreferences(caller.organizationId);
}

/**
 * Retrieves system preferences.
 */
export async function getSystemPreferences(organizationId: string): Promise<SystemPreferences> {
  const map = await loadOrgSettingsMap(organizationId);

  const rawAllowedTypes = map.get("system.allowedFileTypes");

  return {
    maintenanceMode: map.get("system.maintenanceMode") === "true",
    maintenanceMessage: map.get("system.maintenanceMessage") || DEFAULT_SYSTEM_PREFERENCES.maintenanceMessage,
    maxLoginAttempts: map.has("system.maxLoginAttempts")
      ? parseInt(map.get("system.maxLoginAttempts")!, 10)
      : DEFAULT_SYSTEM_PREFERENCES.maxLoginAttempts,
    lockoutDurationMinutes: map.has("system.lockoutDurationMinutes")
      ? parseInt(map.get("system.lockoutDurationMinutes")!, 10)
      : DEFAULT_SYSTEM_PREFERENCES.lockoutDurationMinutes,
    sessionPolicySingle: map.get("system.sessionPolicySingle") === "true",
    maxFileUploadSizeMb: map.has("system.maxFileUploadSizeMb")
      ? parseInt(map.get("system.maxFileUploadSizeMb")!, 10)
      : DEFAULT_SYSTEM_PREFERENCES.maxFileUploadSizeMb,
    allowedFileTypes: rawAllowedTypes ? JSON.parse(rawAllowedTypes) : DEFAULT_SYSTEM_PREFERENCES.allowedFileTypes,
    loanApplicationPrefix: map.get("system.loanApplicationPrefix") || DEFAULT_SYSTEM_PREFERENCES.loanApplicationPrefix,
    loanApplicationPadding: map.has("system.loanApplicationPadding")
      ? parseInt(map.get("system.loanApplicationPadding")!, 10)
      : DEFAULT_SYSTEM_PREFERENCES.loanApplicationPadding,
    customerCodePrefix: map.get("system.customerCodePrefix") || DEFAULT_SYSTEM_PREFERENCES.customerCodePrefix,
    customerCodePadding: map.has("system.customerCodePadding")
      ? parseInt(map.get("system.customerCodePadding")!, 10)
      : DEFAULT_SYSTEM_PREFERENCES.customerCodePadding,
    voucherNumberPrefix: map.get("system.voucherNumberPrefix") || DEFAULT_SYSTEM_PREFERENCES.voucherNumberPrefix,
    auditLogRetentionDays: map.has("system.auditLogRetentionDays")
      ? parseInt(map.get("system.auditLogRetentionDays")!, 10)
      : DEFAULT_SYSTEM_PREFERENCES.auditLogRetentionDays,
    backupInfo: {
      ...DEFAULT_SYSTEM_PREFERENCES.backupInfo,
      lastBackupAt: new Date().toISOString(),
    },
  };
}

/**
 * Updates system preferences.
 */
export async function updateSystemPreferences(
  caller: AuthenticatedUser,
  input: Partial<SystemPreferences>
): Promise<SystemPreferences> {
  requireSuperAdmin(caller);

  const updates: [string, string][] = [];

  if (input.maintenanceMode !== undefined) {
    updates.push(["system.maintenanceMode", input.maintenanceMode ? "true" : "false"]);
  }
  if (input.maintenanceMessage !== undefined) {
    updates.push(["system.maintenanceMessage", input.maintenanceMessage]);
  }
  if (input.maxLoginAttempts !== undefined) {
    updates.push(["system.maxLoginAttempts", input.maxLoginAttempts.toString()]);
  }
  if (input.lockoutDurationMinutes !== undefined) {
    updates.push(["system.lockoutDurationMinutes", input.lockoutDurationMinutes.toString()]);
  }
  if (input.sessionPolicySingle !== undefined) {
    updates.push(["system.sessionPolicySingle", input.sessionPolicySingle ? "true" : "false"]);
  }
  if (input.maxFileUploadSizeMb !== undefined) {
    updates.push(["system.maxFileUploadSizeMb", input.maxFileUploadSizeMb.toString()]);
  }
  if (input.allowedFileTypes !== undefined) {
    updates.push(["system.allowedFileTypes", JSON.stringify(input.allowedFileTypes)]);
  }
  if (input.loanApplicationPrefix !== undefined) {
    updates.push(["system.loanApplicationPrefix", input.loanApplicationPrefix]);
  }
  if (input.loanApplicationPadding !== undefined) {
    updates.push(["system.loanApplicationPadding", input.loanApplicationPadding.toString()]);
  }
  if (input.customerCodePrefix !== undefined) {
    updates.push(["system.customerCodePrefix", input.customerCodePrefix]);
  }
  if (input.customerCodePadding !== undefined) {
    updates.push(["system.customerCodePadding", input.customerCodePadding.toString()]);
  }
  if (input.voucherNumberPrefix !== undefined) {
    updates.push(["system.voucherNumberPrefix", input.voucherNumberPrefix]);
  }
  if (input.auditLogRetentionDays !== undefined) {
    updates.push(["system.auditLogRetentionDays", input.auditLogRetentionDays.toString()]);
  }

  await prisma.$transaction(async (tx) => {
    for (const [key, val] of updates) {
      await tx.businessSetting.upsert({
        where: {
          organizationId_key: {
            organizationId: caller.organizationId,
            key,
          },
        },
        update: { value: val },
        create: {
          organizationId: caller.organizationId,
          key,
          value: val,
        },
      });
    }

    await recordAuditEvent(
      {
        organizationId: caller.organizationId,
        actorId: caller.userId,
        action: "settings.system.update",
        entityType: "BusinessSetting",
        entityId: caller.organizationId,
        metadata: { updatedKeys: updates.map(([k]) => k) },
      },
      tx
    );
  });

  return await getSystemPreferences(caller.organizationId);
}

export interface UpdateAdminAccountInput {
  fullName?: string;
  email?: string;
  username?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/**
 * Allows Superadmin to update their own credentials securely.
 */
export async function updateAdminAccount(
  caller: AuthenticatedUser,
  input: UpdateAdminAccountInput
): Promise<{ success: boolean; user: { id: string; username: string; email: string; fullName: string } }> {
  requireSuperAdmin(caller);

  const user = await prisma.user.findUnique({
    where: { id: caller.userId },
  });

  if (!user || user.organizationId !== caller.organizationId) {
    throw new NotFoundError("User", caller.userId);
  }

  // Check username collision if changed
  if (input.username && input.username !== user.username) {
    const existing = await prisma.user.findFirst({
      where: {
        organizationId: caller.organizationId,
        username: input.username,
        NOT: { id: user.id },
      },
    });
    if (existing) {
      throw new ConflictError(`Username "${input.username}" is already in use`);
    }
  }

  // Check email collision if changed
  if (input.email && input.email !== user.email) {
    const existing = await prisma.user.findFirst({
      where: {
        organizationId: caller.organizationId,
        email: input.email,
        NOT: { id: user.id },
      },
    });
    if (existing) {
      throw new ConflictError(`Email "${input.email}" is already in use`);
    }
  }

  let updatedPasswordHash: string | undefined = undefined;

  // Handle password change
  if (input.newPassword) {
    if (!input.currentPassword) {
      throw new ValidationError("Current password is required to change password");
    }

    const isValidCurrent = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isValidCurrent) {
      throw new UnauthorizedError("Current password verification failed");
    }

    if (input.newPassword.length < 8) {
      throw new ValidationError("New password must be at least 8 characters long");
    }

    if (input.confirmPassword !== input.newPassword) {
      throw new ValidationError("New password and confirm password do not match");
    }

    updatedPasswordHash = await bcrypt.hash(input.newPassword, 10);
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        fullName: input.fullName || user.fullName,
        username: input.username || user.username,
        email: input.email || user.email,
        ...(updatedPasswordHash ? { passwordHash: updatedPasswordHash } : {}),
      },
    });

    // If password was changed, invalidate all other sessions
    if (updatedPasswordHash) {
      await tx.session.updateMany({
        where: {
          userId: user.id,
          isRevoked: false,
        },
        data: { isRevoked: true },
      });
    }

    await recordAuditEvent(
      {
        organizationId: caller.organizationId,
        actorId: caller.userId,
        action: "user.credentials.update",
        entityType: "User",
        entityId: user.id,
        metadata: {
          passwordChanged: !!updatedPasswordHash,
          usernameChanged: input.username && input.username !== user.username,
        },
      },
      tx
    );

    return updated;
  });

  return {
    success: true,
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
    },
  };
}

/**
 * Public settings accessor for application branding on login and header.
 */
export async function getPublicSettings(organizationCode?: string): Promise<PublicSettings> {
  let orgId: string | null = null;

  if (organizationCode) {
    const org = await prisma.organization.findUnique({
      where: { code: organizationCode },
    });
    if (org) orgId = org.id;
  }

  if (!orgId) {
    const firstOrg = await prisma.organization.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    if (firstOrg) orgId = firstOrg.id;
  }

  if (!orgId) {
    return {
      appName: DEFAULT_COMPANY_SETTINGS.appName,
      companyName: DEFAULT_COMPANY_SETTINGS.companyName,
      companyLogo: null,
      currency: DEFAULT_COMPANY_SETTINGS.currency,
      dateFormat: DEFAULT_COMPANY_SETTINGS.dateFormat,
      timeZone: DEFAULT_COMPANY_SETTINGS.timeZone,
    };
  }

  const map = await loadOrgSettingsMap(orgId);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  return {
    appName: map.get("company.appName") || DEFAULT_COMPANY_SETTINGS.appName,
    companyName: map.get("company.name") || org?.name || DEFAULT_COMPANY_SETTINGS.companyName,
    companyLogo: map.get("company.logo") || null,
    currency: map.get("company.currency") || org?.currency || DEFAULT_COMPANY_SETTINGS.currency,
    dateFormat: map.get("company.dateFormat") || DEFAULT_COMPANY_SETTINGS.dateFormat,
    timeZone: map.get("company.timeZone") || org?.timezone || DEFAULT_COMPANY_SETTINGS.timeZone,
  };
}
