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

#### Loan Scheme (Manually Configured Scheme Model)

-   Configure scheme code, scheme name, loan amount (principal), repayment period
    (months), total repayment amount, and terms & conditions.
-   **Maker Manual Control:** The maker explicitly defines the principal, repayment
    period, and total repayment amount. The system does not calculate total repayment
    using an interest rate, interest formula, predefined percentage, or financial rule.
-   **Validation Rules:**
    -   Total Repayment Amount must be greater than or equal to Loan Amount.
    -   Repayment period must be a positive integer in months.
    -   Amounts must be positive and follow exact financial decimal precision.
    -   Old formula-based parameters (interest rate, interest calculation method,
        min/max principal ranges, grace period, initial status) are retired from the
        scheme creation interface.
-   **Installment Schedule Preview:**
    -   Indicative Monthly Installment is calculated as:
        `Monthly Installment = Total Repayment Amount / Repayment Period`.
    -   Clearly labeled as an indicative schedule breakdown, not an interest calculation.
    -   For amounts not divisible evenly, rounding remainders are distributed across
        installments using integer minor units (paisa/cent) ensuring the exact sum of
        installments equals the total contractual repayment amount.
-   **Immutability and Versioning:**
    -   Published schemes cannot be silently edited. Updates create a new scheme version.
    -   Loans snapshot the scheme's principal, repayment period, and total repayment
        obligation upon creation and disbursement.
    -   Subsequent changes to a scheme do not alter active or historical loan accounts.
    -   Historical loans created under the legacy formula system remain completely
        intact, readable, and auditable.

#### Loan Application

-   Customer and group association, scheme selection (auto-populating principal,
    repayment period, and total repayment amount), purpose, and documentation.
-   The loan application snapshots `totalRepaymentAmount` alongside requested principal.
-   Draft → submitted → under review → approved/rejected/withdrawn states.
-   Capture reviewer decisions, conditions, rejection reasons, and timestamps.
-   Prevent disbursement before approval and required checks are complete.

#### Loan Disbursement

-   Disburse approved applications through a permitted payment method and source
    cash/bank account.
-   Validate approved amount, borrower status, duplicate disbursement, and funding constraints.
-   Require authorization; support maker-checker approval based on configuration.
-   Generates repayment schedule derived directly from `totalRepaymentAmount` and term
    in months without separate interest calculations.
-   Posting creates balanced double-entry accounting entries (debiting Loan Portfolio
    Asset and crediting Cash/Bank Liquidity for the disbursed principal) and a disbursement
    receipt/voucher.
-   Initializes loan account tracking: `principalDisbursed = Loan Amount`,
    `totalRepaymentAmount = Contractual Total`, `totalPaid = 0.00`, and
    `principalOutstanding = Total Repayment Amount`.
-   Corrections use reversal transactions, not destructive edits.

#### Loan Account

-   Unique loan account number, borrower, scheme version snapshot, principal disbursed,
    term in months, total contractual repayment obligation, total paid, and remaining
    outstanding balance.
-   Collections directly reduce the remaining contractual outstanding balance:
    `Outstanding = Total Repayment Amount - Total Collected`.
-   Schedule generation is deterministic and guaranteed to sum to `totalRepaymentAmount`.
-   Any rescheduling, waiver, write-off, or restructuring must be permission-gated,
    reasoned, and audited.

#### Customer & Group Membership

-   **Mandatory Group Policy:** Every customer must belong to an active
    primary Center / Group (`groupId` is required and enforced server-side).
    Individual borrowers without a group are not allowed.
-   Create groups, assign members and field agents, manage
    meeting/collection day, group status, and group-level reporting.
-   A borrower may belong to multiple groups through secondary affiliations
    (`CustomerGroup`), but primary group assignment is mandatory on registration
    and maintained throughout editing.
-   Group membership changes must not rewrite historical collection
    attribution.
-   **Customer Onboarding Documents:**
    -   Optional Application Form upload during customer registration
        and editing.
    -   Supported formats: Images (JPG, PNG, WEBP), PDF, DOC, and DOCX (up to 10MB).
    -   Physical files are stored outside the public web root using a secure
        storage provider abstraction; metadata and references are stored in
        `customer_documents`.
    -   Access and download require authentication and `customer.kyc.view`
        or `customer.detail.view` permission via an authorized streaming route.
    -   Private document URLs are never publicly exposed.
-   **Removal of Borrower Bank Account Fields:**
    -   Customer KYC/profile no longer collects borrower bank account numbers
        or IFSC codes.
    -   Organizational cash/bank accounts used for funding and disbursement
        remain fully operational under ledger `CashAccount`.

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

#### Daily Sheet (Redesigned Daily Cash Reconciliation Statement)

