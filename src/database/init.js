const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

const initializeDatabase = async () => {
  try {
    const schemaPath = path.join(__dirname, "schema.sql");

    const schema = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schema);

    // Auto-migrate existing payments and orders tables if missing columns
    await pool.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_image TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS vip_customer_id INTEGER;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS vip_customer_id INTEGER;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_bar_order BOOLEAN DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS bartender_id INTEGER REFERENCES employees(id);
      ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS current_waiter_id INTEGER;
      ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS is_bar_seat BOOLEAN DEFAULT FALSE;
      ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'dining';
      ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS section VARCHAR(50) DEFAULT 'DINING';
      CREATE INDEX IF NOT EXISTS idx_restaurant_tables_bar_seat ON restaurant_tables(is_bar_seat);
      CREATE INDEX IF NOT EXISTS idx_restaurant_tables_type ON restaurant_tables(type);
      CREATE INDEX IF NOT EXISTS idx_orders_bar_order ON orders(is_bar_order);
      CREATE INDEX IF NOT EXISTS idx_orders_bartender_id ON orders(bartender_id);

      -- Auto-backfill existing bar stools and VIP tables
      UPDATE restaurant_tables
      SET is_bar_seat = TRUE, type = 'bar', section = 'BAR'
      WHERE (is_bar_seat IS NOT TRUE OR is_bar_seat IS NULL)
        AND (
          LOWER(table_number) LIKE 'bar%'
          OR LOWER(table_number) LIKE 'b-%'
          OR LOWER(COALESCE(location, '')) LIKE '%bar%'
        );

      UPDATE restaurant_tables
      SET type = 'vip', section = 'VIP'
      WHERE (type IS NULL OR type = 'dining')
        AND (
          LOWER(table_number) LIKE 'vip%'
          OR LOWER(COALESCE(location, '')) LIKE '%vip%'
        );
      ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS portion_ratio NUMERIC(10,4) DEFAULT 1.0000;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS serving_size VARCHAR(50) DEFAULT 'unit';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS shots_capacity INTEGER DEFAULT 30;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_shot_item BOOLEAN DEFAULT FALSE;

      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS cashier_name VARCHAR(150);
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS total_credit_sales NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS total_repayments_cash NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS total_expenses_cash NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS total_refunds_cash NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS total_sales NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS total_orders_count INTEGER DEFAULT 0;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS cashier_notes TEXT;
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS verified_by_name VARCHAR(150);
      ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier_status ON cashier_shifts(cashier_id, status);

      ALTER TABLE payments ADD COLUMN IF NOT EXISTS cashier_shift_id INTEGER REFERENCES cashier_shifts(id) ON DELETE SET NULL;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS split_items JSONB DEFAULT NULL;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid_quantity NUMERIC(12,3) DEFAULT 0;

      -- Backfill paid_quantity for orders that are already fully paid
      UPDATE order_items oi
      SET paid_quantity = oi.quantity
      FROM orders o
      WHERE oi.order_id = o.id
        AND o.payment_status = 'paid'
        AND (oi.paid_quantity IS NULL OR oi.paid_quantity = 0);
      ALTER TABLE customer_repayments ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES users(id);
      ALTER TABLE customer_repayments ADD COLUMN IF NOT EXISTS cashier_shift_id INTEGER REFERENCES cashier_shifts(id) ON DELETE SET NULL;

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

      CREATE TABLE IF NOT EXISTS stock_transfer_items (
        id SERIAL PRIMARY KEY,
        transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity NUMERIC(12,3) NOT NULL,
        notes TEXT
      );

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

      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

      CREATE TABLE IF NOT EXISTS kitchen_stock_audits (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        department VARCHAR(50) NOT NULL DEFAULT 'kitchen',
        action VARCHAR(50) NOT NULL,
        physical_count_found NUMERIC(12,3) DEFAULT 0,
        verified_by UUID REFERENCES users(id),
        verifier_name VARCHAR(150),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_kitchen_stock_audits_product ON kitchen_stock_audits(product_id);
      CREATE INDEX IF NOT EXISTS idx_kitchen_stock_audits_action ON kitchen_stock_audits(action);
      CREATE INDEX IF NOT EXISTS idx_kitchen_stock_audits_created ON kitchen_stock_audits(created_at DESC);

      INSERT INTO roles (name, description)
      VALUES ('fb_controller', 'Food & Beverage Controller / Kitchen Auditor')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO departments (name, description)
      VALUES ('Food & Beverage', 'F&B Cost Control and Kitchen Inventory Audit')
      ON CONFLICT (name) DO NOTHING;
    `);

    // Auto-link missing user_id on employees table
    await pool.query(`
      UPDATE employees e
      SET user_id = u.id
      FROM users u
      WHERE e.user_id IS NULL AND u.id = (
        SELECT u2.id FROM users u2 
        WHERE (LOWER(u2.email) = LOWER(e.email) AND e.email IS NOT NULL AND e.email != '')
           OR (LOWER(u2.username) = LOWER(e.employee_code) AND e.employee_code IS NOT NULL AND e.employee_code != '')
        LIMIT 1
      );
    `);

    // Sync employee role_id with user role_id if they differ
    await pool.query(`
      UPDATE employees e
      SET role_id = u.role_id
      FROM users u
      WHERE e.user_id = u.id AND e.role_id IS DISTINCT FROM u.role_id;
    `);


    // Normalize finance role ID from 480 to 8 and reset roles_id_seq
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM roles WHERE name = 'finance' AND id = 480) THEN
          UPDATE users SET role_id = 8 WHERE role_id = 480;
          UPDATE employees SET role_id = 8 WHERE role_id = 480;
          UPDATE roles SET id = 8 WHERE name = 'finance' AND id = 480;
          PERFORM setval('roles_id_seq', (SELECT MAX(id) FROM roles));
        END IF;
      END $$;
    `);

    // Ensure customizable low_stock_threshold and out_of_stock_threshold columns
    await pool.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(12,2) DEFAULT 5;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS out_of_stock_threshold NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE department_inventory ADD COLUMN IF NOT EXISTS out_of_stock_threshold NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;
      ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS receiving_notes TEXT;

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
    `);

    console.log("✅ Database schema initialized");
  } catch (error) {
    console.error("❌ Failed to initialize database schema");
    console.error(error);

    throw error;
  }
};

module.exports = initializeDatabase;