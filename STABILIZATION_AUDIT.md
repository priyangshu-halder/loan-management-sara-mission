# System Stabilization & Financial Integrity Audit Report

**Audit Date:** 2026-10-23  
**Audit Scope:** Full repository code audit, database schema & migrations, concurrency & financial invariants, double-entry general ledger reconciliation, API contracts, and staff UI workflows.  
**Target Platform:** Rayhan Financial Management System (Next.js 14.2 App Router, TypeScript 5.6 strict, MySQL 8.0, Prisma ORM 5.22).

---

## 1. Executive Summary

A comprehensive, zero-assumption audit of the complete codebase was conducted across all 10 architectural phases. While the platform demonstrates an impressive architecture (strict TypeScript types, 123 passing Vitest tests, balanced double-entry ledger foundations, and Next.js production compilation), our deep financial integrity and code-level inspection revealed **critical concurrency race conditions, database migration gaps, accounting double-deductions, broken navigation paths resulting in 404 errors, and schedule engine oversights**.

All findings below distinguish confirmed defects (with source code line citations and reproduction steps) from suspected architectural risks.

---

## 2. Prioritized Audit Findings

### Category A: Concurrency, Financial Integrity & Accounting (Critical & High)

---

#### Issue `CONC-01`: Time-of-Check to Time-of-Use (TOCTOU) Race Condition in Savings Operations
- **Module:** Savings (`src/modules/savings/savings-service.ts`)
- **Severity:** **CRITICAL**
- **Affected Files:** `src/modules/savings/savings-service.ts` (lines 308–326 and 160–171)
- **Reproduction Steps:**
  1. Open a savings account with a balance of ₹1,000 and minBalance of ₹0.
  2. Dispatch two simultaneous withdrawal requests of ₹600 with different transaction references.
- **Expected Behavior:**
  The first withdrawal succeeds (balance becomes ₹400). The second withdrawal fails with `ValidationError("Withdrawal amount exceeds available savings balance")`.
- **Actual Behavior:**
  Both requests read `account.balance` (₹1,000) outside the transaction. Both calculate `balanceAfter = 400`. Both enter `prisma.$transaction` in parallel and execute `tx.savingsAccount.update({ data: { balance: "400.0000" } })`. The borrower withdraws ₹1,200 from a ₹1,000 account, resulting in an unauthorized ₹200 overdraft and lost bank funds. The same defect occurs in `depositToSavingsAccount` where concurrent deposits overwrite each other's additions.
- **Root Cause:**
  Balance validation and `balanceAfter` computation are performed on stale in-memory data prior to opening the database transaction. The update uses an absolute assignment rather than an atomic decrement/increment or row-level lock (`SELECT ... FOR UPDATE` inside `tx`).
- **Proposed Fix:**
  Refetch and lock the `savingsAccount` row inside the interactive transaction, or perform an atomic conditional decrement:
  `UPDATE savings_accounts SET balance = balance - :amount WHERE id = :id AND (balance - min_balance) >= :amount`.
- **Regression Test:** Add concurrent withdrawal/deposit test in `src/modules/savings/savings-service.test.ts`.

---

#### Issue `CONC-02`: Concurrency Race Condition in Loan Collection Repayments
- **Module:** Collections (`src/modules/collections/collection-receipt-service.ts`)
- **Severity:** **CRITICAL**
- **Affected Files:** `src/modules/collections/collection-receipt-service.ts` (lines 114, 245–263)
- **Reproduction Steps:**
  1. Have an active loan account with principal outstanding of ₹20,000.
  2. Post two collection receipts of ₹3,000 concurrently.
- **Expected Behavior:**
  Both receipts post sequentially; total principal outstanding becomes ₹14,000.
- **Actual Behavior:**
  Both requests read `outstanding = new Decimal(loanAccount.principalOutstanding)` (₹20,000) outside `tx`. Both compute `newOutstanding = Decimal.max(0, 20000 - 3000) = 17000`. Both write `principalOutstanding: "17000.0000"`. ₹6,000 in cash was collected, but the borrower's principal balance was only reduced by ₹3,000.
- **Root Cause:**
  `loanAccount` is queried before the transaction; the calculation `newOutstanding` is computed using pre-transaction state, and the update does an absolute write rather than recalculating inside the transaction under a lock.
- **Proposed Fix:**
  Refetch and lock `loanAccount` inside `tx`, re-evaluating outstanding principal and unpaid installments inside the transaction boundary.
- **Regression Test:** Concurrent collection test in `src/modules/collections/collection-receipt-service.test.ts`.

