# Product Requirements Document (PRD)

## Loan Management System

**Status:** Initial product specification\
**Product type:** Multi-tenant loan, savings, deposits, collections,
expenses, and accounting platform\
**Proposed stack:** Next.js + TypeScript, MySQL, Prisma ORM\
**Primary market assumption:** India; configurable financial rules and
compliance requirements must be validated before production.

## 1. Product vision

Build a secure, auditable loan-management platform for an organization
that operates multiple branches, groups, field agents, loan products,
and customer accounts. A Super Admin controls the organization and
creates staff users with narrowly scoped permissions. The system must
support the complete loan lifecycle, savings and term deposits,
collections, expenses, and daily accounting.

The system is not just a set of CRUD screens. Financial actions must
produce traceable ledger entries, preserve history, enforce approval
rules, and reconcile operational activity with accounting.

## 2. Goals

-   Manage customers, groups, loan schemes, applications, disbursements,
    loan accounts, repayments, and loan closure.
-   Record daily, advance, and overdue collections and produce
    collection sheets and histories.
-   Manage savings accounts, recurring deposits (RD), fixed deposits
    (FD), withdrawals, and interest posting.
-   Record, review, approve, and report expenses.
-   Provide daily sheets, cashbook, and daybook based on posted
    financial transactions.
-   Support a Super Admin with multiple users, roles, permissions, and
    data scope.
-   Maintain an immutable audit trail for sensitive actions and
    financial postings.
-   Provide reliable search, filtering, exports, dashboards, and
    operational reports.

## 3. Non-goals for the first release

-   Public borrower mobile application.
-   Automated bank/payment-gateway integrations.
-   Credit-bureau integrations, e-signature, Aadhaar e-KYC, or automated
    identity verification.
-   General-purpose ERP, payroll, inventory, or tax filing.
-   AI-driven credit decisions or autonomous approval of financial
    transactions.
-   Multi-country localization in v1.

These can be considered later behind explicit requirements and
compliance review.

## 4. Users and access model

### 4.1 Roles

-   **Platform Super Admin:** manages tenant/organization provisioning
    and platform-level settings. Should not routinely operate customer
    financial records.
-   **Organization Admin:** manages organization settings, branches,
    staff, roles, products, accounting configuration, and reports.
-   **Branch Manager:** supervises a permitted branch, approves assigned
    transactions, reviews collections, and monitors performance.
-   **Loan Officer:** registers customers, creates applications,
    prepares loan documentation, and follows up on assigned accounts.
-   **Field Agent / Collector:** sees assigned groups/customers and
    records collections within permitted limits.
-   **Cashier:** receives and pays cash, manages cash sessions, and
    posts authorized receipts/payments.
-   **Accountant:** reviews ledger, daily sheet, cashbook, daybook,
    expenses, and reconciliation.
-   **Approver / Auditor:** read-only or approval-specific access,
    depending on assigned permissions.
-   **Read-only Analyst:** access to authorized reports only.

Roles are templates; actual access is permission-based and may be scoped
by organization, branch, group, or assigned accounts.

### 4.2 Permission principles

-   Deny by default; least privilege.
-   Enforce permissions on the server/API, not only in the UI.
-   Separate actions such as `read`, `create`, `update`, `submit`,
    `approve`, `post`, `reverse`, `close`, `export`, and `manage`.
-   Enforce scope checks for organization, branch, group, assigned
    agent, and record ownership.
-   A user must not approve their own transaction where maker-checker
    control is configured.
-   Platform Super Admin access must be explicit and audited.
-   Never hard-delete posted financial records. Use
    reversals/corrections with reason and audit history.

## 5. Functional modules

### 5.1 Organization, branches, users, and security

-   Organization profile, branches, business calendar, currency,
    timezone, fiscal year, receipt numbering, and financial settings.
-   User creation, invitation/reset, activation/suspension, role
    assignment, branch/group scope, and permission overrides.
