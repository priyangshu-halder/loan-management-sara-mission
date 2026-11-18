# Architecture --- Loan Management System

## 1. Architectural decisions

-   **Web:** Next.js App Router, React, TypeScript.
-   **Database:** MySQL 8.x.
-   **ORM/migrations:** Prisma ORM, with reviewed SQL migrations where
    locking, constraints, or ledger requirements need database-specific
    behavior.
-   **Validation:** Zod schemas shared where practical between forms and
    server-side actions/services.
-   **Authentication:** secure server-managed sessions using a
    maintained authentication library; avoid storing long-lived access
    tokens in browser local storage.
-   **UI:** responsive component system, accessible form controls,
    server-rendered pages where appropriate.
-   **Testing:** unit, integration, authorization, and end-to-end tests.
-   **Deployment:** containerized application, managed or hardened
    MySQL, reverse proxy/TLS, centralized logs, automated backups.

This is a modular monolith for v1, not microservices. Financial
transactions benefit from a single transactional boundary and simpler
operations. Extract services only when proven scale or team boundaries
justify the cost.

## 2. Logical components

``` text
Browser
  └── Next.js App Router
       ├── Auth / Session
       ├── Route handlers / Server Actions (thin transport layer)
       ├── Application services
       │    ├── Authorization & scope checks
       │    ├── Loan domain
       │    ├── Collection domain
       │    ├── Savings & deposits domain
       │    ├── Expenses domain
       │    ├── Accounting / posting domain
       │    ├── Reporting domain
       │    └── Audit domain
       ├── Repository / Prisma layer
       └── MySQL
```

## 3. Module boundaries

-   `identity`: users, roles, permissions, sessions, audit of security
    actions.
-   `organizations`: organizations/tenants, branches, business
    calendars, settings.
-   `customers`: customer profiles, documents, groups, agent
    assignments.
-   `loans`: schemes and versions, applications, approval decisions,
    disbursements, accounts, schedules, closure.
-   `collections`: receipts, payment allocation, collection sheets,
    arrears and follow-ups.
-   `savings`: savings accounts, deposits, withdrawals.
-   `term-deposits`: RD/FD products, installments, maturity, interest
    postings.
-   `expenses`: expense submission, approval, payment.
-   `accounting`: chart of accounts, journals, posting rules, cashbook,
    daybook, daily sheet, reconciliation, period close.
-   `reports`: authorized read models and exports.
-   `audit`: append-only audit events and privileged activity review.

Modules can share a database but must not bypass domain services for
state-changing operations. For example, the collection UI calls
`CollectionService`, which creates the receipt, allocates the payment,
posts accounting, and updates the loan projection in one database
transaction.

## 4. Multi-tenancy and scope

Use explicit `organizationId` on all tenant-owned records and `branchId`
where relevant. For platform-level users, organization access must be
explicit. Every query and mutation must be scoped server-side.

Recommended v1 model: one shared MySQL database with logical tenant
isolation. Add composite unique keys such as
`(organizationId, accountNumber)` and indexes beginning with
`organizationId`. Never rely on a client-supplied organization ID
without verifying the session's permitted scope. Consider separate
databases only if customer contracts, regulation, or operational
isolation require them.

## 5. Authorization

Use permission codes such as: - `loan.scheme.read`,
`loan.scheme.manage` - `loan.application.create`,
`loan.application.submit`, `loan.application.approve` -
`loan.disbursement.create`, `loan.disbursement.approve`,
`loan.disbursement.post` - `collection.receipt.create`,
`collection.receipt.reverse` - `savings.withdrawal.approve`,
`deposit.interest.post` - `expense.submit`, `expense.approve`,
`expense.post` - `accounting.ledger.read`, `accounting.period.close`,
`report.export`

A permission check should evaluate: 1. authenticated user and active
status; 2. permission grant; 3. organization scope; 4.
branch/group/assignment scope; 5. record state and workflow
preconditions; 6. separation-of-duties rules.

