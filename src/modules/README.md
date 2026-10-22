# Application Modules Architecture

Following the modular monolith structure defined in `docs/ARCHITECTURE.md`:

- `identity`: Users, roles, permissions, sessions, and authentication.
- `organizations`: Multi-tenant organization profile, branch network, business calendars, and settings.
- `customers`: Customer profiles, KYC/documents, borrowing groups, and collector assignments.
- `loans`: Schemes and versioning, applications, approvals, disbursements, loan accounts, schedules, and closure.
- `collections`: Repayment receipts, deterministic payment allocation, collection sheets, arrears, and follow-ups.
- `savings`: Savings accounts, deposits, and withdrawal processing.
- `term-deposits`: RD/FD products, installments, maturity schedules, and periodic interest posting.
- `expenses`: Operational expenses, maker-checker approvals, and voucher payments.
- `accounting`: General ledger, chart of accounts, journal posting service, cashbook, daybook, daily sheet, and reconciliation.
- `reports`: Read models, operational summaries, and audited file exports.
- `audit`: Append-only audit events and security logs.

## Rules
- Cross-module financial mutations must go through domain services within a single database transaction.
- UI components and route handlers must never write directly to cross-module database tables.

