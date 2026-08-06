const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit - Get audit log (Admin only)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    const { user_id, action, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT a.*, u.full_name as user_name
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      query += ' AND a.user_id = ?';
      params.push(user_id);
    }
    if (action) {
      query += ' AND a.action = ?';
      params.push(action);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const logs = db.prepare(query).all(...params);

    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;

    res.json({ logs, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