-   Role/permission matrix with preview of effective permissions.
-   Session management, password policy, rate limiting, optional MFA,
    and login audit.
-   User changes and privileged actions recorded in audit log.

### 5.2 Loan Management

#### Loan Scheme

-   Configure scheme name/code, eligibility, minimum/maximum principal,
    term, repayment frequency, interest method/rate, fees, penalties,
    grace period, and permitted branches.
-   Support clearly defined calculation methods only; e.g. flat or
    reducing balance, with effective-date/version controls.
-   Preview repayment schedule before publishing a scheme.
-   Published schemes cannot be silently edited in a way that changes
    existing accounts. New versions apply to new loans unless an
    explicit migration process is approved.

#### Loan Application

-   Customer and group association, requested amount, scheme, term,
    purpose, income/eligibility data, required documents,
    guarantor/collateral fields if needed.
-   Draft → submitted → under review → approved/rejected/withdrawn
    states.
-   Capture reviewer decisions, conditions, rejection reasons, and
    timestamps.
-   Prevent disbursement before approval and required checks are
    complete.

#### Loan Disbursement

-   Disburse approved applications through a permitted payment method
    and source cash/bank account.
-   Validate approved amount, fees, borrower status, duplicate
    disbursement, and available funding/cash constraints.
-   Require authorization; support maker-checker approval based on
    configuration.
-   Posting creates accounting entries and a disbursement
    receipt/voucher.
-   Corrections use reversal transactions, not destructive edits.

#### Loan Account

-   Unique loan account number, borrower, scheme version, principal,
    rate/method, schedule, fees, balance, arrears, next due date,
    status, and transaction history.
-   Show principal, interest, fee, penalty, paid, overdue, and
    outstanding components separately.
-   Schedule generation and recalculation must be deterministic and
    covered by tests.
-   Any rescheduling, waiver, write-off, or restructuring must be
    permission-gated, reasoned, and audited.

#### Group

-   Create groups, assign members and field agents, manage
    meeting/collection day, group status, and group-level reporting.
-   A borrower may belong to multiple groups only if organization policy
    allows it.
-   Group membership changes must not rewrite historical collection
    attribution.

#### Loan Closing

-   Calculate settlement amount as of a specified date, including
    outstanding principal, accrued interest, authorized fees/penalties,
    and approved waivers.
-   Preview settlement before posting.
-   Post settlement and accounting entries; close the account only when
    balance rules pass.
-   Reopening requires elevated permission, reason, and audit event.

### 5.3 Collection

#### Daily Collection

-   Record repayment against one or multiple accounts, with payment
    date/time, amount allocation, payment method, collector, receipt
    number, and reference.
-   Allocation policy must be configurable and visible (e.g. penalty →
    fee → interest → principal); do not silently change allocation
    order.
-   Support offline-tolerant draft capture only if conflict handling and
    duplicate prevention are implemented; online-first is acceptable for
    v1.

#### Advance Collection

-   Record payments ahead of scheduled due dates.
-   Define whether advance amounts are held as unapplied credit or
    allocated to future installments; display the policy to staff.
-   Never treat an advance receipt as earned interest unless the
    accounting policy explicitly requires it.

#### Due Collection

-   Identify overdue installments and arrears by date, branch, group,
    agent, and aging bucket.
-   Support follow-up status, contact notes, promise-to-pay date, and
    next action.
-   Do not automatically impose penalties without a configured rule and
    authorized posting.

#### Collection Sheet

-   Generate daily agent/group collection sheets with opening due list,
    expected amount, collected amount, balance, receipt references, and
    totals.
-   Allow print/export with generation timestamp and filter criteria.
-   Submitted sheets can be reviewed and reconciled; changes after
    submission must be logged.

#### Collection History

-   Search by borrower, loan account, receipt, agent, group, date range,
    payment method, and status.