Use shared server helpers (e.g. `requirePermission`,
`requireRecordScope`) and test them. UI hiding is convenience only, not
enforcement.

## 6. Financial posting architecture

The general ledger is the source of truth for posted financial
movements. Operational account balances may be stored as projections for
speed, but must be transactionally maintained and reconcilable to ledger
entries.

Posting flow: 1. Validate command, permission, scope, state, and
idempotency key. 2. Start MySQL transaction. 3. Lock or version-check
affected account/cash/loan rows. 4. Create the operational transaction
and allocation rows. 5. Create journal header and debit/credit lines
using a versioned posting rule. 6. Assert total debits equal total
credits. 7. Update balance projections and source status. 8. Append
audit event and outbox event if needed. 9. Commit; otherwise roll back
everything.

Use `DECIMAL(19,4)` or a business-approved precision for amounts, and a
centrally defined rounding policy. Do not use JavaScript `number` for
exact money arithmetic in domain logic; use decimal arithmetic or
integer minor units where suitable. Never permit an unbalanced journal
to post.

### Reversals and corrections

Posted transactions are immutable. A reversal creates a linked opposite
journal and a corresponding domain correction, with reason, actor, and
approval where configured. Avoid "edit posted receipt" workflows.

### Idempotency and concurrency

-   Unique idempotency key scoped by organization and operation.
-   Unique receipt/voucher numbers within the configured scope.
-   Database unique constraints for duplicate period interest postings.
-   Transaction isolation/row locks or optimistic version columns for
    balance-changing records.
-   Retry only known transient errors, with bounded retry policy.

## 7. Data model (conceptual)

Core entities (fields are illustrative; review before migration): -
`Organization`, `Branch`, `BusinessSetting` - `User`, `Role`,
`Permission`, `UserRole`, `RolePermission`, `UserScope` - `Customer`,
`CustomerDocument`, `Group`, `GroupMember`, `AgentAssignment` -
`LoanScheme`, `LoanSchemeVersion`, `LoanApplication`,
`ApplicationDecision` - `LoanAccount`, `RepaymentInstallment`,
`LoanDisbursement`, `LoanClosure` - `CollectionReceipt`,
`PaymentAllocation`, `CollectionSheet`, `CollectionSheetItem`,
`FollowUp` - `SavingsProduct`, `SavingsAccount`, `SavingsTransaction` -
`DepositProduct`, `RDAccount`, `RDInstallment`, `FDAccount`,
`DepositInterestPosting`, `DepositMaturity` - `Expense`,
`ExpenseApproval`, `ExpensePayment` - `ChartOfAccount`, `JournalEntry`,
`JournalLine`, `PostingRuleVersion`, `CashSession`, `Reconciliation` -
`AuditEvent`, `IdempotencyRecord`, `OutboxEvent`, `Attachment`

Every tenant-owned entity should include organization scope; branch
scope should be present where business rules require it. Use foreign
keys and restrictive delete behavior for financial records. Add
created/updated actor metadata and timestamps. Use status enums or
controlled lookup values with explicit state transitions.

### 7.1 Customer, Group & Document Storage Architecture

-   **Mandatory Customer Group Relation:**
    -   `Customer.groupId` is a mandatory foreign key referencing `Group(id)` with `onDelete: Restrict`.
    -   Every customer must be assigned to an active center/group within the caller's permitted branch scope.
    -   Secondary group memberships are maintained through `CustomerGroup`.
-   **Borrower Bank Details Removal:**
    -   Customer KYC records no longer store borrower bank account numbers, IFSC codes, or passbook copies.
    -   Organizational liquidity accounts remain managed under ledger `CashAccount`.
