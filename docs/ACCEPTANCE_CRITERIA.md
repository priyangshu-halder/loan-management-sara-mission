# Acceptance Criteria

These criteria define observable behavior for product owners,
developers, QA, and AI coding agents. Each item should become one or
more automated tests or documented UAT cases.

## 1. Authentication and access control

-   [ ] Unauthenticated users cannot access protected screens or APIs.
-   [ ] Suspended/deactivated users cannot create sessions or perform
    actions.
-   [ ] Password reset tokens expire and cannot be reused.
-   [ ] Permissions are checked server-side for every protected
    operation.
-   [ ] A user cannot read or mutate another organization's data by
    changing URL, query parameters, IDs, or request bodies.
-   [ ] Branch-, group-, and assignment-scoped users cannot access
    out-of-scope records.
-   [ ] Effective permissions can be reviewed by an authorized admin.
-   [ ] Permission and role changes are audit logged.
-   [ ] A maker cannot approve their own transaction when
    separation-of-duties policy applies.
-   [ ] Sensitive exports and privileged access are logged according to
    policy.

## 2. Loan schemes (Manually Configured Scheme System)

-   [x] Authorized users can create and configure a loan scheme using Scheme Code, Scheme Name, Loan Amount (Principal), Repayment Period (Months), Total Repayment Amount, and Terms & Conditions.
-   [x] Legacy fields (Interest Rate, Interest Calculation Method, Minimum/Maximum Principal, Grace Period, Initial Status) are retired from the UI and backend validation.
-   [x] Scheme validation rejects Total Repayment Amount < Loan Amount, zero/negative repayment duration, and non-numeric or negative amounts.
-   [x] Maker retains complete manual control over Total Repayment Amount without any automated interest formulas or predefined percentages.
-   [x] A schedule preview calculates `Monthly Installment = Total Repayment Amount / Repayment Period`, clearly labeled as an indicative schedule calculation and not an interest calculation.
-   [x] Rounding remainders for uneven installment divisions are distributed across installments using integer minor units, guaranteeing `sum(installments) === totalRepaymentAmount` exactly.
-   [x] Published scheme updates create new versions and never silently alter existing loan accounts or schedules.
-   [x] Historical loan schemes and existing loan records remain fully accessible and auditable.

### 2.1 Scenario Acceptance Tests

-   [x] **Scenario A (Standard):** Principal ₹50,000, 12 months, Total Repayment ₹54,000 $\rightarrow$ Monthly installment ₹4,500, sum equals ₹54,000.
-   [x] **Scenario B (Higher Repayment):** Principal ₹50,000, 12 months, Total Repayment ₹60,000 $\rightarrow$ Monthly installment ₹5,000, sum equals ₹60,000.
-   [x] **Scenario C (Uneven Division):** Principal ₹10,000, 3 months, Total Repayment ₹10,000 $\rightarrow$ Installments ₹3,333.33, ₹3,333.33, ₹3,333.34, sum equals ₹10,000.00 exactly.
-   [x] **Scenario D (Loan Creation & Modification Isolation):** Loan application snapshots scheme principal and total repayment. Subsequent scheme edits do not modify the existing loan or schedule.
-   [x] **Scenario E (Repayment & Balance Reduction):** For ₹50,000 principal / ₹54,000 total repayable, collecting ₹4,500 leaves ₹49,500 outstanding; collecting another ₹5,500 leaves ₹44,000 outstanding.
-   [x] **Scenario F (Historical Compatibility):** Pre-existing loans created under formula-based schemes continue to report, calculate, and collect without errors or schema conflicts.

## 3. Loan applications

-   [x] Authorized users can create and save an application selecting a loan scheme.
-   [x] Selecting a loan scheme automatically populates the principal amount, repayment period, and total repayment amount.
-   [x] The loan application stores a snapshot of the contractual total repayment amount.
-   [ ] An application cannot be submitted without required fields and configured documents.
-   [ ] Only permitted users can review, approve, reject, or withdraw an application.
-   [ ] Rejection requires a reason; decisions retain actor and timestamp.
-   [ ] Invalid state transitions are rejected server-side.
-   [ ] A disbursement cannot be created for an unapproved application.

## 4. Loan disbursement and accounts

