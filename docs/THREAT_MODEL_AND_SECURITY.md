# Rayhan Financial Management System (FMS) - Threat Model & Security Architecture

## 1. Executive Summary & Security Posture

The **Rayhan Financial Management System (FMS)** is a multi-tenant, institutional-grade core banking and microfinance platform built with Next.js (App Router), TypeScript, MySQL, and Prisma. The platform governs the full lifecycle of lending products, member voluntary savings accounts, fixed and recurring term deposits, field collections, operational expenses, double-entry general ledger posting, and regulatory financial statements.

In compliance with `AGENTS.md`, the platform prioritizes **financial correctness, multi-tenant isolation, authorization, and auditability** over developer convenience or UI polish. Security controls are enforced exclusively on the server at the domain service layer.

---

## 2. Threat Modeling Methodology & System Assets

### 2.1 Critical System Assets
1. **Financial Ledger & Balances**: General Ledger accounts, journal entries, posted collections, savings balances, loan principal/interest receivables.
2. **Borrower & Member PII**: Full names, contact telephone numbers, email addresses, KYC identity documentation, bank account details.
3. **Authentication & Session Tokens**: User passwords (salted hashes), cryptographically secure bearer session tokens.
4. **Audit Trail**: Tamper-evident, immutable records of all operational, approval, and sensitive export events.

### 2.2 Trust Boundaries
- **Untrusted Internet / Client Tier**: Staff browsers, mobile field devices, reverse proxies, and third-party networks.
- **Perimeter Edge / Middleware Tier**: Next.js route handlers, Server Actions, HTTP security headers, sliding-window rate limiters.
- **Domain Service Tier**: Authentication guards, authorization checks, organization/branch scoping, maker-checker verifiers, and Zod external payload validation.
- **Ledger Invariant Engine**: Decimal arithmetic engines, double-entry validation, and database transaction atomicity.
- **Database Persistence Tier**: Multi-tenant MySQL storage, foreign key constraints, composite unique indexes, and append-only financial logs.

---

## 3. STRIDE Threat Analysis & Defense Architecture

| Threat Category | Potential Attack Vector | Applied Platform Defense & Mitigation |
| :--- | :--- | :--- |
| **Spoofing** | Credential stuffing, brute-force logins, session hijacking | Bounded bcrypt (cost factor 10), cryptographically random session tokens (32 bytes `crypto.randomBytes`), `HttpOnly` + `Secure` + `SameSite=lax` session cookies, sliding-window rate limiting on `/api/auth/login` (5 attempts/min). |
| **Tampering** | Parameter tampering on loan interest rates, repayment amounts, or unbalancing ledger entries | Strict Zod validation on every route and service input. Fixed-precision `Decimal.js` math with zero floating-point arithmetic. Atomically balanced journal postings ($\sum \text{Debits} = \sum \text{Credits}$); transactions rollback immediately on unbalance. |
| **Repudiation** | Staff denying having approved unauthorized loans, waived fees, or exported customer PII | Append-only `AuditEvent` table capturing actor ID, timestamp, organization ID, entity type, entity ID, action code, and full snapshot metadata. Export actions (`report.exported`) are logged synchronously. |
| **Information Disclosure** | Cross-tenant data exfiltration (IDOR), sensitive stack traces in API errors | `requireOrganizationScope()` and `requireRecordScope()` enforced on every read/write. Tenant ID present in all composite foreign keys. Structured application error codes (`AppError`) without leaking database internals or stack traces. |
| **Denial of Service** | Volumetric brute-force attacks, unbounded date queries exhausting database memory | In-memory sliding-window rate limiter (`RateLimiter`) with automatic stale cleanup. Bounded pagination and mandatory date range filters (`startDate`, `endDate`) on daybooks and ledger queries. |
| **Elevation of Privilege** | Staff attempting actions beyond assigned role, or self-approving their own submissions | Default-deny Role-Based Access Control (RBAC). Server-side permission guards (`requirePermission`). Hard separation of duties: `assertMakerCheckerSeparation()` prevents makers from approving their own loans or expenses. |

