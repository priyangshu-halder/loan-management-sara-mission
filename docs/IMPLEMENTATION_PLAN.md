# Implementation Plan

## Delivery approach

Build a modular monolith with vertical slices. Do not build all screens
first and add financial correctness later. Each slice should include UI,
authorization, domain service, database migration, audit, accounting
impact where relevant, and tests.

## Phase 0 --- Business rules and decisions

**Deliverables** - Confirm legal entity, product type, branches, users,
and tenant model. - Approve loan interest methods, repayment
frequencies, rounding, fee/penalty rules, and payment allocation. -
Approve savings/RD/FD calculations, maturity, early withdrawal, and tax
handling. - Approve chart of accounts, journal mappings, cash handling,
receipt/voucher numbering, approval thresholds, and period close. -
Write worked examples for each financial calculation.

**Exit gate:** Product owner and accounting/compliance reviewer sign off
on rules and sample expected outputs. Do not implement production
financial calculations while these are ambiguous.

## Phase 1 --- Foundation

-   Initialize Next.js App Router + TypeScript, linting, formatting,
    environment validation, CI.
-   Set up MySQL, Prisma schema, migrations, seed strategy, and database
    transaction conventions.
-   Implement authentication, secure sessions, password reset, account
    status, and login audit.
-   Implement organization, branch, business settings, users, roles,
    permissions, and scope assignments.
-   Add authorization helpers and audit event service.
-   Create shared money/date/decimal utilities and error conventions.
-   Build dashboard shell, navigation, responsive tables/forms,
    pagination, and accessible validation.

**Exit gate:** Authorization tests prove users cannot access another
organization/branch by URL, query, or request-body tampering.

## Phase 2 --- Accounting foundation

-   Define chart of accounts and fiscal periods.
-   Implement journal entry/header/line models and posting-rule
    versions.
-   Implement posting service with balanced-journal invariant,
    transaction rollback, idempotency, audit, and reversals.
-   Implement cash/bank accounts, cash sessions if required, cashbook,
    daybook, daily sheet, and basic reconciliation.
-   Add seeded accounting scenarios and reconciliation tests.

**Exit gate:** Every test posting balances; duplicate requests do not
duplicate transactions; failed postings roll back completely.

## Phase 3 --- Customers, groups, and loan schemes

-   Customer registration and profile, document metadata/upload access
    controls.
-   Group management, membership history, agent assignments, collection
    day.
-   Loan scheme and immutable scheme versions.
-   Loan calculation engine with approved test fixtures and schedule
    previews.

**Exit gate:** Calculation results match business-approved examples for
normal, boundary, leap-year/date, early-payment, and rounding cases as
applicable.

## Phase 4 --- Loan application and disbursement

-   Application creation, submission, review, approve/reject,
    conditions, and decision history.
-   Maker-checker workflow and rejection/resubmission.
-   Disbursement workflow, payment source, receipt/voucher, accounting
    posting, and loan-account creation.
-   Loan account overview, schedule, balance breakdown, and transaction
    history.

**Exit gate:** Disbursement is impossible before approval; duplicate
requests cannot disburse twice; ledger and loan-account balances
reconcile.

## Phase 5 --- Collections

-   Daily collection receipts and configurable allocation policy.
-   Advance collection handling as unapplied credit or future
    installment allocation per signed-off policy.
-   Due/overdue queues, aging, follow-up and promise-to-pay.
-   Collection sheets by agent/group/date,
    submission/review/reconciliation.
-   Collection history, receipt print view, and controlled reversal
    flow.

**Exit gate:** Collection, allocation, cashbook, daybook, loan balances,
and receipt totals reconcile for tested scenarios.

## Phase 6 --- Loan closure

-   Settlement quote with as-of date.
-   Approval and posting of settlement, fees/waivers where applicable,
    closure validation.
-   Closure certificate/receipt and closed-account read-only history.
-   Controlled reopen/reversal permissions.

**Exit gate:** Account cannot close with unresolved balance unless an
explicit approved write-off/waiver workflow allows it.

## Phase 7 --- Savings and deposits

-   Savings products/accounts, deposits, withdrawals, limits, and
    approvals.
-   RD product/account, installment tracking, maturity projection.
-   FD product/account, maturity, payout, renewal, and premature
    closure.
-   Interest accrual/posting with idempotency and versioned calculation
    rules.
-   Ledger mapping and reconciliation reports.

**Exit gate:** Interest posting cannot duplicate for the same period;
withdrawals/maturity respect product rules and balances reconcile.

## Phase 8 --- Expenses

-   Expense categories and add-expense workflow.
-   Submission, maker-checker approval, rejection/resubmission.
-   Payment/posting and accounting entries.
-   Expense reports and export permissions.

**Exit gate:** Unapproved expenses cannot be paid/posted; expense
reports reconcile with ledger and cashbook.

## Phase 9 --- Reports and dashboards

-   Portfolio and collection KPIs.
-   Loan application pipeline, disbursement, overdue aging, agent/group
    performance.
-   Savings/RD/FD balances and maturities.
-   Expense summaries and accounting reports.
-   CSV/XLSX/PDF export only after authorization and audit controls.

**Exit gate:** Each report has documented definitions and reconciles
against transaction-level source data.

## Phase 10 --- Hardening and launch

-   Threat model and authorization penetration tests.
-   Performance/load tests using expected peak-day volume.
-   Accessibility and mobile/tablet usability review.
-   Backup/restore drill, disaster recovery runbook, monitoring and
    alerting.
-   Data import validation, duplicate detection, migration rehearsal,
    and rollback plan.
-   Staff training, user guides, incident procedures, and production
    sign-off.
-   Legal/compliance/accounting review for the actual operating model.

**Exit gate:** No open critical/high security issues; restore procedure
proven; financial UAT signed off; operational owner accepts launch
risks.

## Suggested MVP boundary

For a credible first operational release, prioritize: 1. Foundation and
permissions 2. Accounting posting engine 3. Customers/groups/schemes 4.
Applications/disbursement/accounts 5. Collections and loan closure 6.
Cashbook/daybook/daily sheet 7. Basic reports and audit

Add savings/RD/FD and expense workflows after the ledger foundation is
proven, unless these are mandatory for the first pilot.

## Definition of done for every feature

-   Requirements and state transitions documented.
-   Server-side permission and scope checks implemented.
-   Validation covers malformed, out-of-scope, duplicate, and
    invalid-state requests.
-   Database migration reviewed and tested.
-   Financial mutations run transactionally and are idempotent where
    needed.
-   Audit events exist for sensitive actions.
-   Unit and integration tests pass; end-to-end tests cover critical
    user journeys.
-   Loading, empty, error, and permission-denied states are present.
-   Reports and balance projections reconcile.
-   Documentation updated; no secrets committed.
