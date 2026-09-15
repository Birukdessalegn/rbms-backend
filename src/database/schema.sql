-- ============================================================
-- RBMS - RESTAURANT & BAR MANAGEMENT SYSTEM
-- PostgreSQL Database Schema
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================




-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'user_status'
    ) THEN
        CREATE TYPE user_status AS ENUM (
            'active',
            'inactive',
            'suspended'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'employee_status'
    ) THEN
        CREATE TYPE employee_status AS ENUM (
            'active',
            'inactive',
            'on_leave',
            'terminated'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'attendance_status'
    ) THEN
        CREATE TYPE attendance_status AS ENUM (
            'present',
            'late',
            'absent',
            'on_leave'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'leave_status'
    ) THEN
        CREATE TYPE leave_status AS ENUM (
            'pending',
            'approved',
            'rejected',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'order_status'
    ) THEN
        CREATE TYPE order_status AS ENUM (
            'pending',
            'confirmed',
            'preparing',
            'ready',
            'served',
            'completed',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'payment_status'
    ) THEN
        CREATE TYPE payment_status AS ENUM (
            'pending',
            'paid',
            'partial',
            'refunded',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'expense_status'
    ) THEN
        CREATE TYPE expense_status AS ENUM (
            'pending',
            'paid',
            'cancelled'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'purchase_status'
    ) THEN
        CREATE TYPE purchase_status AS ENUM (
            'draft',
            'ordered',
            'partially_received',
            'received',
            'cancelled'
        );
    END IF;

END $$;


-- ============================================================
-- ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,

    name VARCHAR(50) UNIQUE NOT NULL,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username VARCHAR(100) UNIQUE NOT NULL,

    email VARCHAR(150) UNIQUE,

    password_hash TEXT NOT NULL,

    role_id INTEGER REFERENCES roles(id),

    status user_status DEFAULT 'active',

    last_login TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- DEPARTMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) UNIQUE NOT NULL,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- EMPLOYEES
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,

    employee_code VARCHAR(50) UNIQUE NOT NULL,

    first_name VARCHAR(100) NOT NULL,

    last_name VARCHAR(100) NOT NULL,

    phone VARCHAR(30),

    email VARCHAR(150),

    address TEXT,

    role_id INTEGER REFERENCES roles(id),

    department_id INTEGER REFERENCES departments(id),

    user_id UUID UNIQUE REFERENCES users(id),

    hire_date DATE,

    salary NUMERIC(12,2) DEFAULT 0,

    shift_start_time TIME DEFAULT '18:00',

    shift_end_time TIME DEFAULT '07:00',

    work_hours NUMERIC(4,2) DEFAULT 8.00,

    status employee_status DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SHIFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    start_time TIME NOT NULL,

    end_time TIME NOT NULL,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- EMPLOYEE SHIFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL PRIMARY KEY,

    employee_id INTEGER NOT NULL REFERENCES employees(id)
        ON DELETE CASCADE,

    shift_id INTEGER NOT NULL REFERENCES shifts(id)
        ON DELETE CASCADE,

    shift_date DATE NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(employee_id, shift_date)
);


-- ============================================================
-- ATTENDANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,

    employee_id INTEGER NOT NULL REFERENCES employees(id)
        ON DELETE CASCADE,

    attendance_date DATE NOT NULL,

    check_in TIMESTAMP,

    check_out TIMESTAMP,

    status attendance_status NOT NULL DEFAULT 'absent',

    notes TEXT,

    recorded_by UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(employee_id, attendance_date)
);


-- ============================================================
-- LEAVE TYPES
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_types (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) UNIQUE NOT NULL,

    description TEXT,

    max_days INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- LEAVE REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,

    employee_id INTEGER NOT NULL REFERENCES employees(id)
        ON DELETE CASCADE,

    leave_type_id INTEGER REFERENCES leave_types(id),

    start_date DATE NOT NULL,

    end_date DATE NOT NULL,

    total_days INTEGER NOT NULL,

    reason TEXT,

    status leave_status DEFAULT 'pending',

    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    reviewed_by UUID REFERENCES users(id),

    reviewed_at TIMESTAMP,

    manager_comment TEXT,

    CHECK (end_date >= start_date),

    CHECK (total_days > 0)
);


