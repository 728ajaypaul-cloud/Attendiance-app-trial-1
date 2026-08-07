const express = require('express');
const { db } = require('../database');
const bcrypt = require('bcryptjs');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Multer config for profile pictures
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    cb(null, `profile_${req.params.id || Date.now()}_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/employees - List all employees (Admin)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    const { status, role, search } = req.query;
    let query = 'SELECT id, full_name, phone, email, role, roles, employee_type, date_of_joining, status, profile_picture, created_at FROM users WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (role) {
      query += ' AND roles LIKE ?';
      params.push(`%${role}%`);
    }
    if (search) {
      query += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY full_name ASC';
    const employees = db.prepare(query).all(...params);
    res.json({ employees });
  } catch (err) {
    console.error('List employees error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// GET /api/employees/me - Get current logged-in user profile
router.get('/me', authenticate, (req, res) => {
  try {
    const employee = db.prepare(
      'SELECT id, full_name, phone, email, role, roles, employee_type, date_of_joining, status, profile_picture, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ employee });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// GET /api/employees/:id - Get single employee
router.get('/:id', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const employee = db.prepare(
      'SELECT id, full_name, phone, email, role, roles, employee_type, date_of_joining, status, profile_picture, created_at FROM users WHERE id = ?'
    ).get(req.params.id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({ employee });
  } catch (err) {
    console.error('Get employee error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/employees/:id - Update employee (Admin)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const { full_name, phone, email, password, role, roles, employee_type, date_of_joining, status } = req.body;

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (roles !== undefined) updates.roles = roles;
    if (employee_type !== undefined) updates.employee_type = employee_type;
    if (date_of_joining !== undefined) updates.date_of_joining = date_of_joining;
    if (status !== undefined) updates.status = status;
    if (password) {
      updates.password_hash = bcrypt.hashSync(password, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    db.prepare(`UPDATE users SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`).run(...values, req.params.id);

    // Audit log
    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id, 'EMPLOYEE_UPDATED',
      `Updated employee ${existing.full_name}: ${Object.keys(updates).join(', ')}`
    );

    const updated = db.prepare(
      'SELECT id, full_name, phone, email, role, roles, employee_type, date_of_joining, status, profile_picture FROM users WHERE id = ?'
    ).get(req.params.id);

    res.json({ message: 'Employee updated successfully', employee: updated });
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/employees/:id - Deactivate/delete employee (Admin)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const employee = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Soft delete - mark as Inactive to preserve historical data
    db.prepare("UPDATE users SET status = 'Inactive', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id, 'EMPLOYEE_DEACTIVATED',
      `Deactivated employee: ${employee.full_name} (${employee.email})`
    );

    res.json({ message: 'Employee deactivated successfully' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees/:id/profile-picture - Upload profile picture (Admin)
router.post('/:id/profile-picture', authenticate, requireAdmin, upload.single('profile_picture'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    db.prepare('UPDATE users SET profile_picture = ?, updated_at = datetime(\'now\') WHERE id = ?').run(req.file.filename, req.params.id);

    res.json({ message: 'Profile picture uploaded', filename: req.file.filename });
  } catch (err) {
    console.error('Upload profile picture error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/employees/bulk - Bulk actions (Admin)
router.post('/bulk', authenticate, requireAdmin, (req, res) => {
  try {
    const { action, employee_ids } = req.body;
    if (!action || !employee_ids || !Array.isArray(employee_ids)) {
      return res.status(400).json({ error: 'Action and employee_ids array required' });
    }

    if (action === 'activate') {
      const stmt = db.prepare("UPDATE users SET status = 'Active', updated_at = datetime('now') WHERE id = ?");
      for (const id of employee_ids) {
        stmt.run(id);
      }
    } else if (action === 'deactivate') {
      const stmt = db.prepare("UPDATE users SET status = 'Inactive', updated_at = datetime('now') WHERE id = ?");
      for (const id of employee_ids) {
        stmt.run(id);
      }
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "activate" or "deactivate"' });
    }

    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id, 'BULK_' + action.toUpperCase(),
      `${action}d ${employee_ids.length} employees`
    );

    res.json({ message: `Successfully ${action}d ${employee_ids.length} employees` });
  } catch (err) {
    console.error('Bulk action error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
