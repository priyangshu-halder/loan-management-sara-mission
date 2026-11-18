# Regression Test Plan & Verification Suite

## 1. Test Objectives & Coverage Matrix

| Area | Focus | Test Files | Automated Coverage |
| :--- | :--- | :--- | :--- |
| **Auth & Permissions** | RBAC, tenant isolation, maker-checker separation, user management | `auth-service.test.ts`, `auth-guard.test.ts`, `penetration-hardening.test.ts`, `src/app/api/admin/users/route.test.ts` | 37 tests |
| **Savings Concurrency** | Parallel deposits, parallel withdrawals, overdraft prevention | `savings-service.test.ts` | 7 tests |
| **Loan Lifecycle** | Schedule calculation (weekly/monthly/quarterly), application, approval, disbursement, schemes | `loan-schedule-engine.test.ts`, `loan-application-service.test.ts`, `loan-disbursement-service.test.ts`, `loan-closure-service.test.ts`, `loan-scheme-service.test.ts`, `loan-workflow-phase4.test.ts` | 23 tests |
| **Collections & Allocation** | Payment allocation waterfall, receipt recording, overdue classification | `payment-allocation-engine.test.ts`, `collection-receipt-service.test.ts`, `collection-workflow-phase5.test.ts` | 11 tests |
| **Term & Recurring Deposits**| Periodic interest posting, premature closure, liability reconciliation | `term-deposit-service.test.ts` | 8 tests |
| **Expenses** | Maker-checker expense approval, payment, GL posting, cash balance integrity | `expense-service.test.ts` | 6 tests |
| **Accounting & Reporting** | Balanced journal lines, cashbook, daily sheet date alignment, P&L, balance sheet | `posting-service.test.ts`, `report-service.test.ts` | 18 tests |
| **Customer Management** | Customer KYC onboarding, group centers, tenant isolation | `customer-service.test.ts` | 3 tests |
| **Security & Error Sanitization**| Rate limiting, API response formatting, conflict error translation | `rate-limiter.test.ts`, `api-response.test.ts`, `password-service.test.ts` | 11 tests |
| **Money Calculations** | Decimal rounding, exact fractional precision, currency operations | `money.test.ts` | 7 tests |
| **E2E Operational Lifecycle**| 9 full customer journeys across entire system | `e2e-operational-uat.test.ts` | 9 tests |
| **Total Automated Suite** | **Entire Application Regression Suite** | **24 Test Files** | **140 Tests (100% Pass)** |

---

## 2. Regression Scenarios by Fix

### `FIX-01` (`CONC-01`): Savings Concurrency & Overdraft Prevention
- **Scenario 1.1:** Two parallel withdrawal requests exceeding available balance.
  - Setup: Account with ₹1,000 balance, min balance ₹0.
  - Action: Execute two concurrent ₹600 withdrawals (`Promise.all`).
  - Expectation: Exactly one withdrawal succeeds; the other fails with `ValidationError("Withdrawal amount exceeds available savings balance")`. Account balance ends at ₹400 (never negative/overdrawn).
- **Scenario 1.2:** Two parallel deposits.
  - Setup: Account with ₹1,000 balance.
  - Action: Execute two concurrent ₹500 deposits (`Promise.all`).
  - Expectation: Both deposits succeed; account balance ends at ₹2,000 (no lost updates).

### `FIX-02` (`CONC-02`): Loan Collection Concurrency
- **Scenario 2.1:** Two parallel collection receipts.
  - Setup: Active loan with ₹20,000 outstanding principal.
  - Action: Execute two concurrent collection receipts of ₹3,000 each.
  - Expectation: Both receipts are applied sequentially. Outstanding principal becomes ₹14,000.

### `FIX-03` (`FIN-02`): Expense Cash Account Single Deduction
- **Scenario 3.1:** Approved expense payment deduction.
  - Setup: Cash drawer with ₹10,000 balance.
  - Action: Pay ₹1,500 expense voucher.
  - Expectation: Cash drawer balance becomes ₹8,500 exactly. Reversal restores balance to ₹10,000 exactly.

### `FIX-04` (`FIN-03`): Cashbook & Daily Sheet Opening Balance Business Date Skew
- **Scenario 4.1:** Entry with prior business date posted at later wall clock.
  - Setup: Journal entry posted on 2026-10-23 with `businessDate: "2026-10-22"`.
  - Action: Query cashbook and daily sheet for `2026-10-23`.
  - Expectation: Entry is included in opening balance on `2026-10-23`.

### `FIX-05` (`FIN-04`): Term Deposit Premature Closure Accrual Reconciliation
- **Scenario 5.1:** Premature closure of FD with monthly interest posted.
  - Setup: 1-year FD with 2 months of posted periodic interest.
  - Action: Prematurely close in Month 3.
  - Expectation: GL 2003 (Deposit Liability) is zeroed out; penal prorated interest is correctly reconciled without orphan credit balance.

### `FIX-06` (`CALC-01`): Loan Schedule Weekly & Quarterly Support
- **Scenario 6.1:** Weekly loan calculation.
  - Setup: ₹10,000 principal, 6 months term, Weekly frequency.
  - Expectation: Generates 26 weekly installments spaced 7 days apart with balanced amortization.
- **Scenario 6.2:** Quarterly loan calculation.
  - Setup: ₹12,000 principal, 12 months term, Quarterly frequency.
  - Expectation: Generates 4 quarterly installments spaced 3 months apart.

