-- Migration 0004: Banking, Statements, Reconciliations, AI Proposals & Exception Items Schema
-- PostgreSQL 16+

-- Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    ledger_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    account_name VARCHAR(150) NOT NULL,
    institution_name VARCHAR(150) NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- CHECKING, SAVINGS, CREDIT_CARD
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    account_number_last4 CHAR(4) NOT NULL,
    current_balance_cents BIGINT NOT NULL DEFAULT 0,
    reconciled_balance_cents BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT chk_bank_account_type CHECK (account_type IN ('CHECKING', 'SAVINGS', 'CREDIT_CARD'))
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant ON bank_accounts (tenant_id, is_active);

-- Bank Statements (Artifacts from CSV or PDF)
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    source_document_id UUID,
    file_name VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    mime_type VARCHAR(100) NOT NULL, -- application/pdf, text/csv
    statement_start_date DATE NOT NULL,
    statement_end_date DATE NOT NULL,
    opening_balance_cents BIGINT NOT NULL,
    closing_balance_cents BIGINT NOT NULL,
    total_debits_cents BIGINT NOT NULL DEFAULT 0,
    total_credits_cents BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED', -- UPLOADED, PROCESSING, PARSED, RECONCILED, FAILED, EXCEPTION
    retry_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_statement_file_hash UNIQUE (tenant_id, file_sha256),
    CONSTRAINT uq_statement_account_period UNIQUE (tenant_id, bank_account_id, statement_start_date, statement_end_date),
    CONSTRAINT chk_statement_dates CHECK (statement_start_date <= statement_end_date),
    CONSTRAINT chk_statement_status CHECK (status IN ('UPLOADED', 'PROCESSING', 'PARSED', 'RECONCILED', 'FAILED', 'EXCEPTION'))
);
CREATE INDEX IF NOT EXISTS idx_bank_statements_lookup ON bank_statements (tenant_id, bank_account_id, status);

-- Bank Transactions (Line items extracted from statements)
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    transaction_date DATE NOT NULL,
    amount_cents BIGINT NOT NULL, -- Negative for debits/withdrawals, positive for deposits/credits
    raw_description VARCHAR(500) NOT NULL,
    normalized_payee VARCHAR(255),
    reference_number VARCHAR(100),
    transaction_hash VARCHAR(64) NOT NULL, -- SHA-256(tenant_id + bank_account_id + date + amount + description)
    status VARCHAR(30) NOT NULL DEFAULT 'UNRECONCILED', -- UNRECONCILED, PROPOSED, MATCHED, RECONCILED, EXCLUDED, FLAGGED
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_transaction_hash UNIQUE (tenant_id, bank_account_id, transaction_hash),
    CONSTRAINT chk_transaction_status CHECK (status IN ('UNRECONCILED', 'PROPOSED', 'MATCHED', 'RECONCILED', 'EXCLUDED', 'FLAGGED'))
);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_tenant_status ON bank_transactions (tenant_id, status, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement ON bank_transactions (bank_statement_id);

-- AI Agent Journal Proposals (Untrusted Advisory Staging Table - ADR-0004)
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
    proposal_type VARCHAR(50) NOT NULL, -- INVOICE_MATCH, VENDOR_PAYMENT, TRANSFER, REFUND, EXPENSE_CLASSIFICATION, REVENUE_CLASSIFICATION, AMBIGUOUS
    debit_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    credit_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL,
    confidence_score NUMERIC(4, 3) NOT NULL, -- e.g. 0.985
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    rationale TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED', -- PROPOSED, APPROVED, REJECTED, MODIFIED
    auto_post_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    posted_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    resolved_by_user_id UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_proposal_amount CHECK (amount_cents > 0),
    CONSTRAINT chk_proposal_confidence CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    CONSTRAINT chk_proposal_status CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'MODIFIED'))
);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant_status ON proposals (tenant_id, status) WHERE status = 'PROPOSED';
CREATE INDEX IF NOT EXISTS idx_proposals_transaction ON proposals (bank_transaction_id);

-- Exception Items (Human-in-the-Loop Triage Center)
CREATE TABLE IF NOT EXISTS exception_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_type VARCHAR(50) NOT NULL, -- STATEMENT, BANK_TRANSACTION, PROPOSAL, INVOICE
    entity_id UUID NOT NULL,
    exception_type VARCHAR(50) NOT NULL, -- DUPLICATE_STATEMENT, DUPLICATE_TRANSACTION, MALFORMED_PDF, MISSING_FIELDS, AMBIGUOUS_TRANSACTION, EXTRACTION_UNCERTAIN, UNMATCHED_PAYMENT, UNRECOGNIZED_VENDOR, AI_TIMEOUT, AI_FAILURE
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
    reason TEXT NOT NULL,
    evidence JSONB DEFAULT '[]'::jsonb,
    proposed_resolution JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, RESOLVED, DISMISSED
    resolved_by_user_id UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_exception_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT chk_exception_status CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED'))
);
CREATE INDEX IF NOT EXISTS idx_exceptions_tenant_open ON exception_items (tenant_id, severity, created_at) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_exceptions_entity ON exception_items (entity_type, entity_id);

-- Reconciled Transactions (Proof of Cleared Bank Line to General Ledger)
CREATE TABLE IF NOT EXISTS reconciled_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    bank_transaction_id UUID NOT NULL UNIQUE REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    reconciliation_method VARCHAR(30) NOT NULL, -- AUTO_HIGH_CONFIDENCE, HUMAN_APPROVED, MANUAL_MATCH
    confidence_score NUMERIC(4, 3),
    reconciled_by_user_id UUID REFERENCES users(id),
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_recon_method CHECK (reconciliation_method IN ('AUTO_HIGH_CONFIDENCE', 'HUMAN_APPROVED', 'MANUAL_MATCH'))
);
CREATE INDEX IF NOT EXISTS idx_reconciled_tx_tenant ON reconciled_transactions (tenant_id, reconciled_at);
CREATE INDEX IF NOT EXISTS idx_reconciled_tx_journal ON reconciled_transactions (journal_entry_id);
