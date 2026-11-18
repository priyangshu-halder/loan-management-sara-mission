# Rayhan Financial Management System (FMS) - Operations & Disaster Recovery Runbook

## 1. System Overview & Deployment Topology

The **Rayhan FMS** runs as a containerized Next.js Node.js service paired with an institutional MySQL 8.0+ database engine. The system enforces strict double-entry ledger balancing, append-only transaction trails, and tenant isolation.

---

## 2. Daily Operational Runbooks

### 2.1 Morning Startup & Health Verification
1. **Database Connectivity**:
   ```bash
   mysqladmin -u $DB_USER -p$DB_PASSWORD -h $DB_HOST ping
   ```
2. **Prisma Schema Synchronization**:
   ```bash
   npx prisma migrate status
   ```
3. **Application Service Health Check**:
   ```bash
   curl -s -f http://localhost:3000/api/auth/me || echo "Service starting"
   ```

### 2.2 End-of-Day (EOD) Operations
At the conclusion of each business day, branch accountants must perform the daily closing routine:
1. **Cashbox & Vault Physical Reconciliation**:
   - Count physical cash in branch teller drawers and vaults.
   - Verify that total physical cash matches `cashAccount.balance` on the **Daybook** (`/accounting?tab=daybook`).
2. **Daily Sheet Ledger Verification**:
   - Navigate to `/accounting?tab=daily-sheet`.
   - Inspect the automated reconciliation widget: Opening Cash + Total Cash Receipts - Total Cash Disbursements - Cash Expenses = Expected Ending Cash.
   - Confirm `isReconciled === true`.
3. **Period Close Execution**:
   - For month-end or year-end boundaries, call `closeFiscalPeriod(accountantUser, periodId)`.
   - Once marked `CLOSED`, no new journal entries can be posted backdated into that period without an explicit administrative unlock.

---

## 3. Database Backup Strategy

To guarantee zero data loss and business continuity, backups must be split into full snapshots and continuous write-ahead logs.

### 3.1 Logical Daily Snapshot (`mysqldump`)
A full database snapshot is scheduled daily at 02:00 AM local business time using transactional non-blocking dumps:
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/rayhan_fms"
BACKUP_FILE="${BACKUP_DIR}/fms_backup_${BACKUP_DATE}.sql.gz"

mkdir -p "${BACKUP_DIR}"

mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT:-3306}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --quick \
  --triggers \
  --routines \
  --databases "${DB_NAME}" \
  | gzip -9 > "${BACKUP_FILE}"

# Encrypt backup with company AES-256 key
gpg --batch --yes --passphrase "${BACKUP_ENCRYPTION_KEY}" -c "${BACKUP_FILE}"
rm -f "${BACKUP_FILE}"

echo "Backup completed successfully: ${BACKUP_FILE}.gpg"
```

### 3.2 Continuous Binary Log Archiving (Point-in-Time Recovery)
MySQL binary logging (`binlog`) is enabled to allow Point-in-Time Recovery (PITR) with an RPO (Recovery Point Objective) $\le$ 5 minutes:
- `log-bin = /var/log/mysql/mysql-bin.log`
- `binlog_format = ROW`
- `binlog_expire_logs_seconds = 604800` (7 days retention)
- Binary logs are synchronized continuously to secondary off-site encrypted object storage (e.g. AWS S3 with Object Lock or GCP Cloud Storage).

---

## 4. Disaster Recovery & Point-in-Time Restore Runbook

### 4.1 Objectives
- **Recovery Point Objective (RPO)**: $\le 5\text{ minutes}$ (guaranteed via archived binary logs).
- **Recovery Time Objective (RTO)**: $\le 30\text{ minutes}$ (full cluster recovery and data validation).

### 4.2 Step-by-Step Restoration Procedure

#### Step 1: Prepare Clean Target Database
```bash
mysql -u root -p -e "DROP DATABASE IF EXISTS finance_restored; CREATE DATABASE finance_restored CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

#### Step 2: Decrypt and Apply Latest Full Snapshot
```bash
# Decrypt
gpg --batch --yes --passphrase "${BACKUP_ENCRYPTION_KEY}" -d /var/backups/rayhan_fms/fms_backup_20261023_020000.sql.gz.gpg > /tmp/snapshot.sql.gz

# Restore
gunzip < /tmp/snapshot.sql.gz | mysql -u root -p finance_restored
rm -f /tmp/snapshot.sql.gz
```

#### Step 3: Replay Binary Logs to the Exact Incident Timestamp
To restore transactions up to the exact moment of failure (e.g. `2026-10-23 14:15:00`):
```bash
mysqlbinlog \
  --database=finance_dev \
  --start-datetime="2026-10-23 02:00:00" \
  --stop-datetime="2026-10-23 14:15:00" \
  /var/log/mysql/mysql-bin.000042 /var/log/mysql/mysql-bin.000043 \
  | mysql -u root -p finance_restored
```

#### Step 4: Validate Data Integrity Post-Restore
Execute post-restore validation queries before reopening traffic:
```sql
-- 1. Verify Trial Balance equality (Debits == Credits)
SELECT 
  SUM(debit) AS total_debits, 
  SUM(credit) AS total_credits,
  (SUM(debit) - SUM(credit)) AS diff
FROM journal_lines;

-- 2. Verify all active loans have matching outstanding balance
SELECT 
  COUNT(*) AS mismatched_loans
FROM loan_accounts
WHERE principal_outstanding < 0;

-- 3. Verify zero orphan journal lines
SELECT COUNT(*) AS orphan_lines
FROM journal_lines jl
LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
WHERE je.id IS NULL;
```
If `diff == 0.0000`, `mismatched_loans == 0`, and `orphan_lines == 0`, point application environment variables to `finance_restored`.

---

## 5. Security Incident Response & Audit Forensics

### 5.1 Investigating Suspicious Events
When an anomaly is flagged (e.g. rate limit lockout, self-approval attempt, or unauthorized export):
1. Query the immutable `audit_events` table:
   ```sql
   SELECT id, actor_id, action, entity_type, entity_id, created_at, metadata
   FROM audit_events
   WHERE organization_id = '720618a8-a4ea-43d8-983b-9ac33bea3b8a'
     AND action IN ('auth.failed', 'loan.application.rejected', 'report.exported')
   ORDER BY created_at DESC
   LIMIT 100;
   ```
2. Correlate with web server access logs for matching client IP and User-Agent headers.
3. Lock compromised user accounts immediately:
   ```sql
   UPDATE users SET status = 'SUSPENDED' WHERE id = 'compromised-user-uuid';
   ```

