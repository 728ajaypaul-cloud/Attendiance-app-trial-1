import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AdminCalendar() {
  const { api } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [employees, setEmployees] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [leavesData, setLeavesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');

  useEffect(() => {
    loadData();
  }, [currentMonth, currentYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const empRes = await api.get('/employees', { params: { status: 'Active' } });
      const employeesList = empRes.data.employees;

      const startDate = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      const endDate = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${lastDay}`;

      const attRes = await api.get(`/attendance/date/${startDate}`);
      // We'll get attendance for each date via separate calls
      // Instead, let's use the monthly report data
      const reportRes = await api.get('/reports/monthly', {
        params: { month: currentMonth + 1, year: currentYear }
      });

      // Get detailed attendance
      const attendanceMap = {};
      for (const emp of employeesList) {
        const userAttRes = await api.get(`/attendance/user/${emp.id}`, {
          params: { start_date: startDate, end_date: endDate }
        });
        for (const day of userAttRes.data.attendance) {
          attendanceMap[`${emp.id}-${day.date}`] = day;
        }
      }

      // Get leaves
      const leavesRes = await api.get('/leaves', {
        params: { start_date: startDate, end_date: endDate }
      });

      setEmployees(employeesList);
      setAttendanceData(attendanceMap);
      setLeavesData(leavesRes.data.leaves);
    } catch (err) {
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = roleFilter
    ? employees.filter(e => e.roles?.includes(roleFilter))
    : employees;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const getStatusEmoji = (status) => {
    const map = {
      'Present': '✅', 'Late': '⏱️', 'Absent': '❌', 'Half Day': '📌',
      'On Leave': '🏖️', 'Remote': '🏠', 'Weekend': '▪️'
    };
    return map[status] || '❓';
  };

  const getStatusColor = (status) => {
    const map = {
      'Present': '#2ED573', 'Late': '#FFA502', 'Absent': '#FF4757',
      'Half Day': '#FFA502', 'On Leave': '#3742FA', 'Remote': '#6C63FF',
      'Weekend': '#DFE6E9'
    };
    return map[status] || '#DFE6E9';
  };

  const getDayStatus = (empId, day) => {
    const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const date = new Date(dateStr);

    // Check if weekend
    if (date.getDay() === 0) return { status: 'Weekend' };

    // Check if on leave
    const leave = leavesData.find(l =>
      l.user_id === empId && l.start_date <= dateStr && l.end_date >= dateStr
    );
    if (leave) return { status: 'On Leave', leaveType: leave.leave_type, reason: leave.reason };

    // Check attendance
    const attKey = `${empId}-${dateStr}`;
    const attData = attendanceData[attKey];
    if (attData && attData.sessions?.length > 0) {
      const lastSession = attData.sessions[attData.sessions.length - 1];
      return {
        status: attData.status,
        checkIn: lastSession.checkIn,
        checkOut: lastSession.checkOut,
        duration: lastSession.duration,
        totalHours: attData.totalHours
      };
    }

    // Future dates
    if (date > new Date()) return { status: 'Future' };

    return { status: 'Absent' };
  };

  const navigateMonth = (delta) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  // Highlight employees with 3+ absences
  const getAbsenceCount = (empId) => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const status = getDayStatus(empId, d);
      if (status.status === 'Absent') count++;
    }
    return count;
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>📅 Attendance Calendar</h1>
        <p>Month view of all employee attendance</p>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={() => navigateMonth(-1)}>← Previous</button>
          <h2>{MONTHS[currentMonth]} {currentYear}</h2>
          <button className="btn btn-outline" onClick={() => navigateMonth(1)}>Next →</button>
        </div>
        <select className="input-field" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All Roles</option>
          <option value="Photographer">Photographer</option>
          <option value="Cinematographer">Cinematographer</option>
          <option value="Editor">Editor</option>
          <option value="Drone Pilot">Drone Pilot</option>
          <option value="Assistant">Assistant</option>
        </select>
      </div>

      {/* Calendar grid */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 140, position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 2 }}>Employee</th>
              {Array.from({ length: daysInMonth }).map((_, i) => (
                <th key={i} style={{ textAlign: 'center', minWidth: 36, fontSize: 11 }}>
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => {
              const absenceCount = getAbsenceCount(emp.id);
              const isRepeatOffender = absenceCount >= 3;

              return (
                <tr key={emp.id} style={{ background: isRepeatOffender ? 'rgba(255, 71, 87, 0.05)' : 'transparent' }}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 1, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {emp.full_name}
                    {isRepeatOffender && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>⚠️</span>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{emp.roles}</div>
                  </td>
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const info = getDayStatus(emp.id, day);
                    const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

                    return (
                      <td
                        key={day}
                        style={{
                          textAlign: 'center',
                          padding: 4,
                          cursor: info.status !== 'Future' && info.status !== 'Weekend' ? 'pointer' : 'default',
                          background: selectedCell?.empId === emp.id && selectedCell?.date === dateStr
                            ? 'rgba(108, 99, 255, 0.15)' : 'transparent',
                          fontSize: 16
                        }}
                        onClick={() => info.status !== 'Future' && info.status !== 'Weekend' && setSelectedCell({ empId: emp.id, date: dateStr, info, empName: emp.full_name })}
                        title={`${emp.full_name} - ${dateStr}: ${info.status}`}
                      >
                        {info.status !== 'Future' && info.status !== 'Weekend' ? (
                          <span>{getStatusEmoji(info.status)}</span>
                        ) : info.status === 'Weekend' ? (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>-</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}></span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected cell details */}
      {selectedCell && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3>{selectedCell.empName}</h3>
              <p style={{ color: 'var(--text-secondary)' }}>{selectedCell.date}</p>
            </div>
            <button className="btn btn-outline" style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }} onClick={() => setSelectedCell(null)}>Close</button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 24 }}>
            <div>
              <span className={`badge ${selectedCell.info.status === 'Present' ? 'badge-success' : selectedCell.info.status === 'Late' ? 'badge-warning' : selectedCell.info.status === 'Absent' ? 'badge-danger' : 'badge-info'}`}>
                {getStatusEmoji(selectedCell.info.status)} {selectedCell.info.status}
              </span>
            </div>
            {selectedCell.info.checkIn && (
              <div style={{ fontSize: 14 }}>
                <strong>Check-in:</strong> {new Date(selectedCell.info.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            )}
            {selectedCell.info.checkOut && (
              <div style={{ fontSize: 14 }}>
                <strong>Check-out:</strong> {new Date(selectedCell.info.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            )}
            {selectedCell.info.duration && (
              <div style={{ fontSize: 14 }}>
                <strong>Duration:</strong> {selectedCell.info.duration}
              </div>
            )}
            {selectedCell.info.totalHours > 0 && (
              <div style={{ fontSize: 14 }}>
                <strong>Total Hours:</strong> {selectedCell.info.totalHours.toFixed(1)}h
              </div>
            )}
            {selectedCell.info.leaveType && (
              <div style={{ fontSize: 14 }}>
                <strong>Leave Type:</strong> {selectedCell.info.leaveType}
                {selectedCell.info.reason && <span> — {selectedCell.info.reason}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
        <span className="badge badge-success">✅ Present</span>
        <span className="badge badge-warning">⏱️ Late</span>
        <span className="badge badge-danger">❌ Absent</span>
        <span className="badge badge-warning">📌 Half Day</span>
        <span className="badge badge-info">🏖️ Leave</span>
        <span className="badge badge-secondary">▪️ Weekend</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>⚠️ = 3+ absences</span>
      </div>
    </div>
  );
}
