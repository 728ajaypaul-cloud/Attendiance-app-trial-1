import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [overrideModal, setOverrideModal] = useState(false);
  const [overrideAction, setOverrideAction] = useState('checkin');
  const [overrideTime, setOverrideTime] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/attendance/today');
      setData(res.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getStatusBadge = (status) => {
    const map = {
      'Present': 'badge-success',
      'Late': 'badge-warning',
      'Absent': 'badge-danger',
      'Half Day': 'badge-warning',
      'On Leave': 'badge-info',
      'Remote': 'badge-info',
      'Checked In': 'badge-success'
    };
    return map[status] || 'badge-secondary';
  };

  const getStatusEmoji = (status) => {
    const map = {
      'Present': '✅', 'Late': '⏱️', 'Absent': '❌', 'Half Day': '📌',
      'On Leave': '🏖️', 'Remote': '🏠', 'Checked In': '✅'
    };
    return map[status] || '❓';
  };

  const getEmployeeTypeLabel = (type) => {
    const map = {
      'in-house-editor': '🏢 In-house Editor',
      'home-editor': '🏠 Home Editor',
      'other': '👤 Employee'
    };
    return map[type] || type || '👤';
  };

  const getMethodBadge = (method) => {
    if (!method) return null;
    return method === 'qr-code'
      ? <span className="badge" style={{ background: '#6C63FF', color: '#fff', fontSize: 11 }}>📱 QR</span>
      : <span className="badge" style={{ background: '#0984E3', color: '#fff', fontSize: 11 }}>✋ Manual</span>;
  };

  const filteredRecords = () => {
    if (!data?.records) return [];
    let list = [...data.records];

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r => r.full_name?.toLowerCase().includes(s) || r.phone?.includes(s));
    }
    if (roleFilter) {
      list = list.filter(r => r.roles?.includes(roleFilter));
    }

    list.sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'name': valA = a.full_name || ''; valB = b.full_name || ''; break;
        case 'time': valA = a.check_in_time || ''; valB = b.check_in_time || ''; break;
        case 'status': valA = a.status || ''; valB = b.status || ''; break;
        case 'role': valA = a.roles || ''; valB = b.roles || ''; break;
        case 'type': valA = a.employee_type || ''; valB = b.employee_type || ''; break;
        default: valA = a.full_name || ''; valB = b.full_name || '';
      }
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return list;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleOverride = async () => {
    if (!selectedEmployee || !overrideReason) return;
    try {
      const now = new Date();
      const timeStr = overrideTime || now.toISOString();
      await api.post('/attendance/override', {
        user_id: selectedEmployee.user_id || selectedEmployee.id,
        action: overrideAction,
        check_in_time: overrideAction === 'checkin' ? timeStr : undefined,
        check_out_time: overrideAction === 'checkout' ? timeStr : undefined,
        reason: overrideReason
      });
      setOverrideModal(false);
      setOverrideReason('');
      setOverrideTime('');
      setSelectedEmployee(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Override failed');
    }
  };

  const calcHours = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return '';
    const diff = new Date(checkOut) - new Date(checkIn);
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${h}h ${m}m`;
  };

  if (loading) return <div className="spinner" />;

  const statsCards = [
    { label: 'Total Team', value: data?.total || 0, color: 'var(--primary)' },
    { label: 'Checked In', value: data?.checkedIn || 0, color: 'var(--success)' },
    { label: 'Absent', value: data?.absent || 0, color: 'var(--danger)' },
    { label: 'Working Now', value: data?.records?.filter(r => r.check_in_time && !r.check_out_time).length || 0, color: 'var(--warning)' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 Admin Dashboard</h1>
        <p>Today's Attendance — {data?.date || ''}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {statsCards.map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => navigate('/admin/calendar')}>📅 View Calendar</button>
        <button className="btn btn-outline" onClick={() => navigate('/admin/reports')}>📊 Reports</button>
        <button className="btn btn-outline" onClick={() => navigate('/admin/employees')}>👥 Employees</button>
        <button className="btn btn-outline" onClick={() => navigate('/admin/qr')}>📱 QR Codes</button>
        <button className="btn btn-outline" onClick={() => navigate('/admin/settings')}>⚙️ Settings</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input-field"
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className="input-field" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All Roles</option>
          <option value="Photographer">Photographer</option>
          <option value="Cinematographer">Cinematographer</option>
          <option value="Editor">Editor</option>
          <option value="Drone Pilot">Drone Pilot</option>
          <option value="Assistant">Assistant</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Showing {filteredRecords().length} of {data?.records?.length || 0}
        </span>
      </div>

      {/* Live board */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('type')} style={{ cursor: 'pointer' }}>
                Type {sortField === 'type' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('role')} style={{ cursor: 'pointer' }}>
                Role {sortField === 'role' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => handleSort('time')} style={{ cursor: 'pointer' }}>
                Check-in {sortField === 'time' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Check-out</th>
              <th>Hours</th>
              <th>Method</th>
              <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                Status {sortField === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords().map((r, idx) => (
              <tr key={r.user_id || idx}>
                <td style={{ fontWeight: 500 }}>{r.full_name}</td>
                <td><span style={{ fontSize: 13 }}>{getEmployeeTypeLabel(r.employee_type)}</span></td>
                <td>{r.roles}</td>
                <td>
                  {r.check_in_time
                    ? new Date(r.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : '-'}
                </td>
                <td>
                  {r.check_out_time
                    ? new Date(r.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : r.check_in_time ? <span style={{ color: 'var(--success)', fontSize: 12 }}>Working</span> : '-'}
                </td>
                <td>
                  {r.check_in_time && r.check_out_time
                    ? calcHours(r.check_in_time, r.check_out_time)
                    : '-'}
                </td>
                <td>{getMethodBadge(r.check_in_method)}</td>
                <td>
                  <span className={`badge ${getStatusBadge(r.status)}`}>
                    {getStatusEmoji(r.status)} {r.status}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-outline"
                    style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }}
                    onClick={() => {
                      setSelectedEmployee(r);
                      setOverrideModal(true);
                    }}
                  >
                    Override
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Override modal */}
      {overrideModal && (
        <div className="modal-overlay" onClick={() => setOverrideModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Manual Override</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              Employee: <strong>{selectedEmployee?.full_name}</strong>
            </p>

            <div className="input-group">
              <label>Action</label>
              <select className="input-field" value={overrideAction} onChange={e => setOverrideAction(e.target.value)}>
                <option value="checkin">Check In</option>
                <option value="checkout">Check Out</option>
                <option value="mark_present">Mark Present</option>
                <option value="mark_absent">Mark Absent</option>
                <option value="mark_late">Mark Late</option>
                <option value="mark_halfday">Mark Half Day</option>
              </select>
            </div>

            {(overrideAction === 'checkin' || overrideAction === 'checkout') && (
              <div className="input-group">
                <label>Time (leave empty for current time)</label>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={overrideTime}
                  onChange={e => setOverrideTime(e.target.value)}
                />
              </div>
            )}

            <div className="input-group">
              <label>Reason (required)</label>
              <textarea
                className="input-field"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Why is this override being made?"
                rows={3}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setOverrideModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleOverride} disabled={!overrideReason}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
