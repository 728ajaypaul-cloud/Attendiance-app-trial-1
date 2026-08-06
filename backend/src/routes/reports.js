const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/monthly - Monthly attendance report
router.get('/monthly', authenticate, requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const endDate = `${targetYear}-${targetMonth}-${lastDay}`;

    const employees = db.prepare("SELECT id, full_name, roles, status FROM users WHERE status = 'Active' ORDER BY full_name").all();
    const allAttendance = db.prepare(
      'SELECT * FROM attendance WHERE date >= ? AND date <= ? ORDER BY user_id, date'
    ).all(startDate, endDate);
    const allLeaves = db.prepare(
      'SELECT * FROM leaves WHERE start_date <= ? AND end_date >= ?'
    ).all(endDate, startDate);

    // Group attendance by user
    const attendanceByUser = {};
    for (const a of allAttendance) {
      if (!attendanceByUser[a.user_id]) attendanceByUser[a.user_id] = [];
      attendanceByUser[a.user_id].push(a);
    }

    const leavesByUser = {};
    for (const l of allLeaves) {
      if (!leavesByUser[l.user_id]) leavesByUser[l.user_id] = [];
      leavesByUser[l.user_id].push(l);
    }

    const report = employees.map(emp => {
      const userAttendance = attendanceByUser[emp.id] || [];
      const userLeaves = leavesByUser[emp.id] || [];
      let present = 0, absent = 0, late = 0, halfDay = 0, onLeave = 0;
      let totalHours = 0;

      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${targetYear}-${targetMonth}-${d.toString().padStart(2, '0')}`;
        const dayRecords = userAttendance.filter(a => a.date === dateStr);
        const dayLeave = userLeaves.find(l => l.start_date <= dateStr && l.end_date >= dateStr);

        if (dayLeave) {
          onLeave++;
        } else if (dayRecords.length === 0) {
          const dow = new Date(dateStr).getDay();
          if (dow !== 0) absent++;
        } else {
          const hasLate = dayRecords.some(r => r.status === 'Late');
          const hasHalfDay = dayRecords.some(r => r.status === 'Half Day');
          if (hasLate) late++;
          else if (hasHalfDay) halfDay++;
          else present++;

          for (const r of dayRecords) {
            if (r.check_in_time && r.check_out_time) {
              totalHours += (new Date(r.check_out_time) - new Date(r.check_in_time)) / (1000 * 60 * 60);
            }
          }
        }
      }

      const totalDays = present + absent + late + halfDay + onLeave;
      const attendancePercent = totalDays > 0 ? ((present + late + halfDay) / totalDays * 100).toFixed(1) : '0.0';

      return {
        id: emp.id,
        name: emp.full_name,
        roles: emp.roles,
        present,
        absent,
        late,
        halfDay,
        onLeave,
        totalDays,
        totalHours: totalHours.toFixed(1),
        attendancePercent
      };
    });

    res.json({
      month: targetMonth,
      year: targetYear,
      generatedAt: new Date().toISOString(),
      report
    });
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/absent - Absent days report
router.get('/absent', authenticate, requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const endDate = `${targetYear}-${targetMonth}-${lastDay}`;

    const employees = db.prepare("SELECT id, full_name, roles FROM users WHERE status = 'Active'").all();
    const allAttendance = db.prepare(
      'SELECT * FROM attendance WHERE date >= ? AND date <= ?'
    ).all(startDate, endDate);

    const absences = [];

    for (const emp of employees) {
      const userAttendance = allAttendance.filter(a => a.user_id === emp.id);
      let absentCount = 0;
      const absentDates = [];

      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${targetYear}-${targetMonth}-${d.toString().padStart(2, '0')}`;
        const dayRecords = userAttendance.filter(a => a.date === dateStr);
        const dow = new Date(dateStr).getDay();

        if (dayRecords.length === 0 && dow !== 0) {
          absentCount++;
          absentDates.push(dateStr);
        }
      }

      if (absentDates.length > 0) {
        absences.push({
          id: emp.id,
          name: emp.full_name,
          roles: emp.roles,
          absentCount,
          absentDates,
          isRepeatOffender: absentCount >= 3
        });
      }
    }

    res.json({
      month: targetMonth,
      year: targetYear,
      absences
    });
  } catch (err) {
    console.error('Absent report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/late - Late arrivals report
router.get('/late', authenticate, requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const endDate = `${targetYear}-${targetMonth}-${lastDay}`;

    const lateThreshold = db.prepare("SELECT value FROM settings WHERE key = 'late_threshold'").get()?.value || '09:30';

    const lateRecords = db.prepare(`
      SELECT a.*, u.full_name, u.roles
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date >= ? AND a.date <= ? AND a.check_in_time IS NOT NULL
      ORDER BY a.check_in_time ASC
    `).all(startDate, endDate);

    const lateArrivals = lateRecords.filter(r => {
      const checkIn = new Date(r.check_in_time);
      const checkInStr = `${checkIn.getHours().toString().padStart(2, '0')}:${checkIn.getMinutes().toString().padStart(2, '0')}`;
      return checkInStr > lateThreshold;
    }).map(r => {
      const checkIn = new Date(r.check_in_time);
      const thresholdParts = lateThreshold.split(':');
      const lateMinutes = (checkIn.getHours() * 60 + checkIn.getMinutes()) - (parseInt(thresholdParts[0]) * 60 + parseInt(thresholdParts[1]));
      return {
        id: r.id,
        userId: r.user_id,
        name: r.full_name,
        roles: r.roles,
        date: r.date,
        checkInTime: r.check_in_time,
        minutesLate: lateMinutes
      };
    });

    // Count frequency per employee
    const freqMap = {};
    for (const l of lateArrivals) {
      if (!freqMap[l.userId]) freqMap[l.userId] = { name: l.name, roles: l.roles, count: 0, dates: [] };
      freqMap[l.userId].count++;
      freqMap[l.userId].dates.push(l.date);
    }

    res.json({
      month: targetMonth,
      year: targetYear,
      lateThreshold,
      totalLateEntries: lateArrivals.length,
      byEmployee: Object.entries(freqMap).map(([userId, data]) => ({ userId: parseInt(userId), ...data })),
      lateArrivals
    });
  } catch (err) {
    console.error('Late report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/hours - Hours worked report
router.get('/hours', authenticate, requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const endDate = `${targetYear}-${targetMonth}-${lastDay}`;

    const employees = db.prepare("SELECT id, full_name, roles FROM users WHERE status = 'Active'").all();
    const allAttendance = db.prepare(
      'SELECT * FROM attendance WHERE date >= ? AND date <= ? AND check_in_time IS NOT NULL AND check_out_time IS NOT NULL'
    ).all(startDate, endDate);

    const report = employees.map(emp => {
      const userAttendance = allAttendance.filter(a => a.user_id === emp.id);
      const dailyHours = userAttendance.map(a => {
        return (new Date(a.check_out_time) - new Date(a.check_in_time)) / (1000 * 60 * 60);
      });

      const totalHours = dailyHours.reduce((sum, h) => sum + h, 0);
      const avgHours = dailyHours.length > 0 ? totalHours / dailyHours.length : 0;
      const minHours = dailyHours.length > 0 ? Math.min(...dailyHours) : 0;
      const maxHours = dailyHours.length > 0 ? Math.max(...dailyHours) : 0;

      return {
        id: emp.id,
        name: emp.full_name,
        roles: emp.roles,
        totalHours: totalHours.toFixed(1),
        avgHoursPerDay: avgHours.toFixed(1),
        minHours: minHours.toFixed(1),
        maxHours: maxHours.toFixed(1),
        daysWorked: dailyHours.length
      };
    });

    res.json({
      month: targetMonth,
      year: targetYear,
      report
    });
  } catch (err) {
    console.error('Hours report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/leaves - Leave summary report
router.get('/leaves', authenticate, requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
    const targetYear = year || new Date().getFullYear();
    const startDate = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const endDate = `${targetYear}-${targetMonth}-${lastDay}`;

    const leaves = db.prepare(`
      SELECT l.*, u.full_name, u.roles
      FROM leaves l
      JOIN users u ON l.user_id = u.id
      WHERE l.start_date <= ? AND l.end_date >= ?
      ORDER BY l.start_date
    `).all(endDate, startDate);

    const report = leaves.map(l => {
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      return {
        id: l.id,
        userId: l.user_id,
        name: l.full_name,
        roles: l.roles,
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        totalDays: days,
        reason: l.reason
      };
    });

    res.json({
      month: targetMonth,
      year: targetYear,
      report
    });
  } catch (err) {
    console.error('Leaves report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
