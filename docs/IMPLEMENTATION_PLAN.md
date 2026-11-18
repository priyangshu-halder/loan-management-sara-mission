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
-   Implement journal entry/header/line models and posting-rule versions.
-   Implement posting service with balanced-journal invariant, transaction rollback, idempotency, audit, and reversals.
-   Implement cash/bank accounts, cashbook, daybook, and standard ledger reconciliation.
-   **Complete Daily Sheet Redesign:**
    -   Structured into 3 distinct sections: Received (9 categories), Payment (6 categories), and Daily Cash Summary with prominent CASH IN HAND.
    -   Exact formula: $\text{Closing Cash} = \text{Opening Cash} + \text{Total Cash Received} - \text{Total Cash Payment}$.
    -   Automated carry-forward state machine persisting daily snapshots (`DailyCashRecord`) with initial opening baseline setup and unfinalized status identification.
    -   Internal bank transfer treatment adjusting physical cash-in-hand without inflating revenue or expenses.
    -   Auditable backdated transaction variance tracking and re-finalization.
-   **Complete Cashbook Redesign (Date-Wise Financial Table):**
    -   Table-only UI with zero summary cards, charts, graphs, or individual transaction cards.
    -   Chronological ascending daily rows for selected date range (defaulting to earliest available date up to today).
    -   Full continuous date inclusion with zero omitted dates (empty dates display 0.00/— for categories with carry-forward opening/closing).
    -   17 columns in strict required order: Date, Opening, Advance, Repayment, RD, FD, Bank Transfer (Received), Loan, Miscellaneous (Received), Total Received, Savings Withdrawal, Bank Transfer (Payment), Loan Payment, Expenses, Miscellaneous (Payment), Total Payment, Cash in Hand.
    -   Summary row displaying category totals, initial period opening, and final cash in hand without summing daily balances.
    -   Internal bank transfer classification and negative cash warning highlight.
-   **Complete Daybook Redesign (Daily Transaction Register):**
    -   Chronological transaction register of all accounting transactions across all modules.
    -   Date-wise organisation with distinct date headings and voucher counts; excludes empty dates.
    -   10-column table per date with complete double-entry breakdown inline and in detail modal.
    -   Daily totals and overall period reconciliation ($Dr \equiv Cr$).
    -   Multi-dimensional filtering (date range, voucher #, module, type, search, GL account, status).
-   Add seeded accounting scenarios and reconciliation tests (Daily Sheet Tests A–F, Cashbook Tests 1–8, Daybook Tests 1–7).

**Exit gate:** Every test posting balances; duplicate requests do not duplicate transactions; failed postings roll back completely; Daybook, Cashbook, and Daily Sheet reconcile 100% with zero mathematical or double-entry discrepancies.

## Phase 3 --- Customers, groups, and loan schemes

-   Customer registration and profile with mandatory Center / Group selection
    enforced server-side and client-side (`Customer.groupId` NOT NULL).
-   Secure onboarding document storage abstraction (`StorageProvider`) supporting
    Application Form uploads (Images, PDF, DOC, DOCX up to 10MB) outside public web root.
-   Removal of redundant borrower bank account fields from customer models, UI forms,
    and exports.
-   Consistent high-contrast form control design system (`Input`, `Select`, `Textarea`).
-   Group management, membership history, agent assignments, collection day.
-   **Complete Loan Scheme Redesign:** Transition from formula-based interest schemes to manually defined loan schemes:
    -   Fields: Scheme Code, Scheme Name, Loan Amount (Principal), Repayment Period (Months), Total Repayment Amount, Terms & Conditions.
    -   Retired fields: Interest Rate, Interest Calculation Method, Min/Max Principal, Grace Period, Initial Status.
    -   Maker full control over total repayment amount; validation enforces total repayment $\ge$ loan amount.
    -   Installment breakdown engine distributing rounding remainders in integer minor units guaranteeing exact sum matching total repayment amount.
    -   Historical scheme version compatibility preserved via nullable columns.

**Exit gate:** Calculation results match business-approved examples for
Scenarios A, B, C (uneven division), normal, boundary, leap-year/date, and rounding cases.

## Phase 4 --- Loan application and disbursement

-   Application creation with scheme selection auto-populating principal, period, and total repayment amount.
-   Application snapshots `totalRepaymentAmount`.
-   Maker-checker workflow and rejection/resubmission.
-   Disbursement workflow snapshotting `principalDisbursed`, `totalRepaymentAmount`, and `termMonths`, initializing `principalOutstanding = totalRepaymentAmount`.
-   Double-entry journal posting, cashbook balance verification, and loan-account creation.
-   Loan account overview showing Disbursed Principal, Total Repayable, Total Collected, and Outstanding Balance.
-   Isolation guarantee: subsequent scheme changes never alter existing disbursed loans (Scenario D).

**Exit gate:** Disbursement is impossible before approval; duplicate
requests cannot disburse twice; ledger and loan-account balances
reconcile; schedule sum matches total contractual obligation exactly.

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
