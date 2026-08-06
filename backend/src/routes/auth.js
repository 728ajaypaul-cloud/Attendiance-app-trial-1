const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// POST /api/auth/register - Admin only, register new employee
router.post('/register', (req, res) => {
  try {
    const { full_name, phone, email, password, role, roles, date_of_joining, is_admin, permission_level } = req.body;

    if (!full_name || !phone || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields: full_name, phone, email, password' });
    }

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR phone = ?').get(email, phone);
    if (existing) {
      return res.status(409).json({ error: 'User with this email or phone already exists' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const userRole = is_admin ? 'Admin' : 'Employee';

    const result = db.prepare(
      `INSERT INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`
    ).run(full_name, phone, email, password_hash, userRole, roles || 'Photographer', date_of_joining || null);

    if (is_admin) {
      db.prepare('INSERT INTO admins (user_id, permission_level) VALUES (?, ?)').run(result.lastInsertRowid, permission_level || 'Full Access');
    }

    const user = db.prepare('SELECT id, full_name, phone, email, role, roles, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Audit log
    db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user?.id || result.lastInsertRowid,
      'USER_REGISTERED',
      `Registered user: ${full_name} (${email})`
    );

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, phone, password, remember_device, device_info } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    let user;
    if (email) {
      user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'Active');
    } else {
      user = db.prepare('SELECT * FROM users WHERE phone = ? AND status = ?').get(phone, 'Active');
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials or account inactive' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // If remember_device, store session token
    if (remember_device) {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (user_id, token, device_info, expires_at) VALUES (?, ?, ?, ?)').run(
        user.id, refreshToken, device_info || null, expiresAt
      );
    }

    // Audit log
    db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
      user.id, 'LOGIN', 'User logged in', req.ip
    );

    res.json({
      token,
      refreshToken: remember_device ? refreshToken : undefined,
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        roles: user.roles,
        profile_picture: user.profile_picture,
        date_of_joining: user.date_of_joining,
        status: user.status
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Check if session exists
    const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")').get(refreshToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?').get(session.user_id, 'Active');
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const newToken = generateToken(user);
    res.json({ token: newToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

    // In production, send email via nodemailer
    // For now, return the token in response (dev mode)
    console.log(`Password reset token for ${email}: ${token}`);

    res.json({ message: 'If the email exists, a reset link has been sent.', resetToken: token });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime("now")').get(token);
    if (!reset) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const password_hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(refreshToken);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