### `FIX-07` (`CALC-02`): Overdue Aging Boundary
- **Scenario 7.1:** Installment due today (`daysPastDue === 0`).
  - Expectation: Not classified in "1-30" days overdue bucket.

### `FIX-08` (`SEC-01`): Database Migration Status
- **Scenario 8.1:** Run `npx prisma migrate status`.
  - Expectation: Reports database schema is up to date and managed by migrations.

### `FIX-09` (`SEC-02`): API Duplicate Error Standardization
- **Scenario 9.1:** Duplicate receipt number submission returns 409 Conflict.
- **Scenario 9.2:** Schema validation failure returns 400 Bad Request (`VALIDATION_ERROR`).

### `FIX-10` (`UI-01`): Route Accessibility & Dead Link Elimination
- **Scenario 10.1:** Staff accesses `/customers/new`, `/customers/groups/new`, `/loans/schemes/new`, `/loans?tab=approvals`.
  - Expectation: All routes resolve with 200 OK and render designated forms.

### `FIX-11` (`UI-03`): Cashbook Tab & Date Skew Normalization
- **Scenario 11.1:** Staff navigates to `/accounting?tab=daily-sheet` and `/accounting?tab=cashbook`.
  - Expectation: Daily Sheet renders without tab mismatch; Cashbook tab provides filter form and chronological running ledger.

### `FIX-12` (`UI-02`): Customer Search Query Filtering
- **Scenario 12.1:** Staff filters customers by name via GET form.
  - Expectation: Filter parameter persists in URL and list reflects matching results.

### `FIX-13` (`FEAT-01`): Admin Staff User Management API & Dialog
- **Scenario 13.1:** Organization admin invites staff user via `/api/admin/users`.
  - Expectation: Creates user with hashed password, assigned branch scope, and user roles; emits tamper-evident audit log.

### `FIX-14` (`FIN-01`): Database Aggregation Pushdown & OOM Prevention
- **Scenario 14.1:** Portfolio KPI dashboard query.
  - Expectation: Computes portfolio outstanding, disbursed, and deposit balances in MySQL using `SUM(CAST(... AS DECIMAL(19,4)))` without loading account arrays into Node.js heap.

---

## 3. Execution Results Log

| Date | Fix ID | Suite / Test Case | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 2026-10-23 | `FIX-01` | `savings-service.test.ts` (7 tests) | **PASSED** | Concurrent withdrawals and deposits verified under row-level pessimistic locks |
| 2026-10-23 | `FIX-02` | `collection-receipt-service.test.ts` (3 tests) & `collection-workflow-phase5.test.ts` (4 tests) | **PASSED** | Concurrent receipt allocation and 409 Conflict verified under row-level pessimistic locks |
| 2026-10-23 | `FIX-03` | `expense-service.test.ts` (6 tests) & `posting-service.ts` | **PASSED** | Single atomic cash balance adjustment via posting engine verified without manual double-deduction |
| 2026-10-23 | `FIX-04` | `posting-service.test.ts` (10 tests) & `ledger-service.ts` | **PASSED** | Backdated journal inclusion in cashbook opening balance verified without date skew |
| 2026-10-23 | `FIX-05` | `term-deposit-service.test.ts` (8 tests) | **PASSED** | Premature closure with prior periodic interest accrual reconciliation verified |
| 2026-10-23 | `FIX-06` | `loan-schedule-engine.test.ts` (6 tests) & all loan suites (23 tests) | **PASSED** | Weekly and Quarterly frequency calculations and exact amortizations verified |
| 2026-10-23 | `FIX-07` | `collection-workflow-phase5.test.ts` (4 tests) & `overdue-service.ts` | **PASSED** | Due today boundary verification and 1-day delinquent bucket classification verified |
| 2026-10-23 | `FIX-08` | `npx prisma migrate status` | **PASSED** | Migration history baselined; schema is verified up-to-date with code 0 |
| 2026-10-23 | `FIX-09` | `api-response.test.ts` (4 tests) | **PASSED** | AppError translation, Prisma P2002 -> 409, P2025 -> 404, ZodError -> 400, and stack trace masking verified |
| 2026-10-23 | `FIX-10` | Next.js production build (`npm run build`) | **PASSED** | 52/52 routes statically and dynamically compiled with zero dead 404 links |
| 2026-10-23 | `FIX-11` | `src/app/(dashboard)/accounting/page.tsx` & `tsc --noEmit` | **PASSED** | Normalized `daily-sheet` tab match, integrated `getCashbook` filter and running ledger table |
| 2026-10-23 | `FIX-12` | `src/app/(dashboard)/customers/page.tsx` | **PASSED** | GET search form with reset button and query state preservation verified |
| 2026-10-23 | `FIX-13` | `src/app/api/admin/users/route.test.ts` (6 tests) | **PASSED** | User creation API route, RBAC permissions, branch scopes, and client modal verified |
| 2026-10-23 | `FIX-14` | `report-service.test.ts` (8 tests) | **PASSED** | Replaced 5 full-table scans with MySQL pushdown aggregations; 100% GL reconciliation |
| 2026-10-23 | **FULL SUITE** | `npx vitest run` (24 files, 140 tests) | **PASSED** | 100% passing across all 10 modules without a single regression or failure |

