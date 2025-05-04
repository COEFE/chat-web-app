# TODOA – Accountant Upgrade Roadmap

> Transform the AI Bookkeeper into a full double-entry accounting platform with automated feeds, AI classification, and audit-ready controls.

---

## 0. Foundation & Planning
- [ ] Finalize chart of accounts structure (core + optional sub-accounts)
- [ ] Decide on journals list (general, AP, AR, payroll, adjustments)
- [ ] Confirm data retention & audit requirements (IRS 7-year, etc.)
- [ ] Migrate existing GL codes → `accounts` table mapping

---

## 1. Database Schema
- [ ] Create tables
  - [ ] `accounts (id, type, name, code, parent_id, is_active)`
  - [ ] `journals (id, date, memo, source, created_by)`
  - [ ] `journal_lines (journal_id, account_id, debit, credit, description)`
  - [ ] `journal_audit (journal_id, changed_by, ts, before, after)`
  - [ ] `budgets (id, account_id, period, amount)`
- [ ] Write migrations (SQL or drizzle/knex)
- [ ] Add Postgres check constraint `debit + credit = 0` on `journal_lines` group by journal
- [ ] Add pgvector column `embedding` on `journal_lines` for AI classification

---

## 2. Posting Engine (API)
- [ ] `POST /api/journals` – validate, post, return id
- [ ] `GET /api/journals/:id` – with lines & attachments
- [ ] Hooks
  - [ ] Autogenerate embeddings for each line (description + vendor)
  - [ ] Trigger audit log on update/delete (soft-delete only)

---

## 3. Manual Transaction UI
- [ ] New sidebar section **Transactions**
- [ ] ReactGrid sheet for quick entry (date, memo, account, debit, credit)
- [ ] Real-time imbalance indicator (difference tooltip)
- [ ] File upload for attachments (store S3, URL in `journal_attachments`)

---

## 4. Bank & Card Feeds
- [ ] Integrate Plaid
  - [ ] OAuth flow screen
  - [ ] Webhook receiver `/api/plaid/webhook`
  - [ ] Nightly cron fetch & post journal entries
- [ ] Matching/Reconciliation engine
  - [ ] Match feed lines to open invoices/bills by amount & date ±2 days
  - [ ] UI screen to confirm matches, create adjusting entries

---

## 5. AI Classification & Suggestions
- [ ] Endpoint `/api/classify-transaction` → returns probable account + confidence
- [ ] Nearest-neighbor search on embeddings + rules (vendor → account)
- [ ] Train incremental model with user corrections (store mapping table)
- [ ] UI chips: suggested account(s) under each un-coded line

---

## 6. Budgeting & Variance
- [ ] Move existing budget upload to `budgets` table keyed by `account_id`
- [ ] Cron job to compute month-to-date actuals vs. budget
- [ ] Dashboard widget: heat-map of variance (green within 5%, red >15%)

---

## 7. Reporting Layer
- [ ] Trial balance generator (period range)
- [ ] P&L, Balance Sheet, Cash Flow (indirect)
- [ ] AR Aging, AP Aging reports
- [ ] Export packs: styled XLSX & PDF (cover page, notes)

---

## 8. Compliance & Controls
- [ ] Role-based auth (viewer, bookkeeper, manager, auditor)
- [ ] Period close workflow (status table, lock flag per period)
- [ ] Immutable audit trail + diff viewer UI
- [ ] Two-factor approval for manual journals over configurable threshold

---

## 9. Testing & Quality
- [ ] Unit tests for posting logic (debits=credits, rounding)
- [ ] Integration tests for Plaid webhook → journal creation
- [ ] Cypress e2e for manual transaction UI

---

## 10. Deployment & Docs
- [ ] Migrations applied in staging DB, seed demo data
- [ ] Update README with ledger architecture & API docs
- [ ] Release checklist & change-log

---

End of roadmap – iterate & refine based on user feedback.
