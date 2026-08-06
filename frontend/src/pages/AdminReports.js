import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AdminReports() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('monthly');
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    fetchReport();
  }, [activeTab, month, year]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let res;
      const params = { month, year };

      switch (activeTab) {
        case 'monthly':
          res = await api.get('/reports/monthly', { params });
          break;
        case 'absent':
          res = await api.get('/reports/absent', { params });
          break;
        case 'late':
          res = await api.get('/reports/late', { params });
          break;
        case 'hours':
          res = await api.get('/reports/hours', { params });
          break;
        case 'leaves':
          res = await api.get('/reports/leaves', { params });
          break;
        default:
          res = await api.get('/reports/monthly', { params });
      }

      setReportData(res.data);
    } catch (err) {
      console.error('Report fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/export/csv/monthly', {
        params: { month, year },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Attendance_${year}_${month.padStart(2, '0')}_Monthly.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleExportEmployee = async (userId, name) => {
    try {
      const res = await api.get(`/export/csv/employee/${userId}`, {
        params: {
          start_date: `${year}-${month.padStart(2, '0')}-01`,
          end_date: `${year}-${month.padStart(2, '0')}-31`
        },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Attendance_${name.replace(/\s+/g, '_')}_${year}_${month.padStart(2, '0')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleExportAll = async () => {
    try {
      const res = await api.get('/export/csv/all', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Attendance_Full_Database.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export all error:', err);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getSortedData = () => {
    if (!reportData?.report) return [];
    const list = [...reportData.report];
    list.sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'name': valA = a.name || ''; valB = b.name || ''; break;
        case 'present': valA = a.present || 0; valB = b.present || 0; break;
        case 'absent': valA = a.absent || 0; valB = b.absent || 0; break;
        case 'late': valA = a.late || 0; valB = b.late || 0; break;
        case 'hours': valA = parseFloat(a.totalHours) || 0; valB = parseFloat(b.totalHours) || 0; break;
        case 'percent': valA = parseFloat(a.attendancePercent) || 0; valB = parseFloat(b.attendancePercent) || 0; break;
        default: valA = a.name || ''; valB = b.name || '';
      }
      if (sortDir === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });
    return list;
  };

  const tabs = [
    { id: 'monthly', label: 'Monthly Report' },
    { id: 'absent', label: 'Absent Days' },
    { id: 'late', label: 'Late Arrivals' },
    { id: 'hours', label: 'Hours Worked' },
    { id: 'leaves', label: 'Leave Summary' }
  ];

  const SortIcon = ({ field }) => (
    <span style={{ marginLeft: 4, opacity: sortField === field ? 1 : 0.3 }}>
      {sortDir === 'asc' ? '↑' : '↓'}
    </span>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <h1>📊 Attendance Reports</h1>
          <p>Generate and export attendance reports</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleExportCSV}>📥 Export Monthly CSV</button>
          <button className="btn btn-outline" onClick={handleExportAll}>📥 Export All Data</button>
        </div>
      </div>

      {/* Month/Year picker */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <select className="input-field" value={month} onChange={e => setMonth(e.target.value)} style={{ maxWidth: 150 }}>
          {MONTHS.map((m, i) => (
            <option key={i} value={(i + 1).toString()}>{m}</option>
          ))}
        </select>
        <select className="input-field" value={year} onChange={e => setYear(e.target.value)} style={{ maxWidth: 120 }}>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={fetchReport} style={{ padding: '8px 20px', minHeight: 40 }}>Refresh</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'btn btn-primary' : 'btn btn-outline'}
            onClick={() => setActiveTab(tab.id)}
            style={{ padding: '8px 16px', minHeight: 36, fontSize: 13 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* Monthly Report */}
          {activeTab === 'monthly' && reportData && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Employee <SortIcon field="name" /></th>
                    <th onClick={() => handleSort('present')} style={{ cursor: 'pointer' }}>Present <SortIcon field="present" /></th>
                    <th onClick={() => handleSort('absent')} style={{ cursor: 'pointer' }}>Absent <SortIcon field="absent" /></th>
                    <th onClick={() => handleSort('late')} style={{ cursor: 'pointer' }}>Late <SortIcon field="late" /></th>
                    <th>Half Day</th>
                    <th>Leave</th>
                    <th onClick={() => handleSort('hours')} style={{ cursor: 'pointer' }}>Hours <SortIcon field="hours" /></th>
                    <th onClick={() => handleSort('percent')} style={{ cursor: 'pointer' }}>% <SortIcon field="percent" /></th>
                    <th>Export</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedData().map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td>{r.present}</td>
                      <td style={{ color: r.absent > 0 ? 'var(--danger)' : 'inherit' }}>{r.absent}</td>
                      <td style={{ color: r.late > 0 ? 'var(--warning)' : 'inherit' }}>{r.late}</td>
                      <td>{r.halfDay}</td>
                      <td>{r.onLeave}</td>
                      <td style={{ fontWeight: 600 }}>{r.totalHours}h</td>
                      <td>
                        <span className={`badge ${parseFloat(r.attendancePercent) >= 90 ? 'badge-success' : parseFloat(r.attendancePercent) >= 75 ? 'badge-warning' : 'badge-danger'}`}>
                          {r.attendancePercent}%
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-outline" style={{ padding: '2px 8px', minHeight: 28, fontSize: 11 }} onClick={() => handleExportEmployee(r.id, r.name)}>
                          CSV
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Absent Report */}
          {activeTab === 'absent' && reportData && (
            <div>
              {reportData.absences?.map(a => (
                <div key={a.id} className="card" style={{ marginBottom: 12, border: a.isRepeatOffender ? '2px solid var(--danger)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{a.name}</strong>
                      {a.isRepeatOffender && <span className="badge badge-danger" style={{ marginLeft: 8 }}>⚠️ Repeat ({a.absentCount} absences)</span>}
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Absent on: {a.absentDates.join(', ')}
                      </div>
                    </div>
                    <button className="btn btn-outline" style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }} onClick={() => handleExportEmployee(a.id, a.name)}>
                      Export CSV
                    </button>
                  </div>
                </div>
              ))}
              {(!reportData.absences || reportData.absences.length === 0) && (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  No absences this month 🎉
                </div>
              )}
            </div>
          )}

          {/* Late Report */}
          {activeTab === 'late' && reportData && (
            <div>
              {reportData.byEmployee?.map(e => (
                <div key={e.userId} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{e.name}</strong>
                      <span className="badge badge-warning" style={{ marginLeft: 8 }}>Late {e.count}x this month</span>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Dates: {e.dates.join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(!reportData.byEmployee || reportData.byEmployee.length === 0) && (
                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  No late arrivals this month 👍
                </div>
              )}
            </div>
          )}

          {/* Hours Report */}
          {activeTab === 'hours' && reportData && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Days Worked</th>
                    <th>Total Hours</th>
                    <th>Avg/Day</th>
                    <th>Min Day</th>
                    <th>Max Day</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.report?.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td>{r.daysWorked}</td>
                      <td style={{ fontWeight: 600 }}>{r.totalHours}h</td>
                      <td>{r.avgHoursPerDay}h</td>
                      <td>{r.minHours}h</td>
                      <td>{r.maxHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Leave Report */}
          {activeTab === 'leaves' && reportData && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Leave Type</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Days</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.report?.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td><span className="badge badge-info">{r.leaveType}</span></td>
                      <td>{r.startDate}</td>
                      <td>{r.endDate}</td>
                      <td style={{ fontWeight: 600 }}>{r.totalDays}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleExportCSV}>📥 Export Monthly CSV</button>
        <button className="btn btn-outline" onClick={handleExportAll}>📥 Export Full Database</button>
        <button className="btn btn-outline" onClick={() => navigate('/admin')}>← Back to Dashboard</button>
      </div>
    </div>
  );
}
