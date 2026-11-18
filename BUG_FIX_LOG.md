# Bug Fix Log

Tracking document for all stabilization and bug-fixing actions across the platform.

| Fix ID | Audit Issue ID | Module | Description | Severity | Status | Verification Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FIX-01 | `CONC-01` | Savings | Row locking and atomic conditional balance updates in savings deposit/withdrawal | Critical | **Resolved** | Verified with 2 new concurrency tests in `savings-service.test.ts` (100% pass) |
| FIX-02 | `CONC-02` | Collections | Row locking and atomic balance recalculation inside collection receipt transaction | Critical | **Resolved** | Verified with concurrency test in `collection-receipt-service.test.ts` (100% pass) |
| FIX-03 | `FIN-02` | Expenses | Remove duplicate manual cash account deduction; pass cashAccountId to journal posting | High | **Resolved** | Verified in `expense-service.test.ts` and `posting-service.ts` (100% pass) |
| FIX-04 | `FIN-03` | Accounting | Align opening balance query in Cashbook & Daily Sheet to businessDate filter | High | **Resolved** | Verified in `posting-service.test.ts` with backdated posting test (100% pass) |
| FIX-05 | `FIN-04` | Term Deposits | Clear prior accrued periodic interest liabilities on premature deposit closure | Medium | **Resolved** | Verified in `term-deposit-service.test.ts` with premature closure test (100% pass) |
| FIX-06 | `CALC-01` | Loans | Implement weekly and quarterly frequency handling in loan schedule engine | High | **Resolved** | Verified in `loan-schedule-engine.test.ts` (100% pass, 6/6 tests) |
| FIX-07 | `CALC-02` | Collections | Fix overdue aging boundary so current due installments are not marked delinquent | Medium | **Resolved** | Verified in `collection-workflow-phase5.test.ts` with boundary tests (100% pass) |
| FIX-08 | `SEC-01` | Database | Baseline Prisma migrations so `prisma migrate status` succeeds cleanly | High | **Resolved** | `npx prisma migrate status` reports 1 migration, Database schema is up to date (code 0) |
| FIX-09 | `SEC-02` | API & Collections | Standardize ConflictError (409) for unique violations instead of 403/500 | Medium | **Resolved** | Verified in `api-response.test.ts` (4/4 tests) & collection receipt suites |
| FIX-10 | `UI-01` | UI / Navigation | Fix dead links on Dashboard, Customers, and Schemes; add intake pages | High | **Resolved** | Verified routes `/customers/new`, `/customers/groups/new`, `/loans/schemes/new` compile cleanly (52/52 Next.js static pages) |
| FIX-11 | `UI-03` | UI / Accounting | Fix Daily Sheet tab match and add dedicated running Cashbook tab | Medium | **Resolved** | Normalized tab parsing, added `getCashbook` filter form & running balance ledger table; 100% typechecked |
| FIX-12 | `UI-02` | UI / Customers | Wire customer search input with GET query filtering | Low | **Resolved** | Added `<form method="GET">` with default search value and clear button |
| FIX-13 | `FEAT-01` | Administration | Add user creation API endpoint and modal dialog for staff management | Low | **Resolved** | Created `/api/admin/users`, `UserManagementClient.tsx`; verified with 6/6 unit tests in `src/app/api/admin/users/route.test.ts` |
| FIX-14 | `FIN-01` | Reports | Replace unbounded in-memory summing with pushdown database SQL aggregations | High | **Resolved** | Converted 5 full-table scans to parameterized `prisma.$queryRaw` aggregations; verified with 8/8 tests in `report-service.test.ts` |

---

## Detailed Log Entries

### [FIX-09] SEC-02: API Conflict Handling & Prisma Error Sanitization
- **Date:** 2026-10-23
- **Author:** Antigravity Stabilization Agent
- **Files Modified:** `src/lib/errors/api-response.ts`, `src/lib/errors/api-response.test.ts`, `src/app/api/loans/disburse/route.ts`, `src/app/api/collections/receipts/route.ts`, `src/app/api/customers/route.ts`
- **Summary of Changes:**
  - Introduced `handleApiError` utility in `src/lib/errors/api-response.ts`.
  - Mapped Prisma `P2002` unique constraint violations to standard `409 Conflict` (`ConflictError`) responses with informative JSON payloads.
  - Mapped Prisma `P2025` missing records to `404 Not Found`.
  - Mapped `ZodError` to standard `400 Bad Request` (`VALIDATION_ERROR`).
  - Sanitized unhandled 500 exceptions so internal database connection strings, paths, and stack traces are never leaked in API responses.
