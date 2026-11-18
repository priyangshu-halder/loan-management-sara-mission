import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs/promises";
import {
  LocalStorageProvider,
  validateApplicationFormFile,
  saveCustomerApplicationForm,
  validateExpenseAttachmentFile,
  saveExpenseAttachment,
  ALLOWED_APPLICATION_FORM_MIME_TYPES,
  ALLOWED_APPLICATION_FORM_EXTENSIONS,
  MAX_APPLICATION_FORM_SIZE_BYTES,
  MAX_EXPENSE_ATTACHMENT_SIZE_BYTES,
} from "./storage-provider";
import { ValidationError } from "@/lib/errors/app-error";

describe("Storage Provider & Document Validation", () => {
  const testDir = path.resolve(process.cwd(), "uploads", "test-documents");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("validateApplicationFormFile", () => {
    it("accepts valid PDF documents", () => {
      expect(() =>
        validateApplicationFormFile("application.pdf", "application/pdf", 1024 * 1024)
      ).not.toThrow();
    });

    it("accepts valid Images (JPG, PNG, WEBP)", () => {
      expect(() =>
        validateApplicationFormFile("photo.jpg", "image/jpeg", 500 * 1024)
      ).not.toThrow();
      expect(() =>
        validateApplicationFormFile("scan.png", "image/png", 800 * 1024)
      ).not.toThrow();
      expect(() =>
        validateApplicationFormFile("form.webp", "image/webp", 200 * 1024)
      ).not.toThrow();
    });

    it("accepts valid Word documents (DOC, DOCX)", () => {
      expect(() =>
        validateApplicationFormFile("form.doc", "application/msword", 300 * 1024)
      ).not.toThrow();
      expect(() =>
        validateApplicationFormFile(
          "form.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          400 * 1024
        )
      ).not.toThrow();
    });

    it("rejects unsupported extensions or executable files", () => {
      expect(() =>
        validateApplicationFormFile("malicious.exe", "application/octet-stream", 1024)
      ).toThrow(ValidationError);
      expect(() =>
        validateApplicationFormFile("archive.zip", "application/zip", 1024)
      ).toThrow(/Unsupported file format/);
    });

    it("rejects oversized files exceeding 10MB limit", () => {
      const oversizedBytes = MAX_APPLICATION_FORM_SIZE_BYTES + 1;
      expect(() =>
        validateApplicationFormFile("big.pdf", "application/pdf", oversizedBytes)
      ).toThrow(/exceeds the maximum allowed limit/);
    });

    it("rejects empty files (0 bytes)", () => {
      expect(() =>
        validateApplicationFormFile("empty.pdf", "application/pdf", 0)
      ).toThrow(/file is empty/);
    });
  });

  describe("validateExpenseAttachmentFile", () => {
    it("accepts valid voucher PDFs", () => {
      expect(() =>
        validateExpenseAttachmentFile("invoice.pdf", "application/pdf", 1024 * 500)
      ).not.toThrow();
    });

    it("accepts valid voucher images (JPG, PNG, WEBP)", () => {
      expect(() =>
        validateExpenseAttachmentFile("receipt.jpg", "image/jpeg", 250 * 1024)
      ).not.toThrow();
      expect(() =>
        validateExpenseAttachmentFile("bill.png", "image/png", 400 * 1024)
      ).not.toThrow();
      expect(() =>
        validateExpenseAttachmentFile("voucher.webp", "image/webp", 150 * 1024)
      ).not.toThrow();
    });

    it("rejects unsupported extensions (DOCX, ZIP, EXE)", () => {
      expect(() =>
        validateExpenseAttachmentFile("receipt.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1024)
      ).toThrow(ValidationError);
      expect(() =>
        validateExpenseAttachmentFile("payload.exe", "application/octet-stream", 1024)
      ).toThrow(/Unsupported file format/);
    });

    it("rejects oversized expense voucher files (> 10MB)", () => {
      expect(() =>
        validateExpenseAttachmentFile("huge.pdf", "application/pdf", MAX_EXPENSE_ATTACHMENT_SIZE_BYTES + 1)
      ).toThrow(/exceeds the maximum allowed limit/);
    });

    it("rejects empty expense voucher files (0 bytes)", () => {
      expect(() =>
        validateExpenseAttachmentFile("empty.jpg", "image/jpeg", 0)
      ).toThrow(/file is empty/);
    });
  });

  describe("LocalStorageProvider operations", () => {
    it("saves, reads, checks existence, and deletes a file", async () => {
      const provider = new LocalStorageProvider(testDir);
      const testKey = path.join("org-1", "cust-1", "test.pdf");
      const testBuffer = Buffer.from("PDF-MOCK-CONTENT-12345");

      const savedKey = await provider.save(testKey, testBuffer);
      expect(savedKey).toBe(testKey);

      const existsBefore = await provider.exists(testKey);
      expect(existsBefore).toBe(true);

      const readBuffer = await provider.read(testKey);
      expect(readBuffer.toString()).toBe("PDF-MOCK-CONTENT-12345");

      await provider.delete(testKey);
      const existsAfter = await provider.exists(testKey);
      expect(existsAfter).toBe(false);
    });

    it("prevents directory traversal attempts", async () => {
      const provider = new LocalStorageProvider(testDir);
      const traversalKey = "../../../../etc/passwd";
      const buffer = Buffer.from("hacked");

      await expect(provider.save(traversalKey, buffer)).rejects.toThrow(
        /directory traversal detected/
      );
    });
  });
});