---

#### Issue `FIN-01`: Inconsistent Monetary Storage Types (`VARCHAR` vs `DECIMAL`) and Heap Exhaustion Risk
- **Module:** Schema & Database (`prisma/schema.prisma`) & Reports (`src/modules/reports/report-service.ts`)
- **Severity:** **HIGH**
- **Affected Files:** `prisma/schema.prisma` (lines 409, 410, 466, 527, 549, 604, 688, 885) and `src/modules/reports/report-service.ts` (lines 355–385)
- **Reproduction Steps:**
  Inspect `prisma/schema.prisma`. Notice `RepaymentInstallment`, `JournalLine`, and `CashAccount` use `Decimal @db.Decimal(19, 4)`, but `LoanAccount` (`principalDisbursed`, `principalOutstanding`), `CollectionReceipt` (`amount`), `SavingsAccount` (`balance`), `TermDepositAccount` (`principal`), and `Expense` (`amount`) use `String @db.VarChar(32)`.
- **Expected Behavior:**
  All monetary fields are stored as MySQL `DECIMAL(19, 4)` as mandated by `AGENTS.md`. Database queries utilize native SQL aggregation `_sum`.
- **Actual Behavior:**
  Prisma cannot perform numeric aggregations (`_sum`, `_avg`) on `String` columns. To compute dashboard totals, `report-service.ts` executes `prisma.loanAccount.findMany()` and `prisma.savingsAccount.findMany()` with no `limit` or `take`, loading every record into Node.js heap memory to sum via `Decimal.js`. In production with 50,000 accounts, this creates a severe Out-Of-Memory (OOM) denial-of-service crash risk.
- **Proposed Fix:**
  Migrate `VARCHAR(32)` financial columns to MySQL `DECIMAL(19, 4)` and refactor reporting queries to use database-level aggregations (`_sum`).
- **Regression Test:** Add schema validation test and memory/aggregate test in `report-service.test.ts`.

---

#### Issue `FIN-02`: Duplicate Cash Balance Decrement and Lost Updates in Expense Payments & Reversals
- **Module:** Expenses (`src/modules/expenses/expense-service.ts`)
- **Severity:** **HIGH**
- **Affected Files:** `src/modules/expenses/expense-service.ts` (lines 472–478 and 572–578)
- **Reproduction Steps:**
  1. Post an approved expense payment of ₹500 from a Cash Account.
  2. Inspect the balance updates.
- **Expected Behavior:**
  `postJournalEntry` atomically adjusts `chartOfAccount.balance` and `cashAccount.balance` by `-₹500` via its internal delta posting.
- **Actual Behavior:**
  `postJournalEntry` runs and automatically decrements `cashAccount.balance`. Immediately following `postJournalEntry`, `expense-service.ts` runs a second manual update:
  `const newCashBalance = new Decimal(cashAccount.balance).minus(amount);`
  `await tx.cashAccount.update({ where: { id: payload.cashAccountId }, data: { balance: newCashBalance } });`
  Furthermore, because `cashAccount.balance` was read before `postJournalEntry`, this absolute write overwrites any concurrent transactions that occurred on that cash drawer. If `CASH-PETTY-01` and `CASH-VAULT-01` share GL 1001, `postJournalEntry` decrements `CASH-VAULT-01` while `expense-service` decrements `CASH-PETTY-01`, causing a double deduction across two different accounts!
- **Root Cause:**
  Duplicate responsibilities: both the posting engine and the domain service attempt to update cash account balances.
- **Proposed Fix:**
  Remove the redundant manual `tx.cashAccount.update()` calls from `expense-service.ts` and pass `cashAccountId` directly into `PostJournalCommand` to ensure the exact cash drawer is credited/debited once.
- **Regression Test:** Expense balance reconciliation test in `src/modules/expenses/expense-service.test.ts`.

---

#### Issue `FIN-03`: Date Skew and Transaction Omission in Cashbook and Daily Sheet
- **Module:** Accounting (`src/modules/accounting/ledger-service.ts`)
- **Severity:** **HIGH**
- **Affected Files:** `src/modules/accounting/ledger-service.ts` (lines 139 and 267)
- **Reproduction Steps:**
  1. Post a journal entry with `businessDate = "2026-10-22"` but physical wall-clock `postingDate = "2026-10-23 01:00:00"`.
  2. Request the cashbook or daily sheet for `businessDate = "2026-10-23"`.
- **Expected Behavior:**
  Opening balance on `2026-10-23` includes all activity where `businessDate < "2026-10-23"`.
