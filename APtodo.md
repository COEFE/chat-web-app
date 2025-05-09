# Accounts Payable (AP) Implementation Plan

This document outlines the steps to implement Accounts Payable functionality.

## I. Data Models & Database Migrations

- [ ] **1. Vendors Table (`vendors`)**
  - `id` (PK, SERIAL)
  - `name` (VARCHAR, NOT NULL)
  - `contact_person` (VARCHAR)
  - `email` (VARCHAR)
  - `phone` (VARCHAR)
  - `address` (TEXT)
  - `default_expense_account_id` (FK, INT, references `accounts.id`, NULLABLE) - For pre-filling bill lines
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `is_deleted` (BOOLEAN, DEFAULT FALSE)
  - `deleted_at` (TIMESTAMP WITH TIME ZONE, NULLABLE)

- [ ] **2. Bills Table (`bills`)**
  - `id` (PK, SERIAL)
  - `vendor_id` (FK, INT, references `vendors.id`, NOT NULL)
  - `bill_number` (VARCHAR, NULLABLE) - Vendor's bill number
  - `bill_date` (DATE, NOT NULL)
  - `due_date` (DATE, NOT NULL)
  - `total_amount` (DECIMAL(12, 2), NOT NULL)
  - `amount_paid` (DECIMAL(12, 2), DEFAULT 0.00)
  - `status` (VARCHAR - e.g., 'Draft', 'Open', 'Partially Paid', 'Paid', 'Void')
  - `terms` (VARCHAR, NULLABLE)
  - `memo` (TEXT, NULLABLE)
  - `ap_account_id` (FK, INT, references `accounts.id`, NOT NULL) - AP Control Account
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `is_deleted` (BOOLEAN, DEFAULT FALSE)
  - `deleted_at` (TIMESTAMP WITH TIME ZONE, NULLABLE)

- [ ] **3. Bill Line Items Table (`bill_lines`)**
  - `id` (PK, SERIAL)
  - `bill_id` (FK, INT, references `bills.id`, NOT NULL)
  - `expense_account_id` (FK, INT, references `accounts.id`, NOT NULL)
  - `description` (TEXT, NULLABLE)
  - `quantity` (DECIMAL(10, 2), DEFAULT 1)
  - `unit_price` (DECIMAL(10, 2), NOT NULL)
  - `amount` (DECIMAL(12, 2), NOT NULL) - (quantity * unit_price)
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)

- [ ] **4. Bill Payments Table (`bill_payments`)**
  - `id` (PK, SERIAL)
  - `bill_id` (FK, INT, references `bills.id`, NOT NULL)
  - `payment_date` (DATE, NOT NULL)
  - `amount_paid` (DECIMAL(12, 2), NOT NULL)
  - `payment_account_id` (FK, INT, references `accounts.id`, NOT NULL) - e.g., Bank, Cash
  - `payment_method` (VARCHAR, NULLABLE) - e.g., 'Check', 'Card', 'Transfer'
  - `reference_number` (VARCHAR, NULLABLE) - e.g., Check number
  - `journal_id` (FK, INT, references `journals.id`, NULLABLE) - Journal entry for this payment
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)

- [ ] **5. Create SQL migration files for these tables.**

## II. API Endpoints

- [ ] **1. Vendors API (`/api/vendors`)**
  - `GET /` - List all vendors (with filtering/pagination)
  - `POST /` - Create a new vendor
  - `GET /{id}` - Get a specific vendor
  - `PUT /{id}` - Update a vendor
  - `DELETE /{id}` - Soft delete a vendor

- [ ] **2. Bills API (`/api/bills`)**
  - `GET /` - List all bills (with filtering by status, vendor, due date; pagination)
  - `POST /` - Create a new bill (and its line items)
  - `GET /{id}` - Get a specific bill (with its line items)
  - `PUT /{id}` - Update a bill (and its line items)
  - `DELETE /{id}` - Soft delete/void a bill (consider implications if partially paid)

- [ ] **3. Bill Payments API (`/api/bills/{bill_id}/payments`)**
  - `POST /` - Record a payment for a bill.
    - This should update `bills.amount_paid` and `bills.status`.
    - This should generate a journal entry.
  - `GET /` - List payments for a specific bill (less common, usually part of bill details).

## III. Business Logic & Services

- [ ] **1. Vendor Service:** Logic for CRUD operations, validation.
- [ ] **2. Bill Service:**
  - Logic for creating/updating bills and ensuring `bill_lines` amounts sum up to `bills.total_amount`.
  - Logic for status updates (Open, Partially Paid, Paid) based on payments.
  - Validation rules (e.g., due date cannot be before bill date).
- [ ] **3. Bill Payment Service:**
  - Logic to handle recording payments.
  - **Crucially:** Generate a journal entry for each payment: Debit AP Account, Credit Payment Account (Bank/Cash).
  - Ensure bill status is updated correctly.
  - Handle partial payments.
- [ ] **4. AP Aging Logic:** Function to calculate outstanding amounts grouped by aging buckets (e.g., 0-30, 31-60, 61-90, 90+ days).

## IV. UI Components

- [ ] **1. Vendor Management UI:**
  - List vendors page.
  - Create/Edit vendor form (modal or separate page).
- [ ] **2. Bill Management UI:**
  - List bills page with filters.
  - Create/Edit bill form (including line item entry).
  - View bill details page.
- [ ] **3. Bill Payment UI:**
  - Form/modal to record a payment against a bill.
  - Display payment history on bill details page.
- [ ] **4. AP Aging Report UI:**
  - Page to display AP aging report, possibly with drill-down capabilities.

## V. Integration & General Ledger

- [ ] **1. Chart of Accounts Setup:** Ensure there's a dedicated 'Accounts Payable' liability account.
- [ ] **2. Default Accounts:** Consider system settings for default AP account.
- [ ] **3. Journal Entry Automation:** Double-entry for bill payments must be robust.
  - When a bill is created, the liability (AP) increases and expenses are recorded (debit expense, credit AP). This could be a draft journal or directly impact GL depending on accounting practice chosen.
  - When a bill is paid, AP decreases and cash/bank decreases (debit AP, credit cash/bank).
- [ ] **4. Hooks/Auditing:** Implement appropriate hooks for auditing AP activities.

## VI. Testing

- [ ] Thoroughly test all CRUD operations.
- [ ] Test payment scenarios (full, partial).
- [ ] Verify journal entries generated.
- [ ] Verify AP aging report accuracy.
- [ ] Test error handling and validation.