-   Show reversals, allocations, who recorded the receipt, and who
    posted/reconciled it.
-   Receipts must have unique identifiers and duplicate-submission
    protection.

### 5.4 Savings

-   Savings account opening, account status, deposit, withdrawal,
    balance, transaction history, and configured fees/limits.
-   Withdrawal rules may require available-balance checks,
    identity/authorization checks, and approval thresholds.
-   Every posted movement creates balanced ledger entries.
-   Distinguish savings from RD and FD products; do not mix their
    interest/maturity rules.

### 5.5 Deposits: RD and FD

#### Recurring Deposit (RD)

-   Configure installment amount, frequency, term, interest method/rate,
    due dates, grace/late rules, maturity date, and premature closure
    policy.
-   Track installments due/paid/missed and projected maturity value.
-   Interest calculation and rounding rules must be specified and tested
    before implementation.

#### Fixed Deposit (FD)

-   Configure principal, term, interest rate/method, payout frequency,
    maturity date, renewal instructions, and premature withdrawal rules.
-   Generate maturity and interest schedules.
-   Record maturity payout, renewal, or premature closure through
    approved transactions.

#### Withdrawal and Interest Posting

-   Apply to the correct account/product, validate balance and
    eligibility, require approval above configured thresholds, and
    create ledger entries.
-   Interest posting must be idempotent for a given account and accrual
    period.
-   Reversals must reference the original posting and preserve the audit
    trail.

### 5.6 Expenses

#### Loan-related expenses

-   Define whether this means expenses incurred for loan operations,
    borrower-borne charges, or costs capitalized against a loan. These
    are different accounting treatments and must be configured
    explicitly. \#### Add Expenses
-   Capture category, amount, date, branch, vendor/payee, payment
    method, receipt attachment, description, and submitter.
-   Draft → submitted → approved/rejected → paid/posted lifecycle. \####
    Approve Expenses
-   Approval thresholds, maker-checker separation, rejection reasons,
    and resubmission.
-   Approved expenses must not be editable without a controlled
    amendment/reversal. \#### Expense Report
-   Filter by period, branch, category, submitter, approver, status, and
    payment account.
-   Export totals and transaction-level detail with permission checks.

### 5.7 Accounting

#### Accounting foundation

-   Use a double-entry general ledger as the source of truth for posted
    financial events.
-   Maintain chart of accounts, journal entries, fiscal periods,
    cash/bank accounts, opening balances, and period locking.
-   Operational modules generate accounting events through a controlled
    posting service; users should not manually alter generated journal
    lines.
-   Every journal entry must balance (total debits = total credits) and
    reference its source transaction.

#### Daily Sheet

-   Daily summary of opening cash/bank balances, receipts, payments,
    transfers, and closing balances, with reconciliation status.
-   Define whether the sheet is per cashier, branch, or organization;
    support configured views.

#### Cashbook

-   Chronological cash/bank receipts and payments by account, with
    opening/closing balances and voucher/receipt references.
-   Cash balances must reconcile to posted ledger transactions.

#### Daybook

-   Chronological view of all posted accounting vouchers/journals for a
    selected period.
-   Include source module, voucher number, narration, debit/credit
    totals, posting user, and status.

## 6. Cross-cutting requirements

-   **Auditability:** append-only audit events for logins, permissions,
    approvals, postings, reversals, exports of sensitive data, and
    configuration changes.
-   **Idempotency:** financial write endpoints accept idempotency keys
    or enforce equivalent unique business constraints.
-   **Concurrency:** use database transactions and locking/version
    checks for balance-changing operations.
-   **Data integrity:** foreign keys, unique constraints, decimal money
    types, explicit timezone/date handling, and referential integrity.
-   **Privacy:** minimize personal data; encrypt transport; protect
    secrets; apply retention and access policies.
-   **Accessibility and usability:** responsive desktop-first staff UI,
    clear form validation, keyboard-friendly controls, printable
    receipts/sheets.