-   **Secure Document Storage Abstraction (`src/lib/storage/storage-provider.ts`):**
    -   `StorageProvider` defines an abstraction for storing, reading, and deleting files, with `LocalStorageProvider` for filesystem deployment and extensibility for S3/Azure Blob.
    -   Files are saved strictly outside the public web root in a secure root directory (`uploads/documents/` by default, configurable via `DOCUMENT_STORAGE_DIR`).
    -   Safe storage path generation: sanitizes filenames, prevents path traversal (`..` guard), and prepends random UUIDs.
    -   `CustomerDocument` table records metadata (`organizationId`, `customerId`, `documentType`, `fileName`, `storagePath`, `mimeType`, `fileSize`).
    -   Serving: Streamed directly through authenticated API routes (`/api/customers/[id]/documents/[type]`) with `nosniff`, `Cache-Control: private`, and strict permission checks (`customer.kyc.view` / `customer.detail.view`). No direct public URL access.
    -   Orphan prevention: If database customer creation fails, newly written storage files are automatically cleaned up. Replacing or removing documents safely deletes previous files from disk.

### 7.2 Manually Configured Loan Scheme & Schedule Architecture

-   **Manual Scheme Model (`LoanSchemeVersion`):**
    -   Fields: `principalAmount` (Decimal(15,4)), `repaymentPeriod` (Int, months), `totalRepaymentAmount` (Decimal(15,4)), `termsAndConditions` (Text).
    -   Retired fields (`minPrincipal`, `maxPrincipal`, `interestRate`, `interestMethod`, `gracePeriodDays`) are made nullable to maintain complete non-destructive backward compatibility with existing historical loans.
    -   Maker explicitly specifies contractual principal and total repayment. No formula-based interest calculations are performed.
-   **Loan Snapshotting & Immutability:**
    -   `LoanApplication` snapshots `totalRepaymentAmount`.
    -   `LoanAccount` snapshots `principalDisbursed`, `totalRepaymentAmount`, and `termMonths`.
    -   Disbursement is atomic: initializes `totalPaid = 0.00` and `principalOutstanding = totalRepaymentAmount`.
    -   Subsequent changes or versions of a scheme have zero effect on active or closed loans.
-   **Schedule Generation Engine (`src/modules/loans/loan-schedule-engine.ts`):**
    -   Deterministic installment generation based on `totalRepaymentAmount` and `repaymentPeriod`.
    -   Rounding remainder distribution via integer minor units (paisa/cents):
        `baseMinor = Math.floor(totalMinor / N)`, `remainderMinor = totalMinor - baseMinor * N`.
        The remainder minor units are distributed across the final installments, guaranteeing `sum(installments) === totalRepaymentAmount`.
    -   Dual calculation engine: automatically falls back to legacy formula calculations if `totalRepaymentAmount` is null (preserving historical loans).
-   **Repayment & Collections Flow:**
    -   Collections directly decrement `principalOutstanding` in `loan_accounts` and increment `totalPaid`.
    -   `principalOutstanding = totalRepaymentAmount - totalCollected`.
    -   Receipt reversal reverses the balance decrement transactionally.
    -   Double-entry journal postings record principal disbursements and collection receipts without altering contractual obligations.

### 7.3 Daily Sheet, Cashbook & Cash Reconciliation Architecture

-   **Daily Sheet Data Model (`DailyCashRecord`):**
    -   Fields: `organizationId`, `branchId`, `cashAccountId`, `businessDate`, `openingBalance`, `totalReceived`, `totalPayment`, `closingBalance`, `isFinalized`, `isInitial`, `finalizedAt`, `finalizedById`, `notes`.
    -   Composite unique key: `@@unique([organizationId, cashAccountId, businessDate])` strictly preventing multiple conflicting opening/closing balances for the same cash account and date.
-   **Cash Reconciliation & Carry-Forward Logic:**
    -   $\text{Closing Cash} = \text{Opening Cash} + \text{Total Cash Received} - \text{Total Cash Payment}$.
    -   The previous day's finalized closing cash automatically carries forward as the next day's opening cash.
    -   Authorised users can establish initial baseline opening balance for day 1.
    -   Unfinalized previous days are detected and surfaced with live running balance indicators.
    -   Post-finalization backdated transactions trigger an auditable discrepancy notice with variance tracking and re-finalization.