-- ============================================================
-- PRODUCT CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) UNIQUE NOT NULL,

    description TEXT,

    type VARCHAR(30) DEFAULT 'food',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,

    product_code VARCHAR(50) UNIQUE,

    name VARCHAR(150) NOT NULL,

    category_id INTEGER REFERENCES product_categories(id),

    description TEXT,

    price NUMERIC(12,2) NOT NULL DEFAULT 0,

    cost_price NUMERIC(12,2) DEFAULT 0,

    staff_price NUMERIC(12,2) DEFAULT 0,

    unit VARCHAR(30) DEFAULT 'pcs',

    image_url TEXT,

    is_available BOOLEAN DEFAULT TRUE,

    is_active BOOLEAN DEFAULT TRUE,

    menu_type VARCHAR(30) DEFAULT 'both',

    is_todays_special BOOLEAN DEFAULT FALSE,

    parent_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

    portion_ratio NUMERIC(10,4) DEFAULT 1.0000,

    serving_size VARCHAR(50) DEFAULT 'unit',
    shots_capacity INTEGER DEFAULT 30,
    is_shot_item BOOLEAN DEFAULT FALSE,
    applicable_for VARCHAR(50) DEFAULT 'both',
    tags VARCHAR(255) DEFAULT '',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,

    product_id INTEGER UNIQUE NOT NULL REFERENCES products(id)
        ON DELETE CASCADE,

    quantity NUMERIC(12,3) DEFAULT 0,

    minimum_stock NUMERIC(12,3) DEFAULT 0,

    maximum_stock NUMERIC(12,3),

    unit VARCHAR(30),

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- INVENTORY TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,

    product_id INTEGER NOT NULL REFERENCES products(id),

    transaction_type VARCHAR(50) NOT NULL,

    quantity NUMERIC(12,3) NOT NULL,

    reference_type VARCHAR(50),

    reference_id INTEGER,

    notes TEXT,

    created_by UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,

    supplier_code VARCHAR(50) UNIQUE,

    name VARCHAR(150) NOT NULL,

    contact_person VARCHAR(150),

    phone VARCHAR(30),

    email VARCHAR(150),

    address TEXT,

    tax_number VARCHAR(100),

    status VARCHAR(30) DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- PURCHASE ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,

    purchase_number VARCHAR(50) UNIQUE NOT NULL,

    supplier_id INTEGER REFERENCES suppliers(id),

    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,

    expected_date DATE,

    subtotal NUMERIC(12,2) DEFAULT 0,

    tax NUMERIC(12,2) DEFAULT 0,

    discount NUMERIC(12,2) DEFAULT 0,

    total NUMERIC(12,2) DEFAULT 0,

    status purchase_status DEFAULT 'draft',

    payment_status VARCHAR(30) DEFAULT 'credit',

    payment_method VARCHAR(50) DEFAULT 'cash',

    paid_amount NUMERIC(12,2) DEFAULT 0,

    paid_at TIMESTAMP,

    notes TEXT,

    created_by UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- PURCHASE ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,

    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id)
        ON DELETE CASCADE,

    product_id INTEGER NOT NULL REFERENCES products(id),

    quantity NUMERIC(12,3) NOT NULL,

    unit_price NUMERIC(12,2) NOT NULL,

    total NUMERIC(12,2) NOT NULL,

    received_quantity NUMERIC(12,3) DEFAULT 0
);