- **Verification:**
  - Created test suite `src/lib/errors/api-response.test.ts` (4/4 passed). Verified 409 translation, P2002 handling, P2025 mapping, and secret/stack trace masking.

---

### [FIX-10] UI-01: Dead Link Elimination & Route Restoration
- **Date:** 2026-10-23
- **Author:** Antigravity Stabilization Agent
- **Files Modified/Created:**
  - `src/app/(dashboard)/dashboard/page.tsx`
  - `src/app/(dashboard)/customers/new/page.tsx`
  - `src/app/(dashboard)/customers/groups/new/page.tsx`
  - `src/app/(dashboard)/loans/schemes/new/page.tsx`
- **Summary of Changes:**
  - Updated dead CTA links on Dashboard from non-existent paths to tab anchors `/loans?tab=applications`, `/loans?tab=disbursements`, `/loans?tab=approvals`.
  - Implemented `/customers/new` page allowing staff to onboard borrowers with KYC details directly via `/api/customers`.
  - Implemented `/customers/groups/new` page allowing staff to form Joint Liability Groups (JLGs) / center meeting groups via `/api/customers/groups`.
  - Implemented `/loans/schemes/new` page enabling configuration and creation of new loan products via `/api/loans/schemes`.
- **Verification:**
  - Verified Next.js build generates all 52 static and dynamic routes with zero 404 dead links.

---

### [FIX-11] UI-03: Cashbook Ledger Tab & Accounting Tab Normalization
- **Date:** 2026-10-23
- **Author:** Antigravity Stabilization Agent
- **Files Modified:** `src/app/(dashboard)/accounting/page.tsx`, `src/modules/accounting/posting-service.ts`
- **Summary of Changes:**
  - Normalized tab parameter evaluation so both `tab=daily-sheet` and `tab=dailysheet` reliably display the Daily Sheet tab.
  - Added dedicated **Cashbook** tab featuring cash/bank account selection, date-range filtering, and running balance ledger visualization.
  - Integrated `getCashbook()` with summary cards (Opening Balance, Total Receipts, Total Payments, Closing Balance) and chronological voucher breakdown.
  - Resolved `cashAccountId` typing in `posting-service.ts` to ensure clean compilation.
- **Verification:**
  - TypeScript type check (`tsc --noEmit`) passes with exit code 0. Next.js build passes.

---

### [FIX-12] UI-02: Customer Search Input Filtering
- **Date:** 2026-10-23
- **Author:** Antigravity Stabilization Agent
- **Files Modified:** `src/app/(dashboard)/customers/page.tsx`
- **Summary of Changes:**
  - Enclosed search input in a GET form with query string preservation.
  - Set `defaultValue={searchParams?.search || ""}` so active search query remains visible.
  - Added "Clear" reset action button when search query is present.
- **Verification:**
  - Manual inspect and Next.js page data collection verified.

---

### [FIX-13] FEAT-01: Staff User Administration API & Creation Modal
- **Date:** 2026-10-23
- **Author:** Antigravity Stabilization Agent
- **Files Modified/Created:**
  - `src/app/api/admin/users/route.ts`
  - `src/app/api/admin/users/route.test.ts`
  - `src/app/(dashboard)/admin/users/UserManagementClient.tsx`
  - `src/app/(dashboard)/admin/users/page.tsx`
- **Summary of Changes:**
  - Implemented `/api/admin/users` GET (directory list) and POST (user creation) with `requirePermission(user, "user.manage")` and tenant isolation.
  - Developed `UserManagementClient.tsx` with modal dialog for full legal name, username, email, initial password, assigned branch, and role multi-selection.
  - Wired into `admin/users/page.tsx` querying roles and active branches for the current organization.
- **Verification:**
  - Created test suite `src/app/api/admin/users/route.test.ts` (6/6 passed) testing 401 unauthenticated, 403 unauthorized, 400 validation error, 409 conflict, and 201 successful creation.

---

### [FIX-14] FIN-01: Pushdown Database Aggregations for Reporting
- **Date:** 2026-10-23
- **Author:** Antigravity Stabilization Agent
- **Files Modified:** `src/modules/reports/report-service.ts`
- **Summary of Changes:**
  - Replaced five unconstrained `findMany` queries in `getDashboardMetrics` with database-level parameterized `prisma.$queryRaw` queries.
  - Cast monetary values directly in MySQL (`CAST(col AS DECIMAL(19,4))`) and computed `SUM` / `COUNT` inside the database engine.
  - Eliminated Node.js heap memory exhaustion (OOM) risk from loading large volumes of accounts in memory.
- **Verification:**
  - Executed `report-service.test.ts` (8/8 passed). Tested dashboard metrics, portfolio aging, and GL reconciliation.