-   **Route:** `/accounting?tab=daily-sheet`
-   **Sections Structure:**
    -   **Received Section:**
        1. Opening (previous day's finalized closing cash carried forward)
        2. Advance (unapplied borrower advance collections)
        3. Repayment (regular loan principal, interest, fee, and penalty repayments)
        4. RD (recurring deposit opening and installment receipts)
        5. FD (fixed deposit opening receipts)
        6. Bank Transfer (money transferred into cash account from bank/other sources)
        7. Loan (loan closure settlements and recoveries)
        8. Miscellaneous (savings deposits, capital injections, and other valid receipts)
        9. Total Received (sum of categories 2 through 8; excludes Opening)
    -   **Payment Section:**
        1. Savings Withdrawal (member savings withdrawals)
        2. Bank Transfer (cash deposited into bank / transferred to other accounts)
        3. Loan Payment (disbursed loan principals)
        4. Expenses (posted operational expense payments)
        5. Miscellaneous (deposit payouts and manual payment adjustments)
        6. Total Payment (sum of payment categories)
    -   **Daily Cash Summary & Cash In Hand:**
        -   $\text{Closing Cash} = \text{Opening Cash} + \text{Total Cash Received} - \text{Total Cash Payment}$
        -   Prominently displays **CASH IN HAND** with readable calculation formula.
        -   Negative closing balances are highlighted as cash discrepancies; never silently converted to zero.
-   **Carry-Forward & Finalization Engine:**
    -   Previous day's finalized closing cash automatically carries forward as next day's opening cash.
    -   Authorized users can establish initial baseline opening balance for the first operating day.
    -   Finalizing locks the daily snapshot (`DailyCashRecord`), preserving historical audit records.
    -   Backdated transactions after finalization trigger an auditable discrepancy notice and re-reconciliation flow.
-   **Internal Bank Transfer Treatment:**
    -   Cash-to-bank reduces physical cash in hand; bank-to-cash increases physical cash in hand.
    -   Internal transfers between organizational asset accounts do not create artificial income or expenses.
    -   Consolidated cash reconciles 100% across Daybook, Cashbook, and Daily Sheet.

#### Cashbook

-   **Date-Wise Financial Table Interface:**
    -   Clean, table-only presentation with one row per calendar/business date in ascending chronological order (oldest first).
    -   No summary cards, charts, graphs, or individual transaction cards.
    -   Date range selection with default starting date set to earliest available cashbook date and default ending date set to today.
    -   Displays every date in the range, including dates with no transactions (`0.00` or `—` for categories; continuous opening and closing carry-forward).
-   **17-Column Structure in Exact Order:**
    1. `Date`
    2. `Opening`
    3. `Advance`
    4. `Repayment`
    5. `RD`
    6. `FD`
    7. `Bank Transfer (Received)`
    8. `Loan`
    9. `Miscellaneous (Received)`
    10. `Total Received` (Sum of 7 receipt categories, excluding Opening)
    11. `Savings Withdrawal`
    12. `Bank Transfer (Payment)`
    13. `Loan Payment`
    14. `Expenses`
    15. `Miscellaneous (Payment)`
    16. `Total Payment` (Sum of 5 payment categories)
    17. `Cash in Hand` (`Opening + Total Received - Total Payment`)
-   **Continuous Mathematical Carry-Forward:**
    -   Next day's Opening equals previous day's Cash in Hand across all dates.
    -   Opening is strictly excluded from Total Received.
-   **Internal Bank Transfer Treatment:**
    -   Cash to bank reduces physical cash (`Bank Transfer Payment`); bank to cash increases physical cash (`Bank Transfer Received`).
    -   Bank-to-bank transfers do not affect physical cash in hand.
    -   Internal transfers do not create artificial income or expense.
-   **Summary Row & Negative Alert:**
    -   Sticky bottom summary row aggregates each category column, total received, total payment, initial period opening, and final cash in hand (does not sum daily openings/closings).
    -   Negative Cash in Hand rows and alerts are highlighted without masking or zeroing deficits.
    -   Reconciles 100% with Daily Sheet and Daybook.

#### Daybook

-   **Complete Daily Transaction Register:**
    -   Acts as the complete chronological record of all financial transactions across all modules (loans, collections, savings, RD, FD, bank transfers, expenses, adjustments, journals, reversals).
    -   Includes all posted accounting transactions without restricting to physical cash (includes bank and non-cash journal postings).
-   **Date-Wise Organisation:**
    -   Records are grouped date-wise with clear daily headings and transaction counts.
    -   Excludes empty dates where no transactions occurred (unlike Cashbook).
    -   Organised in chronological order (ascending business date and voucher sequence).
-   **10-Column Transaction Table & Detailed Journal Entries:**
    -   Columns: `Voucher No.`, `Transaction Date`, `Source Module`, `Transaction Type`, `Reference`, `Description`, `Debit (₹)`, `Credit (₹)`, `Status`, `Action`.
    -   Complete accounting journal breakdown available inline and via dedicated detail modal (displays every individual debit and credit ledger line with GL code, name, narration, and amount).
    -   Strict invariant: Total Debits equal Total Credits for every voucher.
-   **Daily Totals & Reconciliation:**
    -   End of each day shows: number of vouchers, daily total debit, and daily total credit.
    -   Daily debit and credit totals must strictly reconcile ($Dr \equiv Cr$).
    -   Bottom of selected range displays cumulative period totals and verified reconciliation badge.
-   **Search & Multi-Dimensional Filtering:**
    -   Filter by date range (`startDate`, `endDate`), voucher number, source module, transaction type, customer/member/narration search, GL account, and status (POSTED, REVERSED, ALL).
-   **Clear Separation of Responsibilities:**
    -   **Daybook:** Every individual accounting transaction, date-wise, with complete debit/credit details.
    -   **Cashbook:** Date-wise table with receipt/payment categories, totals, opening and closing cash.
    -   **Daily Sheet:** Daily cash reconciliation summary showing received amounts, payments, and cash in hand.
    -   All three reconcile 100% against the same double-entry ledger without duplicate postings.

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