-   **Localization:** configurable currency, date format, language-ready
    UI, and timezone.
-   **Observability:** structured logs, error tracking, health checks,
    and auditable job failures.
-   **Backup and recovery:** scheduled backups, restore drills, and
    documented RPO/RTO targets.

## 7. Core workflows

1.  Configure organization, branches, users, roles, chart of accounts,
    and loan schemes.
2.  Register borrower and optionally assign a group/agent.
3.  Submit and review application; approve or reject with reason.
4.  Disburse approved loan; create loan account, repayment schedule,
    voucher, and receipt.
5.  Record collection; allocate payment; create receipt and balanced
    journal; update balances atomically.
6.  Manage overdue follow-ups and reconcile collection sheets.
7.  Open savings/RD/FD account; record deposits, withdrawals, interest,
    maturity, and closure.
8.  Submit expense; approve; pay/post; include in cashbook/daybook.
9.  Review daily sheet, cashbook, daybook, and reconciliation reports.
10. Close loan after settlement; preserve historical account and ledger
    data.

## 8. Data and calculation rules

-   Store money as `DECIMAL`, never binary floating point. Define
    currency precision and rounding policy centrally.
-   Store dates as database date/time types; define business timezone
    and effective date policy.
-   Version all loan/deposit scheme parameters used by an account.
-   Store repayment schedule snapshots and the formula/version used to
    calculate them.
-   Distinguish transaction date, posting date, and created timestamp.
-   Reversal entries reference the original transaction; never erase
    posted history.
-   Interest, penalties, fees, and allocation rules require business
    sign-off and test examples before production.

## 9. Reporting and dashboards

-   Portfolio outstanding, disbursed amount, collection rate, overdue
    amount, PAR/aging if relevant, applications pipeline, closures,
    savings/deposit balances, expenses, cash position, and daily
    reconciliation.
-   All reports must respect permission and scope filters.
-   Exported files should include filter metadata and be audit logged
    where sensitive.

## 10. Acceptance-level product outcomes

-   A user cannot access an unauthorized branch or customer by changing
    a URL or API payload.
-   A posted receipt/disbursement/withdrawal/expense creates correct,
    balanced accounting entries exactly once.
-   Failed financial posting rolls back all related balance and ledger
    changes.
-   Posted records cannot be deleted or silently edited.
-   Reports reconcile to posted ledger totals.
-   Interest and repayment calculations match approved example cases and
    boundary conditions.

## 11. Open decisions before production

1.  Flat, reducing-balance, or other interest methods; APR/disclosure
    conventions.
2.  Installment frequency, due-date behavior on holidays, grace periods,
    penalties, and payment allocation.
3.  Whether group lending, joint liability, guarantors, or collateral
    are in scope.
4.  Savings/RD/FD interest rules, maturity, premature withdrawal, and
    tax/withholding requirements.
5.  Cash/bank payment methods and reconciliation process.
6.  Approval thresholds and maker-checker requirements.
7.  Branches, tenant isolation, data residency, and backup targets.
8.  Applicable RBI, state, NBFC, cooperative, microfinance,
    deposit-taking, KYC/AML, privacy, and accounting obligations for the
    actual operating entity. Obtain qualified legal/compliance review;
    software configuration alone does not establish compliance.

## 12. Suggested release sequence

-   **Foundation:** tenant/organization, authentication, permissions,
    branches, audit, chart of accounts.
-   **Loan MVP:** schemes, customers/groups, application, approval,
    disbursement, loan account, collections, closure.
-   **Accounting controls:** posting service, ledger, cashbook, daybook,
    daily sheet, reconciliation.
-   **Savings/deposits:** savings, RD, FD, withdrawals, interest,
    maturity.
-   **Expenses and reporting:** expense approval, reports, exports,
    dashboards.
-   **Hardening:** security review, performance, backup/restore,
    migration, operational runbooks.
