-- CreateTable
CREATE TABLE `master_catalog_items` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `master_catalog_items_organizationId_category_isActive_idx`(`organizationId`, `category`, `isActive`),
    UNIQUE INDEX `master_catalog_items_organizationId_category_code_key`(`organizationId`, `category`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `customers`
    ADD COLUMN `bankAccountHolderName` VARCHAR(191) NULL,
    ADD COLUMN `bankName` VARCHAR(191) NULL,
    ADD COLUMN `bankAccountNumber` VARCHAR(191) NULL,
    ADD COLUMN `bankIfscCode` VARCHAR(191) NULL,
    ADD COLUMN `bankAccountStatus` VARCHAR(191) NULL DEFAULT 'PENDING',
    ADD COLUMN `bankPassbookDoc` LONGTEXT NULL,
    ADD COLUMN `maritalStatus` VARCHAR(191) NULL,
    ADD COLUMN `familyMembers` INTEGER NULL,
    ADD COLUMN `primaryOccupation` VARCHAR(191) NULL,
    ADD COLUMN `communityId` VARCHAR(191) NULL,
    ADD COLUMN `educationId` VARCHAR(191) NULL,
    ADD COLUMN `annualIncome` DECIMAL(19, 4) NULL;

-- CreateIndex
CREATE INDEX `customers_organizationId_bankAccountStatus_idx` ON `customers`(`organizationId`, `bankAccountStatus`);
CREATE INDEX `customers_organizationId_communityId_idx` ON `customers`(`organizationId`, `communityId`);
CREATE INDEX `customers_organizationId_educationId_idx` ON `customers`(`organizationId`, `educationId`);

-- AddForeignKey
ALTER TABLE `master_catalog_items` ADD CONSTRAINT `master_catalog_items_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_communityId_fkey` FOREIGN KEY (`communityId`) REFERENCES `master_catalog_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customers` ADD CONSTRAINT `customers_educationId_fkey` FOREIGN KEY (`educationId`) REFERENCES `master_catalog_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
