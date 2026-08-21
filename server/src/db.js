import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  fs.chmodSync(DATA_DIR, 0o700);
} catch {}

const db = new Database(path.join(DATA_DIR, "pos.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const MIGRATIONS = [
  {
    version: 1,
    migrate() {
      db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pin_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
        name TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT UNIQUE,
        name_en TEXT NOT NULL,
        name_bn TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
        sale_price REAL NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
        stock REAL NOT NULL DEFAULT 0,
        low_stock_threshold REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name_en);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_day TEXT NOT NULL DEFAULT (date('now')),
        invoice_no TEXT NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bkash','nagad')),
        payment_ref TEXT NOT NULL DEFAULT '',
        cash_received REAL NOT NULL DEFAULT 0,
        change_given REAL NOT NULL DEFAULT 0,
        user_id INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (invoice_day, invoice_no)
      );
      CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_sales_day ON sales(invoice_day);

      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        name TEXT NOT NULL,
        barcode TEXT NOT NULL DEFAULT '',
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

      CREATE TABLE IF NOT EXISTS stock_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id),
        qty REAL NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('purchase','sale','adjustment','opening')),
        ref TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        user_id INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_moves(product_id);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backup_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      `);
    },
  },
  {
    version: 2,
    migrate() {
      db.exec(`
        DROP TABLE IF EXISTS sales;
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_day TEXT NOT NULL DEFAULT (date('now')),
          invoice_no TEXT NOT NULL,
          subtotal REAL NOT NULL DEFAULT 0,
          discount REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bkash','nagad')),
          payment_ref TEXT NOT NULL DEFAULT '',
          cash_received REAL NOT NULL DEFAULT 0,
          change_given REAL NOT NULL DEFAULT 0,
          user_id INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (invoice_day, invoice_no)
        );
        CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
        CREATE INDEX IF NOT EXISTS idx_sales_day ON sales(invoice_day);
      `);
    },
  },
  {
    version: 3,
    migrate() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      const cols = () => db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
      if (!cols().includes("category")) return;
      db.exec(`
        INSERT OR IGNORE INTO categories (name)
          SELECT DISTINCT TRIM(category) FROM products WHERE TRIM(COALESCE(category, '')) <> '';
      `);
      if (!cols().includes("category_id")) {
        db.exec(`ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)`);
      }
      db.exec(`
        UPDATE products SET category_id = (
          SELECT c.id FROM categories c WHERE c.name = TRIM(products.category)
        ) WHERE TRIM(COALESCE(category, '')) <> '';
      `);
      db.exec(`DROP INDEX IF EXISTS idx_products_category`);
      db.exec(`ALTER TABLE products DROP COLUMN category`);
    },
  },
  {
    version: 4,
    migrate() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          token_id TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_id);
      `);
    },
  },
];

function migrate() {
  const current = db.pragma("user_version", { simple: true });
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    m.migrate();
    db.pragma(`user_version = ${m.version}`);
  }
}

migrate();

export function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

export default db;