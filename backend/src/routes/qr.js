const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const QRCode = require('qrcode');
const crypto = require('crypto');

const router = express.Router();

// Office WiFi details
const OFFICE_WIFI_SSID = 'Soulful weddings 5G';
const OFFICE_WIFI_PASSWORD = 'aman4747';

// POST /api/qr/generate - Admin: Generate a QR code token for check-in/check-out
router.post('/generate', authenticate, requireAdmin, (req, res) => {
  try {
    const { user_id, action } = req.body; // action: 'checkin' or 'checkout'
    
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action (checkin/checkout) are required' });
    }

    if (!['checkin', 'checkout'].includes(action)) {
      return res.status(400).json({ error: 'action must be "checkin" or "checkout"' });
    }

    // Verify user exists and is in-house editor
    const user = db.prepare('SELECT id, full_name, employee_type FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.employee_type !== 'in-house-editor') {
      return res.status(400).json({ error: 'QR check-in is only for in-house editors' });
    }

    // Generate a unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Store QR session
    db.prepare(
      'INSERT INTO qr_sessions (user_id, token, action, wifi_ssid, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user_id, token, action, OFFICE_WIFI_SSID, expiresAt);

    // Generate QR code as data URL
    // The QR contains: {"token":"...","action":"checkin","wifi":"Soulful weddings 5G","ts":1234567890}
    const qrData = JSON.stringify({
      token,
      action,
      wifi: OFFICE_WIFI_SSID,
      ts: Date.now()
    });

    QRCode.toDataURL(qrData, { 
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: { dark: '#1A1A2E', light: '#FFFFFF' }
    }, (err, url) => {
      if (err) {
        console.error('QR generation error:', err);
        return res.status(500).json({ error: 'Failed to generate QR code' });
      }

      // Audit log
      db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
        req.user.id, 'QR_GENERATED',
        `Generated ${action} QR for ${user.full_name} (${user_id})`
      );

      res.json({
        message: 'QR code generated successfully',
        qrCode: url, // base64 data URL
        token,
        user: { id: user.id, name: user.full_name },
        action,
        wifiSsid: OFFICE_WIFI_SSID,
        expiresAt
      });
    });
  } catch (err) {
    console.error('QR generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/qr/generate-printable - Generate a combined QR that does check-in first scan, check-out second scan
router.post('/generate-printable', authenticate, requireAdmin, (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const user = db.prepare('SELECT id, full_name, employee_type FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.employee_type !== 'in-house-editor') {
      return res.status(400).json({ error: 'QR check-in is only for in-house editors' });
    }

    // Generate a single smart token - first scan = checkin, second scan = checkout
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Store as checkin by default; the system will auto-detect
    db.prepare(
      'INSERT INTO qr_sessions (user_id, token, action, wifi_ssid, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user_id, token, 'checkin', OFFICE_WIFI_SSID, expiresAt);

    // QR data includes a smart flag
    const qrData = JSON.stringify({
      token,
      smart: true,
      wifi: OFFICE_WIFI_SSID,
      ts: Date.now()
    });

    QRCode.toDataURL(qrData, { 
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 600,
      color: { dark: '#1A1A2E', light: '#FFFFFF' }
    }, (err, url) => {
      if (err) {
        console.error('QR generation error:', err);
        return res.status(500).json({ error: 'Failed to generate QR code' });
      }

      db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
        req.user.id, 'QR_PRINTABLE_GENERATED',
        `Generated printable QR for ${user.full_name} (${user_id})`
      );

      res.json({
        message: 'Printable QR code generated',
        qrCode: url,
        user: { id: user.id, name: user.full_name },
        wifiSsid: OFFICE_WIFI_SSID,
        instructions: 'First scan = Check In, Second scan = Check Out. Works only on office WiFi.',
        expiresAt
      });
    });
  } catch (err) {
    console.error('QR generate printable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/qr/scan - Scan a QR code (check-in or check-out)
router.post('/scan', (req, res) => {
  try {
    const { qrData, wifi_ssid, wifi_bssid } = req.body;

    if (!qrData) {
      return res.status(400).json({ error: 'QR data is required' });
    }

    // Parse QR data
    let parsed;
    try {
      parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid QR code format' });
    }

    const { token, smart } = parsed;

    if (!token) {
      return res.status(400).json({ error: 'Invalid QR code: no token' });
    }

    // Verify WiFi - MUST be on office WiFi
    const officeSSID = db.prepare("SELECT value FROM settings WHERE key = 'office_wifi_ssid'").get()?.value || OFFICE_WIFI_SSID;
    
    if (!wifi_ssid || wifi_ssid !== officeSSID) {
      return res.status(403).json({ 
        error: `QR code only works on office WiFi ("${officeSSID}"). Please connect to the office network.`,
        requiredWifi: officeSSID
      });
    }

    // Find the QR session
    const session = db.prepare(
      'SELECT * FROM qr_sessions WHERE token = ? AND used = 0 AND expires_at > datetime("now")'
    ).get(token);

    if (!session) {
      return res.status(400).json({ error: 'QR code expired or already used. Please request a new one from admin.' });
    }

    // Get user info
    const user = db.prepare('SELECT id, full_name, employee_type FROM users WHERE id = ?').get(session.user_id);
    if (!user || user.employee_type !== 'in-house-editor') {
      return res.status(403).json({ error: 'QR check-in is only for in-house editors' });
    }

    const today = new Date().toISOString().split('T')[0];
    const serverTime = new Date().toISOString();

    // Determine action: if smart QR, auto-detect checkin vs checkout
    let action = session.action;
    if (smart) {
      // Check if user has an active session (checked in but not out)
      const activeSession = db.prepare(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
      ).get(user.id, today);

      if (activeSession) {
        action = 'checkout';
      } else {
        action = 'checkin';
      }
    }

    if (action === 'checkin') {
      // Check if already checked in
      const activeSession = db.prepare(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
      ).get(user.id, today);

      if (activeSession) {
        return res.status(400).json({ error: 'Already checked in. Scan QR again to check out.' });
      }

      // Get next session number
      const lastSession = db.prepare(
        'SELECT MAX(session_number) as max_session FROM attendance WHERE user_id = ? AND date = ?'
      ).get(user.id, today);
      const sessionNumber = (lastSession?.max_session || 0) + 1;

      // Record check-in
      const result = db.prepare(
        `INSERT INTO attendance (user_id, date, check_in_time, check_in_method, device_info, session_number, status)
         VALUES (?, ?, ?, 'qr-code', ?, ?, 'Present')`
      ).run(user.id, today, serverTime, JSON.stringify({ wifi_ssid, wifi_bssid }), sessionNumber);

      // Mark QR as used
      db.prepare('UPDATE qr_sessions SET used = 1, scanned_at = datetime("now") WHERE id = ?').run(session.id);

      // Audit
      db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        user.id, 'QR_CHECK_IN', `QR check-in at ${serverTime} via ${wifi_ssid}`, req.ip
      );

      res.json({
        message: `✅ Checked in successfully! Welcome ${user.full_name}`,
        user: { id: user.id, name: user.full_name },
        action: 'checkin',
        time: serverTime,
        date: today
      });

    } else if (action === 'checkout') {
      // Find active session
      const activeSession = db.prepare(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
      ).get(user.id, today);

      if (!activeSession) {
        return res.status(400).json({ error: 'No active check-in found. Scan QR again to check in.' });
      }

      // Calculate duration
      const checkInTime = new Date(activeSession.check_in_time);
      const checkOutTime = new Date(serverTime);
      const diffMs = checkOutTime - checkInTime;
      const totalHours = diffMs / (1000 * 60 * 60);
      const hours = Math.floor(totalHours);
      const minutes = Math.floor((totalHours - hours) * 60);

      // Update check-out
      db.prepare(
        `UPDATE attendance SET check_out_time = ?, device_info = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(serverTime, JSON.stringify({ wifi_ssid, wifi_bssid }), 'Present', activeSession.id);

      // Mark QR as used
      db.prepare('UPDATE qr_sessions SET used = 1, scanned_at = datetime("now") WHERE id = ?').run(session.id);

      // Audit
      db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        user.id, 'QR_CHECK_OUT', `QR check-out at ${serverTime}, worked ${hours}h ${minutes}m`, req.ip
      );

      res.json({
        message: `✅ Checked out successfully! Worked ${hours}h ${minutes}m. Goodbye ${user.full_name}!`,
        user: { id: user.id, name: user.full_name },
        action: 'checkout',
        checkInTime: activeSession.check_in_time,
        checkOutTime: serverTime,
        duration: `${hours}h ${minutes}m`,
        totalHours: totalHours.toFixed(2)
      });
    }
  } catch (err) {
    console.error('QR scan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/qr/sessions - List QR sessions (Admin)
router.get('/sessions', authenticate, requireAdmin, (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT qs.*, u.full_name, u.email
      FROM qr_sessions qs
      JOIN users u ON qs.user_id = u.id
      ORDER BY qs.created_at DESC
      LIMIT 50
    `).all();

    res.json({ sessions });
  } catch (err) {
    console.error('List QR sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/qr/verify-wifi - Verify WiFi connection (for client-side testing)
router.post('/verify-wifi', (req, res) => {
  const { wifi_ssid } = req.body;
  const officeSSID = db.prepare("SELECT value FROM settings WHERE key = 'office_wifi_ssid'").get()?.value || OFFICE_WIFI_SSID;

  if (wifi_ssid === officeSSID) {
    res.json({ valid: true, message: 'Connected to office WiFi' });
  } else {
    res.json({ valid: false, message: `Please connect to "${officeSSID}" WiFi` });
  }
});

module.exports = router;
