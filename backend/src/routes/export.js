const express = require('express');
const { db } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { Parser } = require('json2csv');

const router = express.Router();

// GET /api/export/csv/monthly - Export monthly report as CSV
router.get('/csv/monthly', authenticate, requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = (month || (new Date().getMonth() + 1).toString()).padStart(2, '0');
    const targetYear = year || new Date().getFullYear();

    // Reuse monthly report logic
    const startDate = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const endDate = `${targetYear}-${targetMonth}-${lastDay}`;

    const employees = db.prepare("SELECT id, full_name, roles FROM users WHERE status = 'Active' ORDER BY full_name").all();
    const allAttendance = db.prepare('SELECT * FROM attendance WHERE date >= ? AND date <= ?').all(startDate, endDate);
    const allLeaves = db.prepare('SELECT * FROM leaves WHERE start_date <= ? AND end_date >= ?').all(endDate, startDate);

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

        if (dayLeave) { onLeave++; }
        else if (dayRecords.length === 0) {
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
        'Employee Name': emp.full_name,
        'Role': emp.roles,
        'Present Days': present,
        'Absent Days': absent,
        'Late Days': late,
        'Half Days': halfDay,
        'On Leave': onLeave,
        'Total Hours': totalHours.toFixed(1),
        'Attendance %': attendancePercent
      };
    });

    const parser = new Parser();
    const csv = parser.parse(report);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Attendance_${targetYear}_${targetMonth}_Monthly.csv`);
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/export/csv/employee/:userId - Export single employee attendance
router.get('/csv/employee/:userId', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.id != req.params.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { start_date, end_date } = req.query;
    let query = 'SELECT a.*, u.full_name, u.roles FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.user_id = ?';
    const params = [req.params.userId];

    if (start_date) {
      query += ' AND a.date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND a.date <= ?';
      params.push(end_date);
    }
    query += ' ORDER BY a.date ASC, a.session_number ASC';

    const records = db.prepare(query).all(...params);

    const data = records.map(r => ({
      'Date': r.date,
      'Check In': r.check_in_time || '-',
      'Check Out': r.check_out_time || '-',
      'Duration': r.check_in_time && r.check_out_time
        ? calculateDuration(r.check_in_time, r.check_out_time) : '-',
      'Status': r.status,
      'GPS Check In': r.check_in_gps_lat ? `${r.check_in_gps_lat}, ${r.check_in_gps_lng}` : '-',
      'GPS Check Out': r.check_out_gps_lat ? `${r.check_out_gps_lat}, ${r.check_out_gps_lng}` : '-',
      'Override Reason': r.override_reason || '-'
    }));

    const user = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.params.userId);
    const parser = new Parser();
    const csv = parser.parse(data);

    const nameSlug = user?.full_name?.replace(/\s+/g, '_') || 'Employee';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Attendance_${nameSlug}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Employee CSV export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/export/csv/all - Export all attendance data
router.get('/csv/all', authenticate, requireAdmin, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT a.*, u.full_name, u.roles, u.email, u.phone
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.date DESC, u.full_name ASC
    `).all();

    const data = records.map(r => ({
      'Date': r.date,
      'Employee Name': r.full_name,
      'Role': r.roles,
      'Email': r.email,
      'Phone': r.phone,
      'Check In': r.check_in_time || '-',
      'Check Out': r.check_out_time || '-',
      'Status': r.status,
      'Session #': r.session_number,
      'GPS Lat (In)': r.check_in_gps_lat || '',
      'GPS Lng (In)': r.check_in_gps_lng || '',
      'GPS Lat (Out)': r.check_out_gps_lat || '',
      'GPS Lng (Out)': r.check_out_gps_lng || '',
      'Override Reason': r.override_reason || ''
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Attendance_Full_Database.csv');
    res.send(csv);
  } catch (err) {
    console.error('All CSV export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

function calculateDuration(start, end) {
  const diff = new Date(end) - new Date(start);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

module.exports = router;