- **Actual Behavior:**
  Opening balance query checks `postingDate: { lt: "2026-10-23T00:00:00Z" }`. Because the entry was physically written at 01:00 UTC on the 23rd, it is excluded from opening balance. Then, period activity queries `businessDate: "2026-10-23"`. Because the entry has `businessDate = "2026-10-22"`, it is also excluded from period activity. The transaction completely vanishes from the cashbook and daily sheet, breaking reconciliation.
- **Root Cause:**
  Mixing physical wall-clock timestamp (`postingDate`) with financial calendar date (`businessDate`) in opening balance calculations.
- **Proposed Fix:**
  Compute opening balances strictly using `businessDate: { lt: filter.startDate }`.
- **Regression Test:** Backdated posting cashbook test in `src/modules/accounting/posting-service.test.ts`.

---

#### Issue `FIN-04`: Orphan Liability and Double Expense Posting on Premature Deposit Closure
- **Module:** Term Deposits (`src/modules/term-deposits/term-deposit-service.ts`)
- **Severity:** **MEDIUM**
- **Affected Files:** `src/modules/term-deposits/term-deposit-service.ts` (lines 944–998)
- **Reproduction Steps:**
  1. Open a 1-year FD with monthly interest accrual.
  2. Post periodic interest for Month 1 and Month 2 via `postTermDepositInterest()` (debits Interest Expense 5004, credits Deposit Liability 2003).
  3. In Month 3, execute `prematureCloseTermDeposit()`.
- **Expected Behavior:**
  Previous interest accruals are reversed/adjusted, penal prorated interest is finalized, and deposit liability is completely cleared to ₹0.
- **Actual Behavior:**
  `prematureCloseTermDeposit` debits deposit liability by the original principal only (`debit: principal`), leaving the previous periodic interest credits sitting in liability account 2003. It also debits Interest Expense (5004) for `proratedInterest` without reversing previous periodic expense debits, double-charging interest on the P&L.
- **Root Cause:**
  Premature closure does not query or reverse prior `depositInterestPosting` records associated with the account.
- **Proposed Fix:**
  Query posted interest accruals for the account; generate reversing lines or adjust liability debit to `currentBalance + proratedInterest - priorAccruals`.
- **Regression Test:** Term deposit premature closure with prior accruals test in `term-deposit-service.test.ts`.

---

### Category B: Financial Calculations & Engines (Medium)

---

#### Issue `CALC-01`: Loan Schedule Calculator Silently Ignores Weekly and Quarterly Frequencies
- **Module:** Loans (`src/modules/loans/loan-schedule-engine.ts`)
- **Severity:** **HIGH**
- **Affected Files:** `src/modules/loans/loan-schedule-engine.ts` (lines 9, 86, 144)
- **Reproduction Steps:**
  1. Call `calculateRepaymentSchedule({ principal: 10000, annualRate: 12, termMonths: 6, repaymentFrequency: "WEEKLY", disbursementDate: "2026-10-23" })`.
- **Expected Behavior:**
  Produces 26 weekly installments spaced 7 days apart.
- **Actual Behavior:**
  Produces 6 monthly installments. `repaymentFrequency` is defined in the TypeScript interface but completely unused in the execution loops (`for (let i = 1; i <= termMonths; i++)`).
- **Root Cause:**
  Incomplete engine implementation of weekly and quarterly period step logic.
- **Proposed Fix:**
  Calculate total periods based on frequency (Weekly: `Math.round(termMonths * 52 / 12)`, Monthly: `termMonths`, Quarterly: `Math.round(termMonths / 3)`), step due dates accordingly (`addWeeks`, `addMonths`), and adjust periodic rate divisor (Weekly: `5200`, Monthly: `1200`, Quarterly: `400`).
- **Regression Test:** Add weekly and quarterly schedule tests in `loan-schedule-engine.test.ts`.

---

#### Issue `CALC-02`: Non-Delinquent Loans Due Today Classified as Overdue in Arrears
- **Module:** Collections (`src/modules/collections/overdue-service.ts`)
- **Severity:** **MEDIUM**
- **Affected Files:** `src/modules/collections/overdue-service.ts` (lines 65, 75, 120, 151)
- **Reproduction Steps:**
  1. A loan installment is due on `2026-10-23`.
  2. Run `getOverdueQueue` on `2026-10-23`.
- **Expected Behavior:**
  Installments due today are in "Current Due" status; they should not be classified into the "1-30 days overdue" aging bucket until the business date has elapsed.
