-- Migration: 0005_payroll_and_inventory.sql
-- Description: Deterministic Payroll (employees, compensation, runs, payslips) and Inventory (products, stock batches, movements, COGS)

-- =========================================================================
-- DOMAIN: PAYROLL
-- =========================================================================

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    ssn_last4 CHAR(4) NOT NULL,
    department VARCHAR(100) NOT NULL DEFAULT 'General',
    job_title VARCHAR(100) NOT NULL,
    pay_type VARCHAR(20) NOT NULL, -- SALARY, HOURLY
    rate_cents BIGINT NOT NULL, -- Annual salary in cents or hourly rate in cents
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, TERMINATED, LEAVE
    hire_date DATE NOT NULL,
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_employees_tenant_email UNIQUE (tenant_id, email),
    CONSTRAINT chk_pay_type CHECK (pay_type IN ('SALARY', 'HOURLY')),
    CONSTRAINT chk_rate_positive CHECK (rate_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant_status ON employees (tenant_id, status);

CREATE TABLE IF NOT EXISTS employee_compensation_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    pay_periods_per_year INT NOT NULL DEFAULT 24, -- 12 (Monthly), 24 (Semi-monthly), 26 (Bi-weekly), 52 (Weekly)
    tax_withholding_rate_basis_points INT NOT NULL DEFAULT 1500, -- e.g. 1500 = 15.00%
    standard_deduction_cents BIGINT NOT NULL DEFAULT 0, -- e.g. health benefits fixed cents
    retirement_contribution_rate_basis_points INT NOT NULL DEFAULT 0, -- e.g. 500 = 5.00%
    direct_deposit_account_last4 CHAR(4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_employee_compensation UNIQUE (tenant_id, employee_id),
    CONSTRAINT chk_periods_per_year CHECK (pay_periods_per_year IN (12, 24, 26, 52)),
    CONSTRAINT chk_tax_rate CHECK (tax_withholding_rate_basis_points >= 0 AND tax_withholding_rate_basis_points <= 10000),
    CONSTRAINT chk_retirement_rate CHECK (retirement_contribution_rate_basis_points >= 0 AND retirement_contribution_rate_basis_points <= 10000)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    accounting_period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT,
    run_number VARCHAR(50) NOT NULL,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    payment_date DATE NOT NULL,
    total_gross_cents BIGINT NOT NULL DEFAULT 0,
    total_tax_cents BIGINT NOT NULL DEFAULT 0,
    total_deductions_cents BIGINT NOT NULL DEFAULT 0,
    total_net_cents BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- DRAFT, AWAITING_APPROVAL, APPROVED, POSTED, CANCELLED
    approved_by_user_id UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_payroll_period UNIQUE (tenant_id, pay_period_start, pay_period_end),
    CONSTRAINT chk_payroll_dates CHECK (pay_period_start <= pay_period_end),
    CONSTRAINT chk_payroll_balance CHECK (total_gross_cents = total_net_cents + total_tax_cents + total_deductions_cents)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_period ON payroll_runs (tenant_id, pay_period_start, pay_period_end);

CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    hours_worked NUMERIC(6, 2) DEFAULT 0,
    gross_pay_cents BIGINT NOT NULL,
    tax_withholdings_cents BIGINT NOT NULL,
    deductions_cents BIGINT NOT NULL,
    net_pay_cents BIGINT NOT NULL,
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_payroll_item UNIQUE (payroll_run_id, employee_id),
    CONSTRAINT chk_item_math CHECK (gross_pay_cents = net_pay_cents + tax_withholdings_cents + deductions_cents),
    CONSTRAINT chk_net_non_negative CHECK (net_pay_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items (tenant_id, employee_id);

-- =========================================================================
-- DOMAIN: INVENTORY
-- =========================================================================

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'UNIT', -- UNIT, KG, LITER, BOX, PACK
    valuation_method VARCHAR(20) NOT NULL DEFAULT 'FIFO', -- FIFO, WAV
    inventory_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    cogs_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    sales_account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    low_stock_threshold INT NOT NULL DEFAULT 5,
    reorder_quantity INT NOT NULL DEFAULT 20,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    version INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_products_tenant_sku UNIQUE (tenant_id, sku),
    CONSTRAINT chk_valuation_method CHECK (valuation_method IN ('FIFO', 'WAV')),
    CONSTRAINT chk_low_stock_threshold CHECK (low_stock_threshold >= 0)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_sku ON products (tenant_id, sku);

CREATE TABLE IF NOT EXISTS stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_reference VARCHAR(100) NOT NULL,
    received_date DATE NOT NULL,
    original_quantity INT NOT NULL,
    remaining_quantity INT NOT NULL,
    unit_cost_cents BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_batch_non_negative CHECK (remaining_quantity >= 0 AND remaining_quantity <= original_quantity),
    CONSTRAINT chk_batch_cost_positive CHECK (unit_cost_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo ON stock_batches (tenant_id, product_id, received_date ASC) WHERE remaining_quantity > 0;

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    stock_batch_id UUID REFERENCES stock_batches(id) ON DELETE RESTRICT,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE RESTRICT,
    movement_type VARCHAR(30) NOT NULL, -- INFLOW_PURCHASE, OUTFLOW_SALE, ADJUSTMENT_WRITE_OFF, ADJUSTMENT_RECOUNT
    quantity INT NOT NULL, -- positive for inflow, negative for outflow
    unit_cost_cents BIGINT NOT NULL,
    total_cost_cents BIGINT NOT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (tenant_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    alert_type VARCHAR(30) NOT NULL, -- LOW_STOCK, OUT_OF_STOCK
    current_quantity INT NOT NULL,
    threshold_quantity INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, RESOLVED, DISMISSED
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_open ON inventory_alerts (tenant_id, status) WHERE status = 'OPEN';