-   [x] Disbursement validates approved amount, borrower status, payment source, and required approvals.
-   [x] Repeated submissions do not create duplicate disbursements or accounts (idempotent).
-   [x] Disbursement generates the repayment schedule derived directly from `totalRepaymentAmount` without separate interest formulas.
-   [x] Disbursement initializes `LoanAccount` snapshotting `principalDisbursed`, `totalRepaymentAmount`, `termMonths`, `totalPaid = 0.00`, and `principalOutstanding = totalRepaymentAmount`.
-   [x] Disbursement, loan account, schedule, receipt/voucher, and journal posting succeed or fail atomically.
-   [x] Every posted disbursement creates balanced accounting entries (Debit Loan Portfolio Asset, Credit Cash/Bank).
-   [x] Loan account view displays Disbursed Principal, Total Repayable, Total Collected, and Outstanding Balance.
-   [x] Account calculations match approved test fixtures.
-   [x] Posted disbursement cannot be silently edited or deleted.

## 5. Customer and group management

-   [ ] Every customer must have a valid group selected on creation (`/customers/new`) and editing (`/customers/[id]/edit`).
-   [ ] Creating or updating a customer without a group is rejected both client-side and server-side.
-   [ ] The selected group must exist in the caller's organization and fall within their permitted branch scope.
-   [ ] Authorized users can create groups and assign members and agents.
-   [ ] Membership and assignment changes preserve history.
-   [ ] Collection access follows current authorization scope without rewriting historical attribution.
-   [ ] Group reports use the requested business date and scope.

## 5.1 Customer documents and profile hygiene

-   [ ] Customer creation and edit forms support an optional Application Form document upload.
-   [ ] Accepted document formats: Images (JPG, PNG, WEBP), PDF, DOC, DOCX up to 10MB.
-   [ ] Client UI displays selected file name and size, providing replacement and removal controls before and after upload.
-   [ ] Unsupported file formats or oversized files (>10MB) are rejected with clear validation messages.
-   [ ] File binaries are stored securely outside the public web root; metadata is stored in `customer_documents`.
-   [ ] If customer creation fails, newly written storage files are automatically cleaned up to prevent orphaned files.
-   [ ] Authorized users can stream/download application form documents via authenticated endpoint `/api/customers/[id]/documents/application-form`; direct public URLs are forbidden.
-   [ ] Borrower bank account fields (`bankAccountHolderName`, `bankAccountNumber`, `bankIfscCode`, etc.) are completely removed from UI, validation schemas, export routines, and the database schema.
-   [ ] Form inputs, textareas, and dropdown menus render with solid visible backgrounds, high contrast text and placeholders, and clear focus indicators.

## 6. Collections

-   [ ] A collector can record a receipt only for assigned/permitted
    accounts.
-   [ ] A receipt has a unique number and captures business date, actor,
    payment method, amount, and reference.
-   [ ] Allocation across penalty, fee, interest, and principal follows
    the configured, visible policy.
-   [ ] Advance collection follows the approved
    unapplied-credit/future-installment policy.
-   [ ] Overdue lists are calculated from schedule and posted payments
    using approved business-date rules.
-   [ ] Collection sheets can be filtered by date, branch, group, and
    agent.
-   [ ] Sheet totals reconcile to included receipts and outstanding
    collection amounts.
-   [ ] Collection history shows allocations, reversals, posting status,
    and actor metadata.
-   [ ] Duplicate requests cannot record the same receipt twice.
-   [ ] Receipt reversal requires permission, reason, and a linked
    compensating accounting entry.
-   [ ] Failed posting leaves no partial receipt, balance change, or
    journal entry.

## 7. Savings

-   [ ] Authorized users can open and manage savings accounts.
-   [ ] Deposits and withdrawals validate account status and configured
    limits.
-   [ ] Withdrawals cannot exceed available funds unless an explicitly
    approved overdraft feature exists.
-   [ ] Every posted movement has balanced accounting entries.
-   [ ] Duplicate submissions do not duplicate balances or ledger
    entries.
-   [ ] Account history preserves all posted movements and reversals.

## 8. RD and FD

-   [ ] RD tracks scheduled installments, paid/missed status, and
    maturity projection.
-   [ ] FD records principal, term, rate/method, maturity date,
    payout/renewal instructions, and status.
-   [ ] Interest/maturity calculations match signed-off fixtures,
    including rounding and date boundaries.
-   [ ] Interest posting is idempotent per account and accrual period.
-   [ ] Maturity payout, renewal, and premature closure enforce
    configured product rules and permissions.
