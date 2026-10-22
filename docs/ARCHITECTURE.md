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
