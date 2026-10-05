-- Migration 0003: Counterparties, Invoices (AR/AP), and Payments Schema
-- PostgreSQL 16+

-- Counterparties (Vendors & Customers)
CREATE TABLE IF NOT EXISTS counterparties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL, -- VENDOR, CUSTOMER, BOTH
    legal_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    tax_identifier VARCHAR(100),
    default_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    payment_terms_days INT NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_counterparties_name UNIQUE (tenant_id, normalized_name),
    CONSTRAINT chk_counterparty_type CHECK (type IN ('VENDOR', 'CUSTOMER', 'BOTH'))
);
CREATE INDEX IF NOT EXISTS idx_counterparties_tenant_type ON counterparties (tenant_id, type);

-- Invoices (Customer Invoices [AR] & Vendor Bills [AP])
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
    source_document_id UUID,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT,
    invoice_type VARCHAR(20) NOT NULL, -- BILL, INVOICE
    invoice_number VARCHAR(100) NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    subtotal_cents BIGINT NOT NULL,
    tax_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL,
    amount_due_cents BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- DRAFT, APPROVED, POSTED, PARTIALLY_PAID, PAID, VOID
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_invoices_tenant_number UNIQUE (tenant_id, counterparty_id, invoice_type, invoice_number),
    CONSTRAINT chk_invoice_type CHECK (invoice_type IN ('BILL', 'INVOICE')),
    CONSTRAINT chk_invoice_status CHECK (status IN ('DRAFT', 'APPROVED', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'VOID')),
    CONSTRAINT chk_invoice_amounts CHECK (total_cents = subtotal_cents + tax_cents AND amount_due_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON invoices (tenant_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_counterparty ON invoices (counterparty_id);

-- Invoice Lines
CREATE TABLE IF NOT EXISTS invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    line_number INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
    unit_cost_cents BIGINT NOT NULL,
    total_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_invoice_lines_num UNIQUE (invoice_id, line_number),
    CONSTRAINT chk_line_quantity_pos CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
    bank_account_id UUID,
    payment_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT,
    payment_type VARCHAR(20) NOT NULL, -- DISBURSEMENT, RECEIPT
    payment_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- ACH, WIRE, CHECK, CREDIT_CARD, CASH
    reference_number VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'CLEARED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_payment_type CHECK (payment_type IN ('DISBURSEMENT', 'RECEIPT')),
    CONSTRAINT chk_payment_amount CHECK (amount_cents > 0),
    CONSTRAINT chk_payment_method CHECK (payment_method IN ('ACH', 'WIRE', 'CHECK', 'CREDIT_CARD', 'CASH'))
);

-- Payment Allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    allocated_amount_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_allocation_amount CHECK (allocated_amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations (payment_id);
