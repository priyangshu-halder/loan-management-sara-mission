# Rayhan Financial Management System (FMS) - Staff User Guide

Welcome to the **Rayhan Financial Management System (FMS)** operational staff manual. This guide covers the end-to-end operational workflows for branch staff, field collectors, credit officers, accountants, and branch managers.

---

## 1. System Access & Staff Roles

The platform enforces Role-Based Access Control (RBAC) with maker-checker separation:

| Role | Primary Responsibilities | Key Permissions |
| :--- | :--- | :--- |
| **Credit Officer** | Customer KYC onboarding, loan scheme intake, loan application drafting & submission, savings account opening. | `customer.manage`, `loan.application.create`, `loan.application.submit`, `savings.account.manage`, `savings.deposit.create` |
| **Branch Manager** | Independent loan sanctioning, loan disbursement authorization, expense voucher approval, term deposit interest postings. | `loan.application.approve`, `loan.disbursement.post`, `loan.account.manage`, `expense.approve`, `expense.post`, `deposit.interest.post` |
| **Field Collector** | Group center collection meetings, collection sheet reconciliation, receipt issuance. | `collection.receipt.create`, `collection.sheet.manage`, `loan.account.read` |
| **Chief Accountant** | General ledger maintenance, vault cashbook reconciliation, fiscal period closure, financial statements export. | `accounting.ledger.read`, `accounting.period.close`, `report.read`, `report.export` |

---

## 2. Customer & Group Center Onboarding

### 2.1 Registering a New Customer
1. Navigate to **Customers** (`/customers`).
2. Click **+ New Customer**.
3. Fill in the required fields:
   - **Customer Code**: Unique alphanumeric identifier (e.g. `CUST-10492`).
   - **Full Name**: Customer's legal name as per government identity document.
   - **Phone**: Primary contact number (e.g. `+91-9876543210`).
   - **Branch / Center**: Select the appropriate branch.
4. Click **Create Customer**.

### 2.2 Solidarity Groups & Centers
1. In the Customers section, open the **Groups & Centers** tab.
2. Click **Create Group** to define a meeting center (e.g., "Kalyan Center 04").
3. Assign members with their respective roles (`MEMBER`, `LEAD`, `AGENT`).

---

## 3. Lending Lifecycle & Loan Management

### 3.1 Loan Scheme Configuration
Loan schemes govern the interest method, repayment frequency, and principal bounds:
1. Navigate to **Loans > Schemes** (`/loans/schemes`).
2. Click **+ Create Scheme**.
3. Specify parameters:
   - **Interest Method**: `REDUCING_BALANCE` (standard amortization) or `FLAT`.
   - **Repayment Frequency**: `MONTHLY` or `WEEKLY`.
   - **Principal Range**: Minimum and maximum loan sizes.
   - **Term**: Loan duration in months.
   - **Interest Rate**: Annualized percentage rate.
4. Set status to `PUBLISHED` to enable application intake.

### 3.2 Loan Application & Maker-Checker Approval
1. Open **Loans > Applications** (`/loans`).
2. Click **New Application**, select the customer and approved scheme, enter requested amount, and click **Save Draft**.
3. Review the loan criteria and click **Submit for Approval**.
4. **Maker-Checker Rule**: The officer who created or submitted the loan **cannot** approve it.
5. The **Branch Manager** reviews the submitted application under their queue, checks borrower history, and clicks **Approve Application** with mandatory approval notes.

### 3.3 Loan Disbursement & Amortization
1. Once approved, the Branch Manager initiates disbursement.
2. Select the source **Cash / Bank Account** (e.g., `Main Vault Cash`).
3. Click **Disburse Loan**.
4. The system automatically:
   - Posts a balanced General Ledger journal entry (Debit *1201 Loan Principal*, Credit *1001 Cash in Vault*).
   - Generates the full amortization schedule with installment numbers, due dates, principal, and interest breakdowns.
   - Activates the Loan Account.

### 3.4 Settlement Quotes & Early Loan Closure
When a borrower requests early settlement or prepays their loan in full:
1. Open the active loan account details (`/loans/accounts/[id]`).
2. Click **Generate Settlement Quote**. The system calculates principal outstanding, accrued interest, and fees as of the requested settlement date.
3. Enter the cash receipt details or authorized waiver amount.
4. Click **Post Loan Closure**.
5. The system posts closing journal entries, marks all installments as `PAID`, marks the account `CLOSED`, and generates a formal **Loan Closure Number** (e.g. `LC-20261023-0001`).

---

## 4. Field Collections & Cash Waterfall

### 4.1 Collection Sheets
Field officers conducting weekly or monthly center meetings can generate digital collection sheets:
1. Navigate to **Collections** (`/collections`).
2. Select the center group and business date.
3. Record amounts collected per borrower.

### 4.2 Repayment Allocation Waterfall
When a payment is recorded via `createCollectionReceipt`:
The engine automatically distributes collected cash across outstanding balances using the regulatory priority waterfall:
1. **Overdue Penalties** (Highest priority)
2. **Accrued / Outstanding Fees**
3. **Accrued Interest**
4. **Principal Due**
5. **Advance Prepayment** (Excess funds credited to next future installment)

---

## 5. Voluntary Savings & Term Deposits

### 5.1 Member Savings Accounts
1. Navigate to **Savings** (`/savings`).
2. Click **Open Savings Account**, choose the customer, and set product terms.
3. To accept cash deposits, click **Deposit**, enter amount and transaction reference. Balanced double-entry lines (Debit Cash, Credit Savings Liability) post immediately.

### 5.2 Fixed & Recurring Deposits
1. Open **Deposits** (`/deposits`).
2. Create or select a Term Deposit product (FD with simple/compound interest, or RD with monthly installments).
3. Open an account with initial principal. The system computes projected maturity value and maturity date.
4. Monthly interest accruals can be posted using **Post Periodic Interest**, debiting *Interest Expense* and crediting *Deposit Interest Payable*.

---

## 6. Operational Expense Lifecycle

1. Navigate to **Expenses** (`/expenses`).
2. Staff submit an expense voucher (e.g., travel conveyance, office supplies) with category and supporting invoice reference.
3. Click **Submit Voucher**.
4. An authorized manager reviews and clicks **Approve Expense**.
5. Branch cashiers execute **Pay Expense**, selecting the petty cash account. The system posts Debit *Operating Expense*, Credit *Petty Cash*.

---

## 7. Accounting, Daybook & Audited Reports

### 7.1 Daybook & Daily Sheet Reconciliation
1. Navigate to **Accounting** (`/accounting`).
2. View **Daybook** for real-time chronological records of all journal vouchers posted during the business date.
3. View **Daily Sheet** to inspect the mathematical reconciliation between cash opening, inflows, outflows, and closing balance.

### 7.2 Audited Financial Statements & CSV Exports
1. Open **Reports** (`/reports`).
2. Generate **Portfolio At Risk (PAR)**, **Balance Sheet**, or **Profit & Loss**.
3. Authorized staff with `report.export` permission can click **Export to CSV**.
4. The system produces a formatted CSV with hash metadata and logs an immutable `report.exported` event in the audit trail.

