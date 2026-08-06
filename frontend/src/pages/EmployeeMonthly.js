import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function EmployeeMonthly() {
  const { api } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, [currentMonth, currentYear]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const userRes = await api.get('/employees/me');
      const userId = userRes.data.employee.id;
      const res = await api.get(`/attendance/summary/${userId}`, {
        params: { month: currentMonth + 1, year: currentYear }
      });
      setSummary(res.data);
    } catch (err) {
      console.error('Error loading summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (delta) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const getStatusEmoji = (status) => {
    const map = {
      'Present': '✅', 'Late': '⏱️', 'Absent': '❌', 'Half Day': '📌',
      'On Leave': '🏖️', 'Remote': '🏠', 'Weekend': '▪️', 'Future': ''
    };
    return map[status] || '❓';
  };

  const getStatusClass = (status) => {
    const map = {
      'Present': 'badge-success', 'Late': 'badge-warning', 'Absent': 'badge-danger',
      'Half Day': 'badge-warning', 'On Leave': 'badge-info', 'Weekend': 'badge-secondary',
      'Future': 'badge-secondary'
    };
    return map[status] || 'badge-secondary';
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const today = new Date();

  if (loading) return <div className="spinner" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Monthly Attendance</h1>
        <p>Your monthly attendance summary</p>
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-outline" onClick={() => navigateMonth(-1)}>← {MONTHS[currentMonth === 0 ? 11 : currentMonth - 1]}</button>
        <h2>{MONTHS[currentMonth]} {currentYear}</h2>
        <button className="btn btn-outline" onClick={() => navigateMonth(1)}>{MONTHS[currentMonth === 11 ? 0 : currentMonth + 1]} →</button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>{summary.summary.present}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Present</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)' }}>{summary.summary.absent}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Absent</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning)' }}>{summary.summary.late}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Late</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{summary.summary.totalHours}h</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Hours</div>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="card" style={{ padding: 16 }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', padding: 8 }}>{d}</div>
          ))}
        </div>

        {/* Calendar days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {/* Empty cells for days before month starts */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const isToday = dateStr === today.toISOString().split('T')[0];
            const dayData = summary?.dailyRecords?.[dateStr];
            const status = dayData?.status || 'Future';

            return (
              <div
                key={dateStr}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  textAlign: 'center',
                  background: isToday ? 'rgba(108, 99, 255, 0.1)' : 'transparent',
                  border: isToday ? '2px solid var(--primary)' : '1px solid transparent',
                  minHeight: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: dayData ? 'pointer' : 'default'
                }}
                title={dayData?.sessions?.map(s => `${s.checkIn ? new Date(s.checkIn).toLocaleTimeString() : ''} - ${s.checkOut ? new Date(s.checkOut).toLocaleTimeString() : ''}`).join('\n')}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>{day}</div>
                <div style={{ fontSize: 18, marginTop: 2 }}>{getStatusEmoji(status)}</div>
                {dayData?.sessions?.[0]?.checkIn && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(dayData.sessions[0].checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </div>
                )}
                {status !== 'Future' && status !== 'Weekend' && dayData?.totalHours > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--primary)', marginTop: 1 }}>
                    {dayData.totalHours.toFixed(1)}h
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
        <span className="badge badge-success">✅ Present</span>
        <span className="badge badge-warning">⏱️ Late</span>
        <span className="badge badge-danger">❌ Absent</span>
        <span className="badge badge-warning">📌 Half Day</span>
        <span className="badge badge-info">🏖️ Leave</span>
        <span className="badge badge-secondary">▪️ Weekend</span>
      </div>

      {/* Attendance % */}
      {summary && (
        <div className="card" style={{ marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--primary)' }}>
            {summary.summary.attendancePercent}%
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Attendance Rate</div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            {summary.summary.present + summary.summary.late + summary.summary.halfDay} days present out of {summary.summary.totalDays} working days
          </div>
        </div>
      )}
    </div>
  );
}