---

## 4. Multi-Tenant Isolation & IDOR Defense

The platform enforces logical multi-tenancy with strict tenant data isolation:

1. **Mandatory Tenant Scoping in Queries**: Every query to database tables must specify `where: { organizationId }` matching the caller's verified session.
2. **Composite Unique Constraints**: Tenant resources are uniquely identified in combination with `organizationId` (e.g., `@@unique([organizationId, code])`, `@@unique([organizationId, customerCode])`, `@@unique([organizationId, accountNumber])`).
3. **Database Constraint Referential Integrity**: Foreign keys for loans, disbursements, receipts, and journal entries reference their parent organization, preventing cross-tenant linkage.
4. **Automated Penetration Verification**: The test suite [`src/modules/system/penetration-hardening.test.ts`](file:///home/priyangshu/code/financial-management-system/src/modules/system/penetration-hardening.test.ts) actively attempts cross-tenant customer access, foreign loan collection, and cross-organization approval, verifying immediate `ForbiddenError` / `NotFoundError` rejection.

---

## 5. Financial Correctness & Ledger Invariants

### 5.1 Zero Floating-Point Arithmetic
JavaScript IEEE 754 binary floating-point numbers (`number`) are **never** used for currency computations. All monetary balances, disbursements, accrued interest, fees, penalties, and journal lines are computed using `Decimal.js` (or the domain `Money` class) configured to 4 decimal places of internal precision (`ROUND_HALF_UP`).

### 5.2 Atomic Double-Entry Balance Invariant
Every financial posting (loan disbursement, repayment collection, savings deposit/withdrawal, term deposit accrual/payout, expense voucher, or loan closure) must produce a balanced General Ledger journal entry within a Prisma interactive transaction:
$$\sum_{i} \text{Debit}_i - \sum_{i} \text{Credit}_i = 0$$

If $\sum \text{Debit} \neq \sum \text{Credit}$, `postJournalEntry` throws an unhandled `ValidationError`, rolling back the entire database transaction without persisting orphan domain records.

### 5.3 Immutability and Reversal Flows
Posted financial transactions, receipts, and journal entries are strictly immutable. They cannot be updated or deleted:
- To correct a mistake, staff post an explicit **reversal entry**.
- Reversals generate equal-and-opposite journal lines linked to the original entry via `reversalOfId` and log an auditable event.

---

## 6. Maker-Checker Separation of Duties

The platform enforces maker-checker separation for high-impact financial operations:

- **Loan Application Approval**: An officer who drafted or submitted a loan application cannot approve it, even if granted the `loan.application.approve` permission. An independent approver (e.g., Branch Manager) must authorize the credit decision.
- **Expense Voucher Approval**: A staff member who submitted an expense reimbursement voucher cannot approve their own claim.
- **Implementation**: Handled by `assertMakerCheckerSeparation(makerId, checkerId, operationName)` in `src/lib/permissions/auth-guard.ts`.

---

## 7. HTTP Perimeter & Defense-in-Depth

The edge perimeter is hardened through Next.js middleware and secure API routing:

1. **Content Security Policy (CSP)**:
   - `default-src 'self'`
   - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (bounded to trusted Next.js scripts)
   - `style-src 'self' 'unsafe-inline'`
   - `frame-ancestors 'none'`
2. **HTTP Strict Transport Security (HSTS)**:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
3. **MIME Sniffing & Framing Defense**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
4. **Authentication Rate Limiting**:
   - Sliding-window algorithm enforced on `/api/auth/login`.
   - Limits failed authentication attempts to 5 requests per 60 seconds per IP and username combination. Returns HTTP 429 (`TOO_MANY_REQUESTS`) upon threshold breach.

