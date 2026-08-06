const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings - Get all settings (Admin)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings').all();
    const settingsObj = {};
    for (const s of settings) {
      settingsObj[s.key] = s.value;
    }
    res.json({ settings: settingsObj });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/settings - Update settings (Admin)
router.put('/', authenticate, requireAdmin, (req, res) => {
  try {
    const updates = req.body;
    const validKeys = [
      'working_hours_start', 'late_threshold', 'half_day_threshold_hours',
      'working_days', 'timezone', 'office_lat', 'office_lng',
      'gps_radius_meters', 'gps_enabled', 'auto_late_after_minutes'
    ];

    const stmt = db.prepare('UPDATE settings SET value = ?, updated_at = datetime(\'now\') WHERE key = ?');
    const insertStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))');

    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key)) {
        const existing = db.prepare('SELECT id FROM settings WHERE key = ?').get(key);
        if (existing) {
          stmt.run(String(value), key);
        } else {
          insertStmt.run(key, String(value));
        }
      }
    }

    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id, 'SETTINGS_UPDATED',
      `Updated settings: ${Object.keys(updates).filter(k => validKeys.includes(k)).join(', ')}`
    );

    const settings = db.prepare('SELECT key, value FROM settings').all();
    const settingsObj = {};
    for (const s of settings) {
      settingsObj[s.key] = s.value;
    }

    res.json({ message: 'Settings updated successfully', settings: settingsObj });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