- **Actual Behavior:**
  `asOf` date is set to `23:59:59.999Z`, matching installments due today. `daysPastDue` computes to `0`. Line 151 assigns `daysPastDue <= 30` to aging bucket `"1-30"`, reporting an on-time borrower as delinquent in arrears.
- **Root Cause:**
  Inclusive timestamp comparison and lack of a `daysPastDue > 0` condition.
- **Proposed Fix:**
  Exclude installments due on the current business date or classify `daysPastDue === 0` as `"CURRENT_DUE"` rather than `"1-30"` delinquency.
- **Regression Test:** Overdue aging bucket boundary test in `collection-workflow-phase5.test.ts`.

---

### Category C: UI & User Experience (Broken Links & 404 Crashes)

---

#### Issue `UI-01`: Primary Call-to-Action Buttons Point to Non-Existent Routes (404 Not Found)
- **Module:** UI / App Router (`src/app/(dashboard)/`)
- **Severity:** **HIGH**
- **Affected Files:**
  - `src/app/(dashboard)/dashboard/page.tsx` (lines 93, 99, 238, 252)
  - `src/app/(dashboard)/customers/page.tsx` (lines 69, 75, 131)
  - `src/app/(dashboard)/loans/schemes/page.tsx` (line 37)
- **Reproduction Steps:**
  1. Click "+ New Customer (KYC)" on `/customers` -> Navigates to `/customers/new` (404 Page Not Found).
  2. Click "KYC Desk" on `/customers` -> Navigates to `/customers/kyc` (404).
  3. Click "+ Add Center / Group" on `/customers` -> Navigates to `/customers/groups/new` (404).
  4. Click "+ New Loan" on `/dashboard` -> Navigates to `/loans/new` (404).
  5. Click "Disburse Funds" on `/dashboard` -> Navigates to `/loans/disburse` (404).
  6. Click "Review Pipeline" on `/dashboard` -> Navigates to `/loans/review` (404).
  7. Click "New Loan Scheme" on `/loans/schemes` -> Navigates to `/loans/schemes/new` (404).
- **Expected Behavior:**
  Primary buttons either navigate to valid sub-routes or open the existing modal workflows (e.g. loan application modal in `LoansClient`, customer intake modal, or tab navigation `/loans?tab=approvals`, `/loans?tab=disbursements`).
- **Actual Behavior:**
  Staff encounter dead ends and 404 pages during core operations.
- **Root Cause:**
  Hardcoded `<Link href="...">` tags referencing uncreated pages instead of existing modal handlers or tab query parameters.
- **Proposed Fix:**
  - Update Dashboard links: `/loans?tab=applications`, `/loans?tab=disbursements`, `/loans?tab=approvals`.
  - Add Customer & Group creation modal in `CustomersPage` or implement `/customers/new`.
  - Link `/loans/schemes` to scheme creation modal or subpage.
- **Regression Test:** Add route accessibility assertions in E2E UAT suite.

---

#### Issue `UI-02`: Uncontrolled and Non-Functional Customer Search Input
- **Module:** UI (`src/app/(dashboard)/customers/page.tsx`)
- **Severity:** **LOW**
- **Affected Files:** `src/app/(dashboard)/customers/page.tsx` (lines 204–209)
- **Reproduction Steps:**
  Type a customer name or code into the search box on `/customers`.
- **Expected Behavior:**
  Submits search query or updates URL search parameter `?search=...` to filter the borrower list.
- **Actual Behavior:**
  Input has no `value`, no `onChange`, and is not wrapped in a `<form>`. Keystrokes produce zero filtering.
- **Proposed Fix:**
  Wrap in a search form with submit/auto-debounce navigating to `?search=...`.

---

#### Issue `UI-03`: Missing Cashbook Tab and Broken Tab Matching on `/accounting`
- **Module:** UI (`src/app/(dashboard)/accounting/page.tsx`)
- **Severity:** **MEDIUM**
- **Affected Files:** `src/app/(dashboard)/accounting/page.tsx` (lines 28, 68–95)
- **Reproduction Steps:**
  1. Open `/accounting?tab=daily-sheet` as documented in `docs/OPERATIONS_AND_DISASTER_RECOVERY.md`.
  2. Notice the page renders no tab content because it only checks `activeTab === "dailysheet"` (without hyphen).
  3. Notice that there is no tab for "Cashbook", despite PRD Section 5.7 and backend `/api/accounting/cashbook`.
- **Expected Behavior:**
  Tab navigation supports both `"daily-sheet"` and `"dailysheet"`, and includes a dedicated Cashbook tab displaying cash/bank running ledgers.