-   [ ] Withdrawal and interest reversal preserve links to original
    postings.
-   [ ] Product-rule changes do not silently rewrite existing accounts.

## 9. Expenses

-   [ ] A permitted user can create and submit an expense with category,
    amount, date, branch, payee, payment method, description, and
    supporting attachment where required.
-   [ ] Expenses follow configured
    draft/submitted/approved/rejected/paid/posted states.
-   [ ] Unapproved expenses cannot be paid or posted.
-   [ ] Approval records actor, time, decision, and reason where
    applicable.
-   [ ] Posted expense changes use controlled correction/reversal
    workflows.
-   [ ] Expense reports filter correctly and reconcile to posted ledger
    entries.
-   [ ] Export permissions are enforced and sensitive exports are
    auditable.

## 10. Accounting and reconciliation

-   [ ] Journal entries cannot be posted unless debit and credit totals
    balance.
-   [ ] Every journal entry references a source transaction or approved
    manual journal.
-   [ ] Financial transaction and journal posting are atomic.
-   [x] Cashbook opening + receipts − payments equals closing balance for each selected account/period, accounting for transfers and reversals correctly.
-   [x] Cashbook displays as a clean, date-wise financial table only, with one row per calendar/business date in ascending chronological order (no summary cards, charts, graphs, or individual transaction cards).
-   [x] Default starting date resolves to earliest available cashbook date; default ending date resolves to today's business date; custom date range selection is supported.
-   [x] Every business date within selected range is included, displaying 0.00 or — for empty days without omitting dates, while continuously carrying forward Opening and Cash in Hand.
-   [x] Cashbook table renders exactly 17 columns in strict order: Date, Opening, Advance, Repayment, RD, FD, Bank Transfer (Received), Loan, Miscellaneous (Received), Total Received, Savings Withdrawal, Bank Transfer (Payment), Loan Payment, Expenses, Miscellaneous (Payment), Total Payment, Cash in Hand.
-   [x] Total Received strictly excludes Opening; Total Payment is the exact sum of the 5 payment categories; Cash in Hand = Opening + Total Received - Total Payment.
-   [x] Internal bank transfers are correctly classified (cash-to-bank reduces physical cash, bank-to-cash increases physical cash, bank-to-bank does not affect physical cash) without inflating income or expenses.
-   [x] Sticky bottom summary row correctly displays category column totals, period initial opening, and final cash in hand (never sums daily openings or cash in hand).
-   [x] Negative Cash in Hand is clearly highlighted as a warning on affected rows without zeroing or masking the deficit.
-   [x] Reconciles 100% with Daily Sheet, Daybook, and underlying double-entry ledger.
-   [x] Daybook acts as a complete daily transaction register displaying all accounting transactions (loans, collections, deposits, withdrawals, transfers, expenses, adjustments, reversals) across all operational modules.
-   [x] Daybook records are organized date-wise with distinct date headings and transaction counts, excluding empty dates without transactions.
-   [x] Displays 10-column table per date: Voucher No., Transaction Date, Source Module, Transaction Type, Reference, Description, Debit, Credit, Status, Action.
-   [x] Complete double-entry accounting breakdown is viewable inline and in detail modals, proving total debits equal total credits for every voucher.
-   [x] Daily totals reconcile: Number of vouchers, Daily Total Debit, and Daily Total Credit (Dr = Cr).
-   [x] Overall period totals reconcile at the bottom of the page across all filtered vouchers.
-   [x] Comprehensive filters supported: date range, voucher number, source module, transaction type, customer/member/reference search, GL account, and status.
-   [x] Reversals preserve links to original vouchers and maintain historical immutability.
-   [x] Daybook, Cashbook, and Daily Sheet have clearly separated responsibilities and reconcile 100% against the authoritative ledger without duplicate postings.
-   [x] Daily sheet displays 3 main sections: Received (9 categories), Payment (6 categories), and Daily Cash Summary with prominent CASH IN HAND.
-   [x] Closing cash is calculated as: Closing Cash = Opening Cash + Cash Received - Cash Payment.
-   [x] Previous day's finalized closing cash automatically carries forward as the next day's opening cash.
-   [x] Authorized users can establish initial baseline opening balance for the first day of operation.
-   [x] Backdated transactions after finalization trigger an auditable discrepancy notice without silently overwriting historical snapshots.
-   [x] Internal bank transfers are accounted for without creating artificial income, expense, or double counting.
-   [x] Negative cash in hand balances are clearly highlighted as discrepancies and never silently converted to zero.
-   [x] Test A (Basic Reconciliation): Reconciles Opening (₹10,000), Advance (₹2,000), Repayment (₹5,000), RD (₹1,000), FD (₹2,000), Misc (₹500), Savings Withdrawal (₹1,500), Expenses (₹1,000) to Total Received (₹10,500), Total Payment (₹2,500), and Closing Cash (₹18,000).
-   [x] Test B (Next-day Carry Forward): Day 1 closing (₹18,000) automatically carries forward to Day 2 opening, reconciling with Day 2 receipts (₹4,000) and payments (₹2,000) to Closing Cash (₹20,000).
-   [x] Test C (Idle Day): Accurately maintains Opening (₹5,000) to Closing (₹5,000) with zero receipts and payments.
-   [x] Test D (Negative Balance): Opening (₹1,000) + Receipts (₹500) - Payments (₹2,000) produces Closing Cash of -₹500 with prominent discrepancy warning.
-   [x] Test E (Bank Transfers): Verifies cash-to-bank and bank-to-cash internal transfers correctly adjust cash-in-hand without inflating revenue or expenses.
-   [x] Test F (Transaction Integrity): Reversals and cancelled transactions correctly negate without inflating category sums or double counting.
-   [x] Closed accounting periods reject ordinary backdated postings; reopening requires elevated permission and audit.
-   [ ] Reconciliation exceptions are visible and cannot be silently
    dismissed.
