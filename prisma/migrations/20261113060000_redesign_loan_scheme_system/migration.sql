-- Step 1: Add new manual loan scheme fields and termsAndConditions to loan_scheme_versions
ALTER TABLE `loan_scheme_versions` 
    ADD COLUMN `principalAmount` VARCHAR(32) NULL,
    ADD COLUMN `totalRepaymentAmount` VARCHAR(32) NULL,
    ADD COLUMN `termsAndConditions` TEXT NULL,
    MODIFY COLUMN `minPrincipal` VARCHAR(32) NULL,
    MODIFY COLUMN `maxPrincipal` VARCHAR(32) NULL,
    MODIFY COLUMN `interestRate` VARCHAR(32) NULL,
    MODIFY COLUMN `interestMethod` VARCHAR(191) NULL,
    MODIFY COLUMN `gracePeriodDays` INTEGER NULL DEFAULT 0,
    MODIFY COLUMN `repaymentFrequency` VARCHAR(191) NOT NULL DEFAULT 'MONTHLY';

-- Step 2: Backfill existing scheme versions to ensure historical auditability and avoid NULLs
UPDATE `loan_scheme_versions`
SET 
    `principalAmount` = COALESCE(`minPrincipal`, '10000.0000'),
    `totalRepaymentAmount` = COALESCE(`minPrincipal`, '10000.0000'),
    `termsAndConditions` = `notes`
WHERE `principalAmount` IS NULL;

-- Step 3: Add snapshot fields to loan_applications
ALTER TABLE `loan_applications`
    ADD COLUMN `totalRepaymentAmount` VARCHAR(32) NULL;

UPDATE `loan_applications`
SET `totalRepaymentAmount` = `requestedPrincipal`
WHERE `totalRepaymentAmount` IS NULL;

-- Step 4: Add snapshot and tracking fields to loan_accounts
ALTER TABLE `loan_accounts`
    ADD COLUMN `totalRepaymentAmount` VARCHAR(32) NULL,
    ADD COLUMN `totalPaid` VARCHAR(32) NULL DEFAULT '0.0000',
    ADD COLUMN `termMonths` INTEGER NULL;

UPDATE `loan_accounts`
SET 
    `totalRepaymentAmount` = `principalDisbursed`,
    `totalPaid` = CAST(GREATEST(0, CAST(`principalDisbursed` AS DECIMAL(19,4)) - CAST(`principalOutstanding` AS DECIMAL(19,4))) AS CHAR)
WHERE `totalRepaymentAmount` IS NULL;
