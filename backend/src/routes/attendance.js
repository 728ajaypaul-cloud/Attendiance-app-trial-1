const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Helper: get current server time in IST
function getServerTime() {
  return new Date().toISOString();
}

// Helper: get today's date as YYYY-MM-DD
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Helper: calculate status based on check-in time and settings
function calculateStatus(checkInTime, totalHours) {
  const settings = {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  const lateThreshold = settings.late_threshold || '09:30';
  const halfDayThreshold = parseFloat(settings.half_day_threshold_hours || '4');

  // Parse check-in time
  const checkInDate = new Date(checkInTime);
  const checkInHours = checkInDate.getHours().toString().padStart(2, '0');
  const checkInMinutes = checkInDate.getMinutes().toString().padStart(2, '0');
  const checkInStr = `${checkInHours}:${checkInMinutes}`;

  // Compare with late threshold
  if (checkInStr > lateThreshold) {
    return 'Late';
  }

  // Check total hours for half day
  if (totalHours !== null && totalHours < halfDayThreshold) {
    return 'Half Day';
  }

  return 'Present';
}

// POST /api/attendance/checkin - Employee check-in
router.post('/checkin', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const { gps_lat, gps_lng, device_info } = req.body;
    const today = getTodayDate();
    const serverTime = getServerTime();

    // Check if already checked in today (without checkout for that session)
    const activeSession = db.prepare(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
    ).get(userId, today);

    if (activeSession) {
      return res.status(400).json({
        error: 'Already checked in. Please check out first.',
        activeCheckIn: activeSession.check_in_time
      });
    }

    // Get the next session number
    const lastSession = db.prepare(
      'SELECT MAX(session_number) as max_session FROM attendance WHERE user_id = ? AND date = ?'
    ).get(userId, today);
    const sessionNumber = (lastSession?.max_session || 0) + 1;

    // Insert check-in record
    const result = db.prepare(
      `INSERT INTO attendance (user_id, date, check_in_time, check_in_gps_lat, check_in_gps_lng, device_info, session_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Present')`
    ).run(userId, today, serverTime, gps_lat || null, gps_lng || null, device_info || null, sessionNumber);

    // Calculate elapsed time since check-in
    const elapsed = Date.now() - new Date(serverTime).getTime();
    const elapsedMinutes = Math.floor(elapsed / 60000);
    const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);

    // Audit log
    db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
      userId, 'CHECK_IN', `Checked in at ${serverTime}`, req.ip
    );

    res.status(201).json({
      message: 'Checked in successfully',
      checkIn: {
        id: result.lastInsertRowid,
        time: serverTime,
        date: today,
        session: sessionNumber,
        gps: gps_lat && gps_lng ? { lat: gps_lat, lng: gps_lng } : null,
        elapsed: `${elapsedMinutes}m ${elapsedSeconds}s`
      }
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/attendance/checkout - Employee check-out
router.post('/checkout', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const { gps_lat, gps_lng, device_info } = req.body;
    const today = getTodayDate();
    const serverTime = getServerTime();

    // Find active session
    const activeSession = db.prepare(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
    ).get(userId, today);

    if (!activeSession) {
      return res.status(400).json({ error: 'No active check-in found for today' });
    }

    // Calculate total hours worked
    const checkInTime = new Date(activeSession.check_in_time);
    const checkOutTime = new Date(serverTime);
    const diffMs = checkOutTime - checkInTime;
    const totalHours = diffMs / (1000 * 60 * 60);
    const hours = Math.floor(totalHours);
    const minutes = Math.floor((totalHours - hours) * 60);
    const seconds = Math.floor(((totalHours - hours) * 60 - minutes) * 60);

    // Calculate status
    const status = calculateStatus(activeSession.check_in_time, totalHours);

    // Update check-out
    db.prepare(
      `UPDATE attendance SET check_out_time = ?, check_out_gps_lat = ?, check_out_gps_lng = ?, device_info = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(serverTime, gps_lat || null, gps_lng || null, device_info || null, status, activeSession.id);

    // Audit log
    db.prepare('INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
      userId, 'CHECK_OUT', `Checked out at ${serverTime}, worked ${hours}h ${minutes}m ${seconds}s`, req.ip
    );

    res.json({
      message: 'Checked out successfully',
      checkOut: {
        id: activeSession.id,
        checkInTime: activeSession.check_in_time,
        checkOutTime: serverTime,
        duration: `${hours}h ${minutes}m ${seconds}s`,
        totalHours: totalHours.toFixed(2),
        status,
        gps: gps_lat && gps_lng ? { lat: gps_lat, lng: gps_lng } : null
      }
    });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance/status - Get today's attendance status for current user
router.get('/status', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const today = getTodayDate();

    const records = db.prepare(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY session_number ASC'
    ).all(userId, today);

    const activeSession = records.find(r => !r.check_out_time);

    // Check if user is on leave
    const leave = db.prepare(
      'SELECT * FROM leaves WHERE user_id = ? AND start_date <= ? AND end_date >= ?'
    ).get(userId, today, today);

    res.json({
      date: today,
      isOnLeave: !!leave,
      leaveDetails: leave || null,
      activeSession: activeSession || null,
      sessions: records.map(r => ({
        id: r.id,
        checkInTime: r.check_in_time,
        checkOutTime: r.check_out_time,
        status: r.status,
        sessionNumber: r.session_number
      })),
      isCheckedIn: !!activeSession,
      checkedInToday: records.length > 0
    });
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance/today - Today's all attendance (Admin)
router.get('/today', authenticate, requireAdmin, (req, res) => {
  try {
    const today = getTodayDate();

    const records = db.prepare(`
      SELECT a.*, u.full_name, u.roles, u.email, u.phone
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ?
      ORDER BY a.check_in_time ASC
    `).all(today);

    // Also get users who haven't checked in
    const allActiveUsers = db.prepare("SELECT id, full_name, roles FROM users WHERE status = 'Active'").all();
    const checkedInUserIds = new Set(records.map(r => r.user_id));

    const notCheckedIn = allActiveUsers
      .filter(u => !checkedInUserIds.has(u.id))
      .map(u => ({
        user_id: u.id,
        full_name: u.full_name,
        roles: u.roles,
        status: 'Absent',
        check_in_time: null,
        check_out_time: null
      }));

    res.json({
      date: today,
      total: allActiveUsers.length,
      checkedIn: records.length,
      absent: notCheckedIn.length,
      records: [...records, ...notCheckedIn]
    });
  } catch (err) {
    console.error('Today attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance/date/:date - Get attendance for specific date (Admin)
router.get('/date/:date', authenticate, requireAdmin, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT a.*, u.full_name, u.roles, u.email
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ?
      ORDER BY a.check_in_time ASC
    `).all(req.params.date);

    res.json({ date: req.params.date, records });
  } catch (err) {
    console.error('Date attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance/user/:userId - Get attendance for a specific user
router.get('/user/:userId', authenticate, (req, res) => {
  try {
    // Employee can view own, admin can view any
    if (req.user.role !== 'Admin' && req.user.id != req.params.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { start_date, end_date, limit = 90 } = req.query;

    let query = 'SELECT * FROM attendance WHERE user_id = ?';
    const params = [req.params.userId];

    if (start_date) {
      query += ' AND date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND date <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY date DESC, session_number ASC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
    }

    const records = db.prepare(query).all(...params);

    // Group by date
    const grouped = {};
    for (const r of records) {
      if (!grouped[r.date]) {
        grouped[r.date] = {
          date: r.date,
          sessions: [],
          totalHours: 0,
          status: r.status
        };
      }
      grouped[r.date].sessions.push({
        id: r.id,
        checkInTime: r.check_in_time,
        checkOutTime: r.check_out_time,
        duration: r.check_in_time && r.check_out_time
          ? calculateDuration(r.check_in_time, r.check_out_time)
          : null,
        gps: r.check_in_gps_lat ? { lat: r.check_in_gps_lat, lng: r.check_in_gps_lng } : null,
        sessionNumber: r.session_number
      });
      if (r.check_in_time && r.check_out_time) {
        const diff = new Date(r.check_out_time) - new Date(r.check_in_time);
        grouped[r.date].totalHours += diff / (1000 * 60 * 60);
      }
    }

    res.json({ userId: req.params.userId, attendance: Object.values(grouped) });
  } catch (err) {
    console.error('User attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: calculate duration between two ISO strings
function calculateDuration(start, end) {
  const diff = new Date(end) - new Date(start);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// POST /api/attendance/override - Admin manual override check-in/out
router.post('/override', authenticate, requireAdmin, (req, res) => {
  try {
    const { user_id, date, check_in_time, check_out_time, reason, action } = req.body;

    if (!user_id || !reason) {
      return res.status(400).json({ error: 'user_id and reason are required' });
    }

    const targetDate = date || getTodayDate();
    const serverTime = getServerTime();

    if (action === 'checkin') {
      const result = db.prepare(
        `INSERT INTO attendance (user_id, date, check_in_time, override_reason, override_by, status)
         VALUES (?, ?, ?, ?, ?, 'Present')`
      ).run(user_id, targetDate, check_in_time || serverTime, reason, req.user.id);

      db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
        req.user.id, 'MANUAL_CHECK_IN',
        `Manual check-in for user ${user_id} on ${targetDate}: ${reason}`
      );

      res.status(201).json({ message: 'Manual check-in recorded', id: result.lastInsertRowid });
    } else if (action === 'checkout') {
      const active = db.prepare(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY session_number DESC LIMIT 1'
      ).get(user_id, targetDate);

      if (!active) {
        return res.status(400).json({ error: 'No active session to check out' });
      }

      db.prepare(
        `UPDATE attendance SET check_out_time = ?, override_reason = ?, override_by = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(check_out_time || serverTime, reason, req.user.id, active.id);

      db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
        req.user.id, 'MANUAL_CHECK_OUT',
        `Manual check-out for user ${user_id} on ${targetDate}: ${reason}`
      );

      res.json({ message: 'Manual check-out recorded' });
    } else if (action === 'mark_present' || action === 'mark_absent' || action === 'mark_late' || action === 'mark_halfday') {
      const statusMap = {
        mark_present: 'Present',
        mark_absent: 'Absent',
        mark_late: 'Late',
        mark_halfday: 'Half Day'
      };

      const existing = db.prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?').get(user_id, targetDate);
      if (existing) {
        db.prepare(
          'UPDATE attendance SET status = ?, override_reason = ?, override_by = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).run(statusMap[action], reason, req.user.id, existing.id);
      } else {
        db.prepare(
          `INSERT INTO attendance (user_id, date, status, override_reason, override_by) VALUES (?, ?, ?, ?, ?)`
        ).run(user_id, targetDate, statusMap[action], reason, req.user.id);
      }

      db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(
        req.user.id, `MANUAL_${statusMap[action].toUpperCase()}`,
        `Marked user ${user_id} as ${statusMap[action]} on ${targetDate}: ${reason}`
      );

      res.json({ message: `Marked as ${statusMap[action]}` });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    console.error('Override error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance/summary/:userId - Monthly summary for a user
router.get('/summary/:userId', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.id != req.params.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { month, year } = req.query;
    const targetMonth = month || (new Date().getMonth() + 1).toString().padStart(2, '0');
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-${targetMonth.padStart(2, '0')}-01`;

    // Calculate end of month
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${targetMonth.padStart(2, '0')}-${lastDay}`;

    const records = db.prepare(
      'SELECT * FROM attendance WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC'
    ).all(req.params.userId, startDate, endDate);

    const leaves = db.prepare(
      'SELECT * FROM leaves WHERE user_id = ? AND start_date <= ? AND end_date >= ?'
    ).all(req.params.userId, endDate, startDate);

    let present = 0, absent = 0, late = 0, halfDay = 0, onLeave = 0;
    let totalHours = 0;

    const daysInMonth = lastDay;
    const dailyRecords = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${targetYear}-${targetMonth.padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const dayRecords = records.filter(r => r.date === dateStr);
      const dayLeave = leaves.find(l => l.start_date <= dateStr && l.end_date >= dateStr);

      if (dayLeave) {
        onLeave++;
        dailyRecords[dateStr] = { status: 'On Leave', leaveType: dayLeave.leave_type };
      } else if (dayRecords.length === 0) {
        // Check if it's a weekend
        const dayOfWeek = new Date(dateStr).getDay();
        if (dayOfWeek === 0) { // Sunday
          dailyRecords[dateStr] = { status: 'Weekend' };
        } else {
          absent++;
          dailyRecords[dateStr] = { status: 'Absent' };
        }
      } else {
        const lastSession = dayRecords[dayRecords.length - 1];
        if (lastSession.check_in_time && lastSession.check_out_time) {
          const diff = new Date(lastSession.check_out_time) - new Date(lastSession.check_in_time);
          totalHours += diff / (1000 * 60 * 60);
        }

        const status = dayRecords.some(r => r.status === 'Late') ? 'Late' :
                       dayRecords.some(r => r.status === 'Half Day') ? 'Half Day' : 'Present';

        if (status === 'Late') late++;
        else if (status === 'Half Day') halfDay++;
        else present++;

        dailyRecords[dateStr] = {
          status,
          sessions: dayRecords.map(r => ({
            checkIn: r.check_in_time,
            checkOut: r.check_out_time,
            duration: r.check_in_time && r.check_out_time ? calculateDuration(r.check_in_time, r.check_out_time) : null
          }))
        };
      }
    }

    const totalDays = present + absent + late + halfDay + onLeave;
    const attendancePercent = totalDays > 0 ? ((present + late + halfDay) / totalDays * 100).toFixed(1) : 0;

    res.json({
      userId: req.params.userId,
      month: targetMonth,
      year: targetYear,
      summary: {
        present,
        absent,
        late,
        halfDay,
        onLeave,
        totalDays,
        totalHours: totalHours.toFixed(1),
        attendancePercent
      },
      dailyRecords
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
