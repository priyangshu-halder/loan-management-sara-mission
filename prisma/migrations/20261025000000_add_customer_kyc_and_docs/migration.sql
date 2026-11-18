-- AlterTable
ALTER TABLE `customers`
    ADD COLUMN `guardianName` VARCHAR(191) NULL,
    ADD COLUMN `dateOfBirth` DATETIME(3) NULL,
    ADD COLUMN `gender` VARCHAR(191) NULL,
    ADD COLUMN `aadhaarNumber` VARCHAR(191) NULL,
    ADD COLUMN `panNumber` VARCHAR(191) NULL,
    ADD COLUMN `occupation` VARCHAR(191) NULL,
    ADD COLUMN `residentialAddress` TEXT NULL,
    ADD COLUMN `nomineeName` VARCHAR(191) NULL,
    ADD COLUMN `guarantorName` VARCHAR(191) NULL,
    ADD COLUMN `passportPhoto` LONGTEXT NULL,
    ADD COLUMN `aadhaarFrontDoc` LONGTEXT NULL,
    ADD COLUMN `aadhaarBackDoc` LONGTEXT NULL,
    ADD COLUMN `panPhoto` LONGTEXT NULL;

-- CreateIndex
CREATE INDEX `customers_organizationId_aadhaarNumber_idx` ON `customers`(`organizationId`, `aadhaarNumber`);