-   **Deterministic Classification Engine (`src/modules/accounting/ledger-service.ts`):**
    -   Every posted journal line for the selected account's general ledger ID is mapped line by line against balancing entries.
    -   Received: Opening, Advance (credit 2004), Repayment (credit 1201/4001/4002/4003), RD (credit 2002), FD (credit 2003), Bank Transfer (debit cash, credit bank), Loan (settlement/closure), Miscellaneous.
    -   Payment: Savings Withdrawal (debit 2001), Bank Transfer (credit cash, debit bank), Loan Payment (debit 1201), Expenses (debit 5000-series), Miscellaneous.
    -   Exact reconciliation guarantee: $\sum \text{Received} \equiv \sum \text{Debits}$ and $\sum \text{Payment} \equiv \sum \text{Credits}$.
-   **Internal Bank Transfers:**
    -   `recordInternalTransfer` executes atomic balanced journal entries (`sourceModule: "MANUAL"`, `sourceType: "BANK_TRANSFER"`).
    -   Cash-to-bank reduces cash-in-hand; bank-to-cash increases cash-in-hand; bank-to-bank does not affect physical cash.
    -   Transfers between internal asset accounts create zero artificial income or expense.
-   **Cashbook Date-Wise Financial Table Engine:**
    -   Displays daily figures in chronological order (oldest first) across selected date range `[startDate, endDate]`.
    -   Default start date is resolved dynamically via `getEarliestCashbookDate`, end date defaults to `getTodayBusinessDate()`.
    -   Guarantees inclusion of all dates within the range (empty dates display `0.00`/`—` for categories with continuous carry-forward of Opening and Cash in Hand).
    -   Strict 17-column order: `Date`, `Opening`, `Advance`, `Repayment`, `RD`, `FD`, `Bank Transfer (Received)`, `Loan`, `Miscellaneous (Received)`, `Total Received`, `Savings Withdrawal`, `Bank Transfer (Payment)`, `Loan Payment`, `Expenses`, `Miscellaneous (Payment)`, `Total Payment`, `Cash in Hand`.
    -   Invariants: $\text{Total Received} = \sum 7 \text{ Received Categories}$ (excluding Opening); $\text{Total Payment} = \sum 5 \text{ Payment Categories}$; $\text{Cash in Hand} = \text{Opening} + \text{Total Received} - \text{Total Payment}$; $\text{Opening}_{t+1} \equiv \text{Cash in Hand}_t$.
    -   Period Summary Row: Aggregates category sums, total received, total payment, initial period opening, and final cash in hand (never sums daily opening or closing balances).
    -   Negative Cash in Hand: Highlighted with warning indicators without masking or zeroing deficits.
-   **Daybook Complete Daily Transaction Register Architecture:**
    -   Serves as the chronological, authoritative daily transaction register of all accounting postings across loans, collections, savings, term deposits, expenses, bank transfers, and manual adjustments.
    -   Organised date-wise with distinct daily headings and voucher counts; omits inactive dates with zero transactions.
    -   Detailed 10-column table per date: `Voucher No.`, `Transaction Date`, `Source Module`, `Transaction Type`, `Reference`, `Description`, `Debit (₹)`, `Credit (₹)`, `Status`, `Action`.
    -   Exposes complete double-entry lines inline and in detail modals: ensures every voucher satisfies $\sum \text{Debits} \equiv \sum \text{Credits}$.
    -   Daily totals reconciling debits and credits per date, alongside cumulative period totals.
    -   Multi-dimensional filtering (date range, voucher number, source module, transaction type, search text, GL account, status) with reverse/forward chronological sorting.
    -   Preserves full audit trails, reversal links (`reversalOf` / `reversedBy`), and immutability of historical vouchers.
-   **Full Ledger Reconciliation:**
    -   Daybook (complete daily transaction register with individual debit/credit lines), Cashbook (date-wise 17-column financial table), and Daily Sheet (category-wise statement) reconcile 100% against the same underlying posted journal records and classification engine without duplicate postings.

