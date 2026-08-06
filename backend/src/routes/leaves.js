const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/leaves - Mark leave (Admin)
router.post('/', authenticate, requireAdmin, (req, res) => {
  try {
    const { user_id, leave_type, start_date, end_date, reason } = req.body;

    if (!user_id || !leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'user_id, leave_type, start_date, end_date required' });
    }

    const validTypes = ['Sick Leave', 'Vacation', 'Personal Leave', 'Unpaid Leave', 'Other'];
    if (!validTypes.includes(leave_type)) {
      return res.status(400).json({ error: `Invalid leave type. Must be one of: ${validTypes.join(', ')}` });
    }

    const result = db.prepare(
      `INSERT INTO leaves (user_id, leave_type, start_date, end_date, reason, approved_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(user_id, leave_type, start_date, end_date, reason || null, req.user.id);

    const user = db.prepare('SELECT full_name FROM users WHERE id = ?').get(user_id);

    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id, 'LEAVE_MARKED',
      `Marked ${user?.full_name} on ${leave_type} from ${start_date} to ${end_date}`
    );

    res.status(201).json({ message: 'Leave recorded successfully', id: result.lastInsertRowid });
  } catch (err) {
    console.error('Create leave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leaves - Get leaves (Admin or self)
router.get('/', authenticate, (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;

    let query = `
      SELECT l.*, u.full_name, u.roles
      FROM leaves l
      JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      query += ' AND l.user_id = ?';
      params.push(user_id);
    }
    if (start_date) {
      query += ' AND l.start_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND l.end_date <= ?';
      params.push(end_date);
    }

    // Non-admin can only see own leaves
    if (req.user.role !== 'Admin' && !user_id) {
      query += ' AND l.user_id = ?';
      params.push(req.user.id);
    } else if (req.user.role !== 'Admin' && user_id != req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    query += ' ORDER BY l.start_date DESC';

    const leaves = db.prepare(query).all(...params);
    res.json({ leaves });
  } catch (err) {
    console.error('Get leaves error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/leaves/:id - Delete leave (Admin)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
    if (!leave) {
      return res.status(404).json({ error: 'Leave record not found' });
    }

    db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);

    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id, 'LEAVE_DELETED',
      `Deleted leave record #${req.params.id}`
    );

    res.json({ message: 'Leave record deleted' });
  } catch (err) {
    console.error('Delete leave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
