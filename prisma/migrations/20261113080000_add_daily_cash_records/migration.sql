-- CreateTable
CREATE TABLE `daily_cash_records` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NULL,
    `cashAccountId` VARCHAR(191) NOT NULL,
    `businessDate` VARCHAR(191) NOT NULL,
    `openingBalance` DECIMAL(19, 4) NOT NULL,
    `totalReceived` DECIMAL(19, 4) NOT NULL,
    `totalPayment` DECIMAL(19, 4) NOT NULL,
    `closingBalance` DECIMAL(19, 4) NOT NULL,
    `isFinalized` BOOLEAN NOT NULL DEFAULT false,
    `isInitial` BOOLEAN NOT NULL DEFAULT false,
    `finalizedAt` DATETIME(3) NULL,
    `finalizedById` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `daily_cash_records_organizationId_businessDate_idx`(`organizationId`, `businessDate`),
    INDEX `daily_cash_records_organizationId_cashAccountId_idx`(`organizationId`, `cashAccountId`),
    UNIQUE INDEX `daily_cash_records_organizationId_cashAccountId_businessDate_key`(`organizationId`, `cashAccountId`, `businessDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `daily_cash_records` ADD CONSTRAINT `daily_cash_records_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_cash_records` ADD CONSTRAINT `daily_cash_records_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_cash_records` ADD CONSTRAINT `daily_cash_records_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `cash_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_cash_records` ADD CONSTRAINT `daily_cash_records_finalizedById_fkey` FOREIGN KEY (`finalizedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