## 8. Suggested database constraints and indexes

-   Unique `(organizationId, loanAccountNumber)`,
    `(organizationId, receiptNumber)`,
    `(organizationId, voucherNumber)`.
-   Unique `(organizationId, operation, idempotencyKey)`.
-   Unique `(depositAccountId, accrualPeriod, postingType)` for
    idempotent interest posting.
-   Check journal balance in the posting service; if database-side
    enforcement is practical, add complementary safeguards.
-   Index `(organizationId, branchId, status, businessDate)` for
    operational lists.
-   Index `(organizationId, customerId, createdAt)` for customer
    history.
-   Index `(organizationId, loanAccountId, dueDate, status)` for
    arrears.
-   Index `(organizationId, postingDate, accountId)` for accounting
    reports.
-   Avoid cascading deletion from customer/account entities into posted
    financial history.

## 9. Application structure

``` text
src/
  app/
    (auth)/
    (dashboard)/
      loans/
      collections/
      savings/
      deposits/
      expenses/
      accounting/
      reports/
      admin/
    api/
  components/
    ui/
    forms/
    tables/
    navigation/
  modules/
    identity/
    organizations/
    customers/
    loans/
    collections/
    savings/
    term-deposits/
    expenses/
    accounting/
    reports/
    audit/
  lib/
    auth/
    db/
    permissions/
    validation/
    money/
    dates/
    errors/
    observability/
  jobs/
  tests/
prisma/
  schema.prisma
  migrations/
```

Keep route handlers thin. Domain rules belong in application/domain
services, not React components or scattered server actions.

## 10. Security and privacy

-   HTTPS everywhere; secure, HttpOnly, SameSite cookies.
-   CSRF protection appropriate to the chosen auth/session design.
-   Password hashing via a modern password-hashing library.
-   Rate limit authentication and sensitive endpoints.
-   Validate all inputs server-side; use output encoding and safe file
    handling.
-   Restrict document uploads by type/size; store outside public web
    root and use authorized downloads.
-   Secrets only in environment/secret manager; never commit `.env`.
-   Audit sensitive reads/exports as required by policy.
-   Encrypt backups and restrict access.
-   Define retention, consent, incident response, and data-subject
    handling policies with qualified counsel.
-   Do not log passwords, secrets, full identity numbers, or unnecessary
    personal/financial data.

## 11. Reporting and performance

Start with indexed transactional queries and SQL views/read models. Do
not introduce a separate analytics database prematurely. Large exports
should run as background jobs, with permission checks at request and
download time. Use pagination, bounded date ranges, and explicit export
limits.

## 12. Background jobs and integrations

Use a durable job mechanism for scheduled reports, maturity reminders,
interest accrual previews, backup checks, and export generation.
Financial posting jobs must be idempotent and produce operational alerts
on failure. A job must not silently approve or post a financial
transaction that requires human authorization.

Use an outbox pattern for reliable email/SMS/webhook delivery after
transaction commit. Integrations are optional and out of v1 scope.

## 13. Deployment and operations

-   Separate development, staging, and production environments.
-   CI: typecheck, lint, unit/integration tests, migration checks,
    dependency/security scan.
-   Deploy immutable builds; apply reviewed migrations before or during
    release with rollback strategy.
-   MySQL private network access only; least-privilege DB user; no
    public database port.
-   Automated encrypted backups and periodic restore drills.
-   Health/readiness endpoints, structured logs, metrics, alerting, and
    error reporting.
-   Document recovery objectives and manual fallback procedure for
    critical collection days.

## 14. Architecture risks

-   Incorrect interest or payment-allocation rules can cause financial
    harm; obtain approved examples before coding.
-   Tenant leakage is a high-severity risk; use scope enforcement and
    adversarial authorization tests.
-   Balance drift is possible if operational balances are updated
    outside the posting service.
-   Large report queries can degrade collection-day performance; index
    and load test realistic volumes.
-   Applicable legal obligations depend on the operating entity and
    products; obtain professional compliance review.
