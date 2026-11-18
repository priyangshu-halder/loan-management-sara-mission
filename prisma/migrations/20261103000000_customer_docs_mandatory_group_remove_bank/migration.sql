-- Step 1: Add groupId as nullable column first (safe for tables with existing data)
ALTER TABLE `customers` ADD COLUMN `groupId` VARCHAR(191) NULL;

-- Step 2: Backfill groupId from customer_groups for any existing customers that had a group assignment
UPDATE `customers` c
JOIN `customer_groups` cg ON c.id = cg.customerId AND c.organizationId = cg.organizationId
SET c.groupId = cg.groupId
WHERE c.groupId IS NULL;

-- Step 3: Modify groupId to NOT NULL now that existing grouped customers have it populated
ALTER TABLE `customers` MODIFY COLUMN `groupId` VARCHAR(191) NOT NULL;

-- Step 4: Add Foreign Key and Index for groupId
ALTER TABLE `customers` ADD CONSTRAINT `customers_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX `customers_organizationId_groupId_idx` ON `customers`(`organizationId`, `groupId`);

-- Step 5: Create customer_documents table
CREATE TABLE `customer_documents` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `documentType` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `storagePath` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_documents_organizationId_customerId_idx`(`organizationId`, `customerId`),
    INDEX `customer_documents_organizationId_documentType_idx`(`organizationId`, `documentType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_documents` ADD CONSTRAINT `customer_documents_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `customer_documents` ADD CONSTRAINT `customer_documents_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 6: Drop bank account index and columns
DROP INDEX `customers_organizationId_bankAccountStatus_idx` ON `customers`;
ALTER TABLE `customers`
    DROP COLUMN `bankAccountHolderName`,
    DROP COLUMN `bankName`,
    DROP COLUMN `bankAccountNumber`,
    DROP COLUMN `bankIfscCode`,
    DROP COLUMN `bankAccountStatus`,
    DROP COLUMN `bankPassbookDoc`;