-   [ ] Operational balances reconcile to ledger balances and can be
    traced to source transactions.

## 11. Loan closure

-   [ ] Settlement quote displays its as-of date and components.
-   [ ] Settlement quote reflects approved outstanding principal,
    accrued interest, fees, penalties, and authorized waivers.
-   [ ] Loan closure cannot post while a disallowed residual balance
    remains.
-   [ ] Closure receipt/voucher and journal are created exactly once.
-   [ ] Closed accounts retain read-only historical schedules and
    transactions.
-   [ ] Reopening or correcting closure requires elevated permission,
    reason, and audit event.

## 12. Audit and records

-   [ ] Audit events include actor, organization, action, entity,
    timestamp, and relevant before/after metadata without storing
    secrets.
-   [ ] Audit events for financial actions cannot be changed through
    ordinary application operations.
-   [ ] Reversals preserve the original transaction and link both
    records.
-   [ ] Record retention and export rules are configurable/documented.
-   [ ] File downloads require authorization and do not expose public
    storage paths.

## 13. Usability and reporting

-   [ ] All lists have pagination and useful search/filtering.
-   [ ] Forms display field-level validation and preserve safe draft
    input after validation errors.
-   [ ] Screens have loading, empty, error, and permission-denied
    states.
-   [ ] Critical actions show a clear confirmation and amount breakdown.
-   [ ] Printed receipts and collection sheets are legible and include
    unique references.
-   [ ] Reports respect organization, branch, group, and account scope.
-   [ ] Export results reflect selected filters and include generation
    time and filter metadata.

## 14. Reliability and security

-   [ ] Financial operations use transactions, idempotency, and
    concurrency control.
-   [ ] A forced failure at each step of a multi-write posting leaves no
    partial committed state.
-   [ ] Money calculations avoid binary floating point.
-   [ ] Authentication endpoints are rate limited and secrets are not
    logged.
-   [ ] File uploads enforce size/type limits and are stored outside
    public web roots.
-   [ ] Automated backups run and a restore drill is documented and
    demonstrated.
-   [ ] CI runs lint, typecheck, unit tests, integration tests, and
    migration validation.
-   [ ] No unresolved critical/high security findings remain at launch.

## 15. Operational acceptance / UAT

-   [ ] A branch manager can complete a sample loan from application
    through disbursement, collections, and closure.
-   [ ] A collector can submit a collection sheet and reconcile it
    against receipts.
-   [ ] An accountant can trace a disbursement, collection, withdrawal,
    and expense from source record to journal, cashbook, and daybook.
-   [ ] An organization admin can create a user with limited permissions
    and verify that prohibited actions are denied.
-   [ ] A failed/duplicated network submission does not create duplicate
    money movement.
-   [ ] Business owner/accounting reviewer signs off on all calculation
    fixtures.
-   [ ] Compliance review is completed for the actual legal entity,
    products, customer data, and jurisdiction before live use.