- **Proposed Fix:**
  Normalize tab parameter `(activeTab === "daily-sheet" || activeTab === "dailysheet")` and add Cashbook tab wired to `getCashbook()`.

---

### Category D: Database, Operations & Security

---

#### Issue `SEC-01`: Untracked Database Migrations (Missing Baseline)
- **Module:** Database & Migrations (`prisma/migrations/`)
- **Severity:** **HIGH**
- **Affected Files:** `prisma/migrations/`
- **Reproduction Steps:**
  Run `npx prisma migrate status`.
- **Expected Behavior:**
  Outputs migration status: Database schema is up to date.
- **Actual Behavior:**
  Exits with code 1: `No migration found in prisma/migrations. The current database is not managed by Prisma Migrate.`
- **Root Cause:**
  Early development used `prisma db push` without generating a baseline migration directory.
- **Proposed Fix:**
  Generate initial baseline migration using `npx prisma migrate diff` / `npx prisma migrate dev --name init`.
- **Regression Test:** Execute `npx prisma migrate status` in CI verification.

---

#### Issue `SEC-02`: Unhandled Unique Constraint Violations Return HTTP 500 & Misleading 403 on Duplicates
- **Module:** API Error Handling (`src/app/api/`) & Collection Service
- **Severity:** **MEDIUM**
- **Affected Files:**
  - `src/modules/collections/collection-receipt-service.ts` (line 110)
  - `src/app/api/loans/disburse/route.ts` (lines 23–32)
  - `src/app/api/collections/receipts/route.ts` (lines 37–46)
- **Reproduction Steps:**
  Submit a duplicate receipt number to `/api/collections/receipts`.
- **Expected Behavior:**
  Returns `409 Conflict` with code `"CONFLICT"`.
- **Actual Behavior:**
  If caught by pre-check, returns `403 Forbidden` (`ForbiddenError`); if caught by the database unique constraint in race conditions, returns `500 Internal Server Error`.
- **Proposed Fix:**
  Throw `ConflictError` on duplicates and map Prisma `P2002` error code to `ConflictError` across route error handlers.

---

#### Issue `FEAT-01`: Administration Directory is Completely Read-Only
- **Module:** Administration (`src/app/(dashboard)/admin/users/page.tsx`)
- **Severity:** **LOW**
- **Affected Files:** `src/app/(dashboard)/admin/users/page.tsx`
- **Reproduction Steps:**
  Log in as Organization Admin and navigate to `/admin/users`.
- **Expected Behavior:**
  Organization Admin can invite staff, create users, assign branches/roles, or reset passwords as specified in PRD Section 5.1.
- **Actual Behavior:**
  Page renders a static table of existing users. No buttons, modals, or API endpoints exist for user management.
- **Proposed Fix:**
  Implement user creation/invitation modal and API route `/api/admin/users` calling `createUser()` and `assignRole()`.

---

## 3. Prioritized Repair Plan

In adherence to the mission execution rules, fixes will be implemented sequentially in small, isolated steps with regression tests:

1. **Step 1: Financial & Concurrency Hardening (Priority 1)**
   - Fix `CONC-01` & `CONC-02`: Row-locking and atomic balance calculations inside `prisma.$transaction` for Savings and Loan Collections.
   - Fix `FIN-02`: Eliminate double cash updates in Expense Payment and Reversal.
   - Fix `FIN-03`: Resolve business date skew in Cashbook and Daily Sheet opening balances.
   - Fix `FIN-04`: Clear orphan liabilities on Premature Deposit Closure.

2. **Step 2: Engine Corrections (Priority 2)**
   - Fix `CALC-01`: Implement weekly and quarterly period step logic in `calculateRepaymentSchedule`.
   - Fix `CALC-02`: Correct overdue aging bucket calculation to prevent on-time loans from showing as delinquent.

3. **Step 3: Database & Migration Baselines (Priority 3)**
   - Fix `SEC-01`: Create baseline Prisma migration history so `prisma migrate status` succeeds cleanly.
   - Fix `SEC-02`: Standardize `ConflictError` (409) for duplicate constraints.

4. **Step 4: UI Navigation & Dead Link Elimination (Priority 4)**
   - Fix `UI-01`: Fix dead 404 links on Dashboard, Customers, and Loan Schemes.
   - Fix `UI-03`: Add Cashbook tab and normalize `daily-sheet` query parameter in `/accounting`.
   - Fix `UI-02`: Wire customer search input.
   - Fix `FEAT-01`: Add staff invitation/creation capability on `/admin/users`.