-- ============================================================
-- RESTAURANT TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_tables (
    id SERIAL PRIMARY KEY,

    table_number VARCHAR(30) UNIQUE NOT NULL,

    capacity INTEGER DEFAULT 2,

    location VARCHAR(100),

    is_bar_seat BOOLEAN DEFAULT FALSE,

    type VARCHAR(50) DEFAULT 'dining',

    section VARCHAR(50) DEFAULT 'DINING',

    status VARCHAR(30) DEFAULT 'available',

    current_waiter_id INTEGER REFERENCES employees(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,

    customer_code VARCHAR(50) UNIQUE,

    first_name VARCHAR(100),

    last_name VARCHAR(100),

    phone VARCHAR(30),

    email VARCHAR(150),

    address TEXT,

    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- RESERVATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,

    reservation_number VARCHAR(50) UNIQUE NOT NULL,

    customer_id INTEGER REFERENCES customers(id),

    table_id INTEGER REFERENCES restaurant_tables(id),

    reservation_date DATE NOT NULL,

    reservation_time TIME NOT NULL,

    guest_count INTEGER NOT NULL,

    status VARCHAR(30) DEFAULT 'pending',

    notes TEXT,

    created_by UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- POS ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,

    order_number VARCHAR(50) UNIQUE NOT NULL,

    customer_id INTEGER REFERENCES customers(id),

    table_id INTEGER REFERENCES restaurant_tables(id),

    waiter_id INTEGER REFERENCES employees(id),

    order_type VARCHAR(30) DEFAULT 'dine_in',

    subtotal NUMERIC(12,2) DEFAULT 0,

    discount NUMERIC(12,2) DEFAULT 0,

    tax NUMERIC(12,2) DEFAULT 0,

    total NUMERIC(12,2) DEFAULT 0,

    status order_status DEFAULT 'pending',

    payment_status payment_status DEFAULT 'pending',

    vip_customer_id INTEGER,

    is_bar_order BOOLEAN DEFAULT FALSE,

    bartender_id INTEGER REFERENCES employees(id),

    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL REFERENCES orders(id)
        ON DELETE CASCADE,

    product_id INTEGER NOT NULL REFERENCES products(id),

    quantity NUMERIC(12,3) NOT NULL,

    unit_price NUMERIC(12,2) NOT NULL,

    discount NUMERIC(12,2) DEFAULT 0,

    total NUMERIC(12,2) NOT NULL,

    paid_quantity NUMERIC(12,3) DEFAULT 0,

    notes TEXT,

    status order_status DEFAULT 'pending'
);


-- ============================================================
-- KITCHEN ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS kitchen_orders (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL REFERENCES orders(id)
        ON DELETE CASCADE,

    status order_status DEFAULT 'pending',

    started_at TIMESTAMP,

    ready_at TIMESTAMP,

    chef_id INTEGER REFERENCES employees(id),

    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- KITCHEN ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS kitchen_order_items (
    id SERIAL PRIMARY KEY,

    kitchen_order_id INTEGER NOT NULL REFERENCES kitchen_orders(id)
        ON DELETE CASCADE,

    order_item_id INTEGER NOT NULL REFERENCES order_items(id)
        ON DELETE CASCADE,

    quantity NUMERIC(12,3) NOT NULL,

    status order_status DEFAULT 'pending'
);


-- ============================================================
-- BAR ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS bar_orders (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL REFERENCES orders(id)
        ON DELETE CASCADE,

    bartender_id INTEGER REFERENCES employees(id),

    status order_status DEFAULT 'pending',

    started_at TIMESTAMP,

    ready_at TIMESTAMP,

    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- BAR ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS bar_order_items (
    id SERIAL PRIMARY KEY,

    bar_order_id INTEGER NOT NULL REFERENCES bar_orders(id)
        ON DELETE CASCADE,

    order_item_id INTEGER NOT NULL REFERENCES order_items(id)
        ON DELETE CASCADE,

    quantity NUMERIC(12,3) NOT NULL,

    status order_status DEFAULT 'pending'
);


-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL REFERENCES orders(id)
        ON DELETE CASCADE,

    amount NUMERIC(12,2) NOT NULL,

    payment_method VARCHAR(50) NOT NULL,

    reference VARCHAR(100),

    status payment_status DEFAULT 'paid',

    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    received_by UUID REFERENCES users(id),

    image_url TEXT,

    receipt_image TEXT,

    vip_customer_id INTEGER,

    cashier_shift_id INTEGER REFERENCES cashier_shifts(id) ON DELETE SET NULL,

    split_items JSONB DEFAULT NULL
);


-- ============================================================
-- EXPENSE CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) UNIQUE NOT NULL,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,

    expense_number VARCHAR(50) UNIQUE,

    description VARCHAR(255) NOT NULL,

    category_id INTEGER REFERENCES expense_categories(id),

    amount NUMERIC(12,2) NOT NULL,

    payment_method VARCHAR(50),

    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,

    status expense_status DEFAULT 'pending',

    reference VARCHAR(100),

    notes TEXT,

    created_by UUID REFERENCES users(id),

    approved_by UUID REFERENCES users(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- RECURRING EXPENSES (MONTHLY / SCHEDULED BILLS)
-- ============================================================

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES expense_categories(id),
    amount NUMERIC(12,2) NOT NULL,
    frequency VARCHAR(50) DEFAULT 'monthly',
    due_day INTEGER NOT NULL DEFAULT 1,
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    notify_before_days INTEGER DEFAULT 3,
    last_notified_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,

    user_id UUID REFERENCES users(id)
        ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,

    message TEXT NOT NULL,

    type VARCHAR(50),

    reference_type VARCHAR(50),

    reference_id INTEGER,

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,

    user_id UUID REFERENCES users(id),

    action VARCHAR(100) NOT NULL,

    table_name VARCHAR(100),

    record_id INTEGER,

    old_data JSONB,

    new_data JSONB,

    ip_address INET,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- DEFAULT ROLES
-- ============================================================

INSERT INTO roles (name, description)
VALUES
    ('admin', 'System administrator'),
    ('manager', 'Restaurant manager'),
    ('hr', 'Human resources officer'),
    ('finance', 'Finance officer and cashier auditor'), 
    ('cashier', 'Cashier'),
    ('waiter', 'Waiter'),
    ('chef', 'Kitchen staff'),
    ('bartender', 'Bar staff'),
    ('fb_controller', 'Food & Beverage Controller / Kitchen Auditor')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- DEFAULT DEPARTMENTS
-- ============================================================

INSERT INTO departments (name, description)
VALUES
    ('Management', 'Restaurant management'),
    ('Human Resources', 'Human resources department'),
    ('Service', 'Waiters and service staff'),
    ('Kitchen', 'Kitchen and cooking staff'),
    ('Bar', 'Bar staff'),
    ('Finance', 'Finance and cashier staff'),
    ('Administration', 'Administrative staff'),
    ('Food & Beverage', 'F&B Cost Control and Kitchen Inventory Audit')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- KITCHEN STOCK AUDITS & OUT-OF-STOCK VERIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS kitchen_stock_audits (
    id SERIAL PRIMARY KEY,

    product_id INTEGER NOT NULL REFERENCES products(id)
        ON DELETE CASCADE,

    department VARCHAR(50) NOT NULL DEFAULT 'kitchen',

    action VARCHAR(50) NOT NULL, -- 'approved_depleted', 'rejected_stock_found', 'verified_in_stock'

    physical_count_found NUMERIC(12,3) DEFAULT 0,

    verified_by UUID REFERENCES users(id),

    verifier_name VARCHAR(150),

    notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kitchen_stock_audits_product ON kitchen_stock_audits(product_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_stock_audits_action ON kitchen_stock_audits(action);
CREATE INDEX IF NOT EXISTS idx_kitchen_stock_audits_created ON kitchen_stock_audits(created_at DESC);


-- ============================================================
-- DEFAULT SHIFTS
-- ============================================================

INSERT INTO shifts (name, start_time, end_time, description)
VALUES
    ('Morning Shift', '08:00', '16:00', 'Morning working shift'),
    ('Day Shift', '09:00', '17:00', 'Day working shift'),
    ('Evening Shift', '16:00', '00:00', 'Evening working shift'),
    ('Night Shift', '18:00', '02:00', 'Night working shift')
ON CONFLICT DO NOTHING;


-- ============================================================
-- DEFAULT LEAVE TYPES
-- ============================================================

INSERT INTO leave_types (name, description, max_days)
VALUES
    ('Annual Leave', 'Regular annual employee leave', 30),
    ('Sick Leave', 'Leave due to illness', 30),
    ('Emergency Leave', 'Emergency personal leave', 10),
    ('Maternity Leave', 'Maternity leave', 90),
    ('Paternity Leave', 'Paternity leave', 10),
    ('Unpaid Leave', 'Leave without salary', 30)
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- DEFAULT PRODUCT CATEGORIES
-- ============================================================

INSERT INTO product_categories (name, description, type)
VALUES
    ('Food', 'Restaurant food items', 'food'),
    ('Fruit', 'Fresh fruit items', 'food'),
    ('Beverages', 'Non-alcoholic beverages', 'beverage'),
    ('Bar', 'Bar products', 'bar'),
    ('Kitchen Supplies', 'Kitchen supplies', 'supply'),
    ('Other', 'Other products', 'other')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- DEFAULT EXPENSE CATEGORIES
-- ============================================================

INSERT INTO expense_categories (name, description)
VALUES
    ('Utilities', 'Electricity, water and utility bills'),
    ('Salaries & Wages', 'Employee salaries and wages'),
    ('Cleaning & Supplies', 'Cleaning materials and supplies'),
    ('Maintenance', 'Equipment and building maintenance'),
    ('Transportation', 'Transportation expenses'),
    ('Marketing', 'Marketing and advertising'),
    ('Rent', 'Property rent'),
    ('Taxes & Fees', 'Taxes and government fees'),
    ('Kitchen', 'Kitchen-related expenses'),
    ('Bar', 'Bar-related expenses'),
    ('Other', 'Other business expenses')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_employees_department
ON employees(department_id);

CREATE INDEX IF NOT EXISTS idx_employees_status
ON employees(status);

CREATE INDEX IF NOT EXISTS idx_attendance_date
ON attendance(attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_employee
ON attendance(employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_employee
ON leave_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_status
ON leave_requests(status);

CREATE INDEX IF NOT EXISTS idx_leave_dates
ON leave_requests(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_products_category
ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_products_menu_type
ON products(menu_type);

CREATE INDEX IF NOT EXISTS idx_inventory_product
ON inventory(product_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_date
ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_supplier
ON purchase_orders(supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_status
ON purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_expenses_date
ON expenses(expense_date);

CREATE INDEX IF NOT EXISTS idx_expenses_category
ON expenses(category_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(user_id, is_read);


-- ============================================================
-- CASHIER SHIFTS & RECONCILIATION
-- ============================================================

CREATE TABLE IF NOT EXISTS cashier_shifts (
    id SERIAL PRIMARY KEY,

    cashier_id UUID NOT NULL REFERENCES users(id)
        ON DELETE CASCADE,

    cashier_name VARCHAR(150),

    terminal_id INTEGER DEFAULT 1,

    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    end_time TIMESTAMP,

    opening_cash NUMERIC(12,2) DEFAULT 0.00,

    expected_cash NUMERIC(12,2) DEFAULT 0.00,

    actual_cash NUMERIC(12,2) DEFAULT 0.00,

    shortage_overage NUMERIC(12,2) DEFAULT 0.00,

    total_card_sales NUMERIC(12,2) DEFAULT 0.00,

    total_mobile_sales NUMERIC(12,2) DEFAULT 0.00,

    total_credit_sales NUMERIC(12,2) DEFAULT 0.00,

    total_repayments_cash NUMERIC(12,2) DEFAULT 0.00,

    total_expenses_cash NUMERIC(12,2) DEFAULT 0.00,

    total_refunds_cash NUMERIC(12,2) DEFAULT 0.00,

    total_sales NUMERIC(12,2) DEFAULT 0.00,

    total_orders_count INTEGER DEFAULT 0,

    status VARCHAR(30) DEFAULT 'open',

    cashier_notes TEXT,

    verified_by UUID REFERENCES users(id),

    verified_by_name VARCHAR(150),

    verified_at TIMESTAMP,

    verification_notes TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_status
ON cashier_shifts(status);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier
ON cashier_shifts(cashier_id);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier_status
ON cashier_shifts(cashier_id, status);


-- ============================================================
-- VIP CUSTOMERS & REPAYMENTS
-- ============================================================

-- 1. VIP / Credit Customer Directory Table
CREATE TABLE IF NOT EXISTS vip_customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL UNIQUE,
    tier VARCHAR(50) DEFAULT 'Gold VIP',
    credit_limit NUMERIC(12, 2) DEFAULT 10000.00,
    current_debt NUMERIC(12, 2) DEFAULT 0.00,
    company VARCHAR(255),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Repayment Transactions History Table
CREATE TABLE IF NOT EXISTS customer_repayments (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES vip_customers(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'cash',
    reference VARCHAR(255),
    notes TEXT,
    received_by UUID REFERENCES users(id),
    cashier_shift_id INTEGER REFERENCES cashier_shifts(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- DEPARTMENT INVENTORY (OUTLET SUB-STORES: BAR & KITCHEN)
-- ============================================================

CREATE TABLE IF NOT EXISTS department_inventory (
    id SERIAL PRIMARY KEY,
    department VARCHAR(50) NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    minimum_stock NUMERIC(12,3) NOT NULL DEFAULT 5,
    maximum_stock NUMERIC(12,3),
    unit VARCHAR(30) DEFAULT 'pcs',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department, product_id)
);

CREATE INDEX IF NOT EXISTS idx_dept_inv_dept ON department_inventory(department);
CREATE INDEX IF NOT EXISTS idx_dept_inv_product ON department_inventory(product_id);


-- ============================================================
-- STOCK TRANSFERS (INTERNAL REQUISITIONS & TRANSFERS)
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_transfers (
    id SERIAL PRIMARY KEY,
    transfer_number VARCHAR(50) UNIQUE NOT NULL,
    from_location VARCHAR(50) NOT NULL DEFAULT 'main',
    to_location VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    requested_by UUID REFERENCES users(id),
    dispatched_by UUID REFERENCES users(id),
    received_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_locations ON stock_transfers(from_location, to_location);


-- ============================================================
-- STOCK TRANSFER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id SERIAL PRIMARY KEY,
    transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity NUMERIC(12,3) NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON stock_transfer_items(transfer_id);


-- ============================================================
-- DEPARTMENT INVENTORY TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS department_inventory_transactions (
    id SERIAL PRIMARY KEY,
    department VARCHAR(50) NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    transaction_type VARCHAR(50) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dept_tx_dept_prod ON department_inventory_transactions(department, product_id);


-- ============================================================
-- PAYROLL RUNS & ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
    id SERIAL PRIMARY KEY,
    period_month VARCHAR(7) UNIQUE NOT NULL, -- e.g. '2026-09'
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_gross NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_net NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'preview', -- 'preview', 'approved', 'paid', 'cancelled'
    processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs(period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);

CREATE TABLE IF NOT EXISTS payroll_items (
    id SERIAL PRIMARY KEY,
    payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    base_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    allowances NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    overtime NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    bonuses NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gross_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    days_worked NUMERIC(5,1) NOT NULL DEFAULT 0.0,
    days_absent NUMERIC(5,1) NOT NULL DEFAULT 0.0,
    absence_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pension_employee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pension_employer NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    income_tax NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00, -- backward-compat alias
    net_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_items_emp ON payroll_items(employee_id);


-- ============================================================
-- FINISHED
-- ============================================================

SELECT 'RBMS database schema created successfully!' AS message;
