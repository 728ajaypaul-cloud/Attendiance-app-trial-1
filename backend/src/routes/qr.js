const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const QRCode = require('qrcode');
const crypto = require('crypto');

const router = express.Router();

const OFFICE_WIFI_SSID = 'Soulful weddings 5G';

// POST /api/qr/generate-universal - Generate ONE QR for ALL in-house editors
router.post('/generate-universal', authenticate, requireAdmin, (req, res) => {
  try {
    // Count in-house editors
    const editors = db.prepare("SELECT id, full_name FROM users WHERE employee_type = 'in-house-editor' AND status = 'Active'").all();
    
    if (editors.length === 0) {
      return res.status(400).json({ error: 'No active in-house editors found. Set employee type first.' });
    }

    // Generate a single universal token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Store as universal QR (user_id = 0 means universal)
    db.prepare(
      'INSERT INTO qr_sessions (user_id, token, action, wifi_ssid, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(1, token, 'checkin', OFFICE_WIFI_SSID, expiresAt);

    const qrData = JSON.stringify({
      token,
      universal: true,
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
        req.user.id, 'QR_UNIVERSAL_GENERATED',
        `Generated universal QR for ${editors.length} in-house editors`
      );

      res.json({
        message: `Universal QR generated for ${editors.length} in-house editors`,
        qrCode: url,
        editors: editors.map(e => ({ id: e.id, name: e.full_name })),
        wifiSsid: OFFICE_WIFI_SSID,
        instructions: 'One QR for all in-house editors. First scan = Check In, Second scan = Check Out.',
        expiresAt
      });
    });
  } catch (err) {
    console.error('QR universal generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/qr/scan - Scan a QR code (check-in or check-out) - UPDATED for universal
router.post('/scan', (req, res) => {
  try {
    const { qrData, wifi_ssid, wifi_bssid, user_id } = req.body;

    if (!qrData) {
      return res.status(400).json({ error: 'QR data is required' });
    }

    let parsed;
    try {
      parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid QR code format' });
    }

    const { token, universal } = parsed;

    if (!token) {
      return res.status(400).json({ error: 'Invalid QR code: no token' });
    }

    // Verify WiFi
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

    // For universal QR, we need to identify who is scanning
    // The scanner app sends the logged-in user's ID
    let targetUserId;
    
    if (universal || session.user_id === 1) {
      if (!user_id) {
        return res.status(400).json({ error: 'Please login and scan again to identify yourself.' });
      }
      targetUserId = user_id;
    } else {
      targetUserId = session.user_id;
    }

    const user = db.prepare('SELECT id, full_name, employee_type FROM users WHERE id = ?').get(targetUserId);
    if (!user || user.employee_type !== 'in-house-editor') {
      return res.status(403).json({ error: 'QR check-in is only for in-house editors' });
    }

    const today = new Date().toISOString().split('T')[0];
    const serverTime = new Date().toISOString();

    // Auto-detect checkin vs checkout
    const activeSession = db.prepare(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
    ).get(user.id, today);

    const action = activeSession ? 'checkout' : 'checkin';

    if (action === 'checkin') {
      if (activeSession) {
        return res.status(400).json({ error: 'Already checked in. Scan QR again to check out.' });
      }

      const lastSession = db.prepare(
        'SELECT MAX(session_number) as max_session FROM attendance WHERE user_id = ? AND date = ?'
      ).get(user.id, today);
      const sessionNumber = (lastSession?.max_session || 0) + 1;

      const result = db.prepare(
        `INSERT INTO attendance (user_id, date, check_in_time, check_in_method, device_info, session_number, status)
         VALUES (?, ?, ?, 'qr-code', ?, ?, 'Present')`
      ).run(user.id, today, serverTime, JSON.stringify({ wifi_ssid, wifi_bssid }), sessionNumber);

      db.prepare('UPDATE qr_sessions SET used = 1, scanned_at = datetime("now") WHERE id = ?').run(session.id);

      db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        user.id, 'QR_CHECK_IN', `QR check-in at ${serverTime} via ${wifi_ssid}`, req.ip
      );

      res.json({
        message: `✅ Checked in! Welcome ${user.full_name}`,
        user: { id: user.id, name: user.full_name },
        action: 'checkin',
        time: serverTime,
        date: today
      });

    } else if (action === 'checkout') {
      if (!activeSession) {
        return res.status(400).json({ error: 'No active check-in found. Scan QR again to check in.' });
      }

      const checkInTime = new Date(activeSession.check_in_time);
      const checkOutTime = new Date(serverTime);
      const diffMs = checkOutTime - checkInTime;
      const totalHours = diffMs / (1000 * 60 * 60);
      const hours = Math.floor(totalHours);
      const minutes = Math.floor((totalHours - hours) * 60);

      db.prepare(
        `UPDATE attendance SET check_out_time = ?, device_info = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(serverTime, JSON.stringify({ wifi_ssid, wifi_bssid }), 'Present', activeSession.id);

      db.prepare('UPDATE qr_sessions SET used = 1, scanned_at = datetime("now") WHERE id = ?').run(session.id);

      db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        user.id, 'QR_CHECK_OUT', `QR check-out at ${serverTime}, worked ${hours}h ${minutes}m`, req.ip
      );

      res.json({
        message: `✅ Checked out! Worked ${hours}h ${minutes}m. Goodbye ${user.full_name}!`,
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

// POST /api/qr/generate-printable - Keep for backward compatibility
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

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO qr_sessions (user_id, token, action, wifi_ssid, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user_id, token, 'checkin', OFFICE_WIFI_SSID, expiresAt);

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

// POST /api/qr/generate - Keep for backward compatibility
router.post('/generate', authenticate, requireAdmin, (req, res) => {
  try {
    const { user_id, action } = req.body;
    
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action (checkin/checkout) are required' });
    }

    if (!['checkin', 'checkout'].includes(action)) {
      return res.status(400).json({ error: 'action must be "checkin" or "checkout"' });
    }

    const user = db.prepare('SELECT id, full_name, employee_type FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.employee_type !== 'in-house-editor') {
      return res.status(400).json({ error: 'QR check-in is only for in-house editors' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO qr_sessions (user_id, token, action, wifi_ssid, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user_id, token, action, OFFICE_WIFI_SSID, expiresAt);

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

      db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
        req.user.id, 'QR_GENERATED',
        `Generated ${action} QR for ${user.full_name} (${user_id})`
      );

      res.json({
        message: 'QR code generated successfully',
        qrCode: url,
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

// GET /api/qr/sessions - List QR sessions (Admin)
router.get('/sessions', authenticate, requireAdmin, (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT qs.*, u.full_name, u.email
      FROM qr_sessions qs
      LEFT JOIN users u ON qs.user_id = u.id
      ORDER BY qs.created_at DESC
      LIMIT 50
    `).all();

    res.json({ sessions });
  } catch (err) {
    console.error('List QR sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/qr/verify-wifi - Verify WiFi connection
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
