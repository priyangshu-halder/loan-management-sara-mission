-- AlterTable
ALTER TABLE `expenses` ADD COLUMN `attachmentFileName` VARCHAR(191) NULL,
    ADD COLUMN `attachmentFileSize` INTEGER NULL,
    ADD COLUMN `attachmentMimeType` VARCHAR(191) NULL,
    ADD COLUMN `attachmentStoragePath` VARCHAR(191) NULL;
