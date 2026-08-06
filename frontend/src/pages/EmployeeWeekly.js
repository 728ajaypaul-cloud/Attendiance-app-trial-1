import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function EmployeeWeekly() {
  const { api } = useAuth();
  const [weeks, setWeeks] = useState([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 90);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 7);

      const res = await api.get('/attendance/user/' + api.defaults.headers.common['X-User-Id'], {
        params: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          limit: 200
        }
      });

      // We need the user ID - get it from the user object via a different approach
      // Let's fetch user info first
      const userRes = await api.get('/employees/me');
      const userId = userRes.data.employee.id;

      const attendanceRes = await api.get(`/attendance/user/${userId}`, {
        params: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          limit: 200
        }
      });

      const attendanceData = attendanceRes.data.attendance || [];

      // Group into weeks
      const weekMap = {};
      for (const day of attendanceData) {
        const d = new Date(day.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
        const weekKey = weekStart.toISOString().split('T')[0];
        if (!weekMap[weekKey]) {
          weekMap[weekKey] = { start: weekStart, days: {} };
        }
        weekMap[weekKey].days[day.date] = day;
      }

      // Fill in missing days
      const weeksArray = Object.values(weekMap).sort((a, b) => new Date(b.start) - new Date(a.start));

      for (const week of weeksArray) {
        for (let i = 0; i < 7; i++) {
          const d = new Date(week.start);
          d.setDate(week.start.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          if (!week.days[dateStr]) {
            week.days[dateStr] = {
              date: dateStr,
              status: d > new Date() ? 'Future' : (d.getDay() === 0 ? 'Weekend' : 'Absent'),
              sessions: []
            };
          }
        }
      }

      setWeeks(weeksArray);
      setCurrentWeekIndex(0);
    } catch (err) {
      console.error('Error loading weekly data:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentWeek = weeks[currentWeekIndex];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getStatusEmoji = (status) => {
    const map = {
      'Present': '✅',
      'Late': '⏱️',
      'Absent': '❌',
      'Half Day': '📌',
      'On Leave': '🏖️',
      'Remote': '🏠',
      'Weekend': '-',
      'Future': ''
    };
    return map[status] || '❓';
  };

  const getStatusBadge = (status) => {
    const map = {
      'Present': 'badge-success',
      'Late': 'badge-warning',
      'Absent': 'badge-danger',
      'Half Day': 'badge-warning',
      'On Leave': 'badge-info',
      'Remote': 'badge-info',
      'Weekend': 'badge-secondary',
      'Future': 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Weekly Attendance</h1>
        <p>Your weekly check-in/check-out summary</p>
      </div>

      {currentWeek && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button
              className="btn btn-outline"
              onClick={() => setCurrentWeekIndex(i => Math.min(i + 1, weeks.length - 1))}
              disabled={currentWeekIndex >= weeks.length - 1}
            >
              ← Previous
            </button>
            <h3>
              {currentWeek.start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - {
                new Date(new Date(currentWeek.start).setDate(currentWeek.start.getDate() + 6)).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
              }
            </h3>
            <button
              className="btn btn-outline"
              onClick={() => setCurrentWeekIndex(i => Math.max(i - 1, 0))}
              disabled={currentWeekIndex === 0}
            >
              Next →
            </button>
          </div>

          <div className="card" style={{ padding: 16 }}>
            {daysOfWeek.map((dayName, i) => {
              const d = new Date(currentWeek.start);
              d.setDate(currentWeek.start.getDate() + i);
              const dateStr = d.toISOString().split('T')[0];
              const dayData = currentWeek.days[dateStr];
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={dateStr}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 8px',
                    borderBottom: i < 6 ? '1px solid var(--border)' : 'none',
                    background: isToday ? 'rgba(108, 99, 255, 0.05)' : 'transparent',
                    borderRadius: 8,
                    gap: 12
                  }}
                >
                  <div style={{ width: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{dayName}</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{d.getDate()}</div>
                  </div>

                  <div style={{ flex: 1 }}>
                    {dayData ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge ${getStatusBadge(dayData.status)}`}>
                          {getStatusEmoji(dayData.status)} {dayData.status}
                        </span>
                        {dayData.sessions && dayData.sessions.length > 0 && dayData.sessions[0].checkIn && (
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {new Date(dayData.sessions[0].checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            {dayData.sessions[0].duration ? ` | ${dayData.sessions[0].duration}` : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No data</span>
                    )}
                  </div>

                  {dayData?.totalHours > 0 && (
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {dayData.totalHours.toFixed(1)}h
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {weeks.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-secondary)' }}>No attendance records found.</p>
        </div>
      )}
    </div>
  );
}
