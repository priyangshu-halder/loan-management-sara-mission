import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { ValidationError } from "@/lib/errors/app-error";

export interface StoredFileMetadata {
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
}

export interface StorageProvider {
  save(storageKey: string, buffer: Buffer): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export const ALLOWED_APPLICATION_FORM_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
] as const;

export const ALLOWED_APPLICATION_FORM_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
] as const;

export const MAX_APPLICATION_FORM_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_EXPENSE_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ALLOWED_EXPENSE_ATTACHMENT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
] as const;

export const MAX_EXPENSE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Validates expense voucher/bill file type, extension, and file size on the server.
 */
export function validateExpenseAttachmentFile(
  fileName: string,
  mimeType: string,
  fileSize: number
): void {
  const ext = path.extname(fileName).toLowerCase();

  const isAllowedExt = (ALLOWED_EXPENSE_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
  const isAllowedMime = (ALLOWED_EXPENSE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase());

  if (!isAllowedExt || !isAllowedMime) {
    throw new ValidationError(
      `Unsupported file format for Expense Voucher/Bill. Accepted formats: Images (JPG, PNG, WEBP) and PDF. Received: "${fileName}" (${mimeType || "unknown"})`
    );
  }

  if (fileSize > MAX_EXPENSE_ATTACHMENT_SIZE_BYTES) {
    throw new ValidationError(
      `Expense Voucher/Bill file size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 10 MB.`
    );
  }

  if (fileSize <= 0) {
    throw new ValidationError("Expense Voucher/Bill file is empty.");
  }
}

/**
 * Validates file type, extension, and file size on the server.
 */
export function validateApplicationFormFile(
  fileName: string,
  mimeType: string,
  fileSize: number
): void {
  const ext = path.extname(fileName).toLowerCase();

  const isAllowedExt = (ALLOWED_APPLICATION_FORM_EXTENSIONS as readonly string[]).includes(ext);
  const isAllowedMime = (ALLOWED_APPLICATION_FORM_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase());

  if (!isAllowedExt || !isAllowedMime) {
    throw new ValidationError(
      `Unsupported file format for Application Form. Accepted formats: Images (JPG, PNG, WEBP), PDF, DOC, DOCX. Received: "${fileName}" (${mimeType || "unknown"})`
    );
  }

  if (fileSize > MAX_APPLICATION_FORM_SIZE_BYTES) {
    throw new ValidationError(
      `Application Form file size (${(fileSize / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 10 MB.`
    );
  }

  if (fileSize <= 0) {
    throw new ValidationError("Application Form file is empty.");
  }
}

/**
 * Local filesystem storage provider storing files securely outside public web root.
 */
export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    // Default storage directory is outside public web root
    this.baseDir = customBaseDir || process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), "uploads", "documents");
  }

  private resolvePath(storageKey: string): string {
    if (storageKey.includes("..")) {
      throw new ValidationError("Invalid storage path key: directory traversal detected");
    }
    const fullPath = path.resolve(this.baseDir, storageKey);
    if (!fullPath.startsWith(this.baseDir)) {
      throw new ValidationError("Invalid storage path key: outside base storage directory");
    }
    return fullPath;
  }

  async save(storageKey: string, buffer: Buffer): Promise<string> {
    const filePath = this.resolvePath(storageKey);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    const filePath = this.resolvePath(storageKey);
    return await fs.readFile(filePath);
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const filePath = this.resolvePath(storageKey);
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.resolvePath(storageKey);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

let defaultProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!defaultProvider) {
    defaultProvider = new LocalStorageProvider();
  }
  return defaultProvider;
}

/**
 * Generates a safe storage key and stores the application form document.
 */
export async function saveCustomerApplicationForm(
  organizationId: string,
  customerId: string,
  file: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }
): Promise<StoredFileMetadata> {
  validateApplicationFormFile(file.fileName, file.mimeType, file.buffer.length);

  const rawExt = path.extname(file.fileName).toLowerCase();
  const safeExt = (ALLOWED_APPLICATION_FORM_EXTENSIONS as readonly string[]).includes(rawExt) ? rawExt : ".bin";
  const uniqueId = crypto.randomUUID();
  const safeStorageKey = path.join(
    organizationId,
    customerId,
    `app_form_${uniqueId}${safeExt}`
  );

  const provider = getStorageProvider();
  await provider.save(safeStorageKey, file.buffer);

  // Sanitize original file name for storage metadata
  const sanitizedOriginalName = path.basename(file.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");

  return {
    fileName: sanitizedOriginalName,
    storagePath: safeStorageKey,
    mimeType: file.mimeType,
    fileSize: file.buffer.length,
  };
}

/**
 * Generates a safe storage key and stores the expense voucher or bill document.
 */
export async function saveExpenseAttachment(
  organizationId: string,
  expenseId: string,
  file: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }
): Promise<StoredFileMetadata> {
  validateExpenseAttachmentFile(file.fileName, file.mimeType, file.buffer.length);

  const rawExt = path.extname(file.fileName).toLowerCase();
  const safeExt = (ALLOWED_EXPENSE_ATTACHMENT_EXTENSIONS as readonly string[]).includes(rawExt) ? rawExt : ".bin";
  const uniqueId = crypto.randomUUID();
  const safeStorageKey = path.join(
    organizationId,
    "expenses",
    `voucher_${expenseId}_${uniqueId}${safeExt}`
  );

  const provider = getStorageProvider();
  await provider.save(safeStorageKey, file.buffer);

  // Sanitize original file name for storage metadata
  const sanitizedOriginalName = path.basename(file.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");

  return {
    fileName: sanitizedOriginalName,
    storagePath: safeStorageKey,
    mimeType: file.mimeType,
    fileSize: file.buffer.length,
  };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  const provider = getStorageProvider();
  return await provider.read(storageKey);
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  const provider = getStorageProvider();
  await provider.delete(storageKey);
}
