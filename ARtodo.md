# Accounts Receivable (AR) Implementation Plan

This document outlines the steps to implement Accounts Receivable functionality.

## I. Data Models & Database Migrations

- [ ] **1. Customers Table (`customers`)**
  - `id` (PK, SERIAL)
  - `name` (VARCHAR, NOT NULL)
  - `contact_person` (VARCHAR)
  - `email` (VARCHAR)
  - `phone` (VARCHAR)
  - `billing_address` (TEXT)
  - `shipping_address` (TEXT)
  - `default_revenue_account_id` (FK, INT, references `accounts.id`, NULLABLE)
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `is_deleted` (BOOLEAN, DEFAULT FALSE)
  - `deleted_at` (TIMESTAMP WITH TIME ZONE, NULLABLE)

- [ ] **2. Invoices Table (`invoices`)**
  - `id` (PK, SERIAL)
  - `customer_id` (FK, INT, references `customers.id`, NOT NULL)
  - `invoice_number` (VARCHAR, UNIQUE, NOT NULL) - Should be auto-generated or ensure uniqueness
  - `invoice_date` (DATE, NOT NULL)
  - `due_date` (DATE, NOT NULL)
  - `total_amount` (DECIMAL(12, 2), NOT NULL)
  - `amount_paid` (DECIMAL(12, 2), DEFAULT 0.00)
  - `status` (VARCHAR - e.g., 'Draft', 'Sent', 'Partially Paid', 'Paid', 'Void', 'Overdue')
  - `terms` (VARCHAR, NULLABLE)
  - `memo_to_customer` (TEXT, NULLABLE)
  - `ar_account_id` (FK, INT, references `accounts.id`, NOT NULL) - AR Control Account
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `is_deleted` (BOOLEAN, DEFAULT FALSE)
  - `deleted_at` (TIMESTAMP WITH TIME ZONE, NULLABLE)

- [ ] **3. Invoice Line Items Table (`invoice_lines`)**
  - `id` (PK, SERIAL)
  - `invoice_id` (FK, INT, references `invoices.id`, NOT NULL)
  - `product_or_service_id` (FK, INT, NULLABLE) - Link to a future products/services table
  - `revenue_account_id` (FK, INT, references `accounts.id`, NOT NULL)
  - `description` (TEXT, NOT NULL)
  - `quantity` (DECIMAL(10, 2), NOT NULL)
  - `unit_price` (DECIMAL(10, 2), NOT NULL)
  - `amount` (DECIMAL(12, 2), NOT NULL) - (quantity * unit_price)
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)

- [ ] **4. Invoice Payments (Receipts) Table (`invoice_payments`)**
  - `id` (PK, SERIAL)
  - `invoice_id` (FK, INT, references `invoices.id`, NOT NULL)
  - `payment_date` (DATE, NOT NULL)
  - `amount_received` (DECIMAL(12, 2), NOT NULL)
  - `deposit_to_account_id` (FK, INT, references `accounts.id`, NOT NULL) - e.g., Bank, Undeposited Funds
  - `payment_method` (VARCHAR, NULLABLE) - e.g., 'Credit Card', 'Bank Transfer', 'Check'
  - `reference_number` (VARCHAR, NULLABLE) - e.g., Transaction ID, Check number
  - `journal_id` (FK, INT, references `journals.id`, NULLABLE) - Journal entry for this payment
  - `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)
  - `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT CURRENT_TIMESTAMP)

- [ ] **5. Create SQL migration files for these tables.**

## II. API Endpoints

- [ ] **1. Customers API (`/api/customers`)**
  - `GET /` - List all customers (with filtering/pagination)
  - `POST /` - Create a new customer
  - `GET /{id}` - Get a specific customer
  - `PUT /{id}` - Update a customer
  - `DELETE /{id}` - Soft delete a customer

- [ ] **2. Invoices API (`/api/invoices`)**
  - `GET /` - List all invoices (with filtering by status, customer, due date; pagination)
  - `POST /` - Create a new invoice (and its line items)
  - `GET /{id}` - Get a specific invoice (with its line items and payment history)
  - `PUT /{id}` - Update an invoice (and its line items)
  - `DELETE /{id}` - Soft delete/void an invoice (consider implications if partially paid)
  - `POST /{id}/send` - Mark an invoice as sent (optional, for workflow)

- [ ] **3. Invoice Payments API (`/api/invoices/{invoice_id}/payments`)**
  - `POST /` - Record a payment (receipt) for an invoice.
    - This should update `invoices.amount_paid` and `invoices.status`.
    - This should generate a journal entry.
  - `GET /` - List payments for a specific invoice.

## III. Business Logic & Services

- [ ] **1. Customer Service:** Logic for CRUD operations, validation.
- [ ] **2. Invoice Service:**
  - Logic for creating/updating invoices and ensuring `invoice_lines` amounts sum up to `invoices.total_amount`.
  - Auto-generation of unique `invoice_number`.
  - Logic for status updates (Draft, Sent, Partially Paid, Paid, Overdue) based on payments and due dates.
  - Validation rules.
- [ ] **3. Invoice Payment Service:**
  - Logic to handle recording payments.
  - **Crucially:** Generate a journal entry for each payment: Debit Deposit Account (Bank/Undeposited Funds), Credit AR Account.
  - Ensure invoice status is updated correctly.
  - Handle partial payments.
- [ ] **4. AR Aging Logic:** Function to calculate outstanding amounts grouped by aging buckets.
- [ ] **5. (Optional) Automated Reminders:** Logic for sending reminders for due/overdue invoices.

## IV. UI Components

- [ ] **1. Customer Management UI:**
  - List customers page.
  - Create/Edit customer form.
- [ ] **2. Invoice Management UI:**
  - List invoices page with filters.
  - Create/Edit invoice form (including line item entry).
  - View invoice details page (option to print/download PDF).
- [ ] **3. Invoice Payment UI:**
  - Form/modal to record a payment received for an invoice.
  - Display payment history on invoice details page.
- [ ] **4. AR Aging Report UI:**
  - Page to display AR aging report.

## V. Integration & General Ledger

- [ ] **1. Chart of Accounts Setup:** Ensure a dedicated 'Accounts Receivable' asset account.
- [ ] **2. Default Accounts:** System settings for default AR account and potentially default revenue accounts for items.
- [ ] **3. Journal Entry Automation:** 
  - When an invoice is created/sent: Debit AR, Credit Revenue Account(s).
  - When an invoice payment is received: Debit Cash/Bank, Credit AR.
- [ ] **4. Hooks/Auditing:** Implement appropriate hooks for auditing AR activities.

## VI. Testing

- [ ] Thoroughly test all CRUD operations.
- [ ] Test payment scenarios (full, partial).
- ] Verify journal entries generated for invoicing and payments.
- [ ] Verify AR aging report accuracy.
- [ ] Test invoice status updates (e.g., to Overdue).
- [ ] Test error handling and validation.
