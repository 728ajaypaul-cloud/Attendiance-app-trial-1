const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/attendance.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    -- Users / Employees table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Employee',
      roles TEXT DEFAULT 'Photographer',
      employee_type TEXT DEFAULT 'other' CHECK(employee_type IN ('in-house-editor', 'home-editor', 'other')),
      date_of_joining TEXT,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
      profile_picture TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Admin users with permissions
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      permission_level TEXT DEFAULT 'Full Access' CHECK(permission_level IN ('Full Access', 'View-Only', 'Edit Attendance')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Attendance records
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      check_in_method TEXT DEFAULT 'manual' CHECK(check_in_method IN ('manual', 'qr-code')),
      check_in_gps_lat REAL,
      check_in_gps_lng REAL,
      check_out_gps_lat REAL,
      check_out_gps_lng REAL,
      device_info TEXT,
      status TEXT DEFAULT 'Present' CHECK(status IN ('Present', 'Absent', 'Late', 'Half Day', 'On Leave', 'Remote')),
      session_number INTEGER DEFAULT 1,
      override_reason TEXT,
      override_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (override_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- QR code sessions (for in-house editor QR check-in)
    CREATE TABLE IF NOT EXISTS qr_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('checkin', 'checkout')),
      wifi_ssid TEXT NOT NULL,
      wifi_bssid TEXT,
      scanned_at TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Leave records
    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      leave_type TEXT CHECK(leave_type IN ('Sick Leave', 'Vacation', 'Personal Leave', 'Unpaid Leave', 'Other')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      approved_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Settings table
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Session tokens for "remember device"
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      device_info TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Password reset tokens
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
    CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_qr_sessions_token ON qr_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_qr_sessions_user ON qr_sessions(user_id);
  `);

  // Add employee_type column if missing (for existing databases)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN employee_type TEXT DEFAULT 'other'`);
  } catch (e) {
    // Column already exists - ignore
  }
  try {
    db.exec(`ALTER TABLE attendance ADD COLUMN check_in_method TEXT DEFAULT 'manual'`);
  } catch (e) {
    // Column already exists - ignore
  }

  // Insert default settings if not exist
  const defaultSettings = [
    ['working_hours_start', '09:00'],
    ['late_threshold', '09:30'],
    ['half_day_threshold_hours', '4'],
    ['working_days', 'Mon-Fri'],
    ['timezone', 'Asia/Kolkata'],
    ['office_lat', '30.9000'],
    ['office_lng', '75.8500'],
    ['gps_radius_meters', '100'],
    ['gps_enabled', 'false'],
    ['auto_late_after_minutes', '30'],
    ['office_wifi_ssid', 'Soulful weddings 5G'],
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }
}

module.exports = { db, initializeDatabase };
