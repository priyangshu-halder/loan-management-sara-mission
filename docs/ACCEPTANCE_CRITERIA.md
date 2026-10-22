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

## 2. Loan schemes

-   [ ] Authorized users can create and configure a loan scheme.
-   [ ] Scheme validation rejects invalid amounts, terms, rates,
    frequencies, and incompatible settings.
-   [ ] A schedule preview is available before a scheme is published.
-   [ ] Published scheme changes are versioned and do not silently alter
    existing accounts.
-   [ ] Each loan account records the exact scheme version used.

## 3. Loan applications

-   [ ] Authorized users can create and save a draft application.
-   [ ] An application cannot be submitted without required fields and
    configured documents.
-   [ ] Only permitted users can review, approve, reject, or withdraw an
    application.
-   [ ] Rejection requires a reason; decisions retain actor and
    timestamp.
-   [ ] Invalid state transitions are rejected server-side.
-   [ ] A disbursement cannot be created for an unapproved application.

## 4. Loan disbursement and accounts

-   [ ] Disbursement validates approved amount, borrower status, payment
    source, and required approvals.
-   [ ] Repeated submissions do not create duplicate disbursements or
    accounts.
-   [ ] Disbursement, loan account, schedule, receipt/voucher, and
    journal posting succeed or fail atomically.
-   [ ] Every posted disbursement creates balanced accounting entries.
-   [ ] Loan account view shows principal, interest, fees, penalties,
    paid amount, outstanding amount, arrears, next due date, and
    transaction history.
-   [ ] Account calculations match approved test fixtures.
-   [ ] Posted disbursement cannot be silently edited or deleted.

## 5. Group management

-   [ ] Authorized users can create groups and assign members and
    agents.
-   [ ] Membership and assignment changes preserve history.
-   [ ] Collection access follows current authorization scope without
    rewriting historical attribution.
-   [ ] Group reports use the requested business date and scope.

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
-   [ ] Cashbook opening + receipts − payments equals closing balance
    for each selected account/period, accounting for transfers and
    reversals correctly.
-   [ ] Daybook lists posted vouchers/journals in the selected period
    with correct debit/credit totals.
-   [ ] Daily sheet opening, receipts, payments, and closing totals
    reconcile to posted transactions.
-   [ ] Closed accounting periods reject ordinary backdated postings;
    reopening requires elevated permission and audit.
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
