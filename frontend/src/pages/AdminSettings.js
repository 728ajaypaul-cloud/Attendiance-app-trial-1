import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AdminSettings() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      setSettings(res.data.settings);
    } catch (err) {
      console.error('Settings fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.put('/settings', settings);
      setMessage('Settings saved successfully!');
    } catch (err) {
      setMessage('Error saving settings: ' + (err.response?.data?.error || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>⚙️ Settings & Configuration</h1>
        <p>Configure attendance rules and system preferences</p>
      </div>

      {message && (
        <div className={`alert ${message.includes('success') ? 'alert-success' : 'alert-error'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-2">
        {/* Attendance Rules */}
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>⏰ Attendance Rules</h3>

          <div className="input-group">
            <label>Working Hours Start</label>
            <input
              type="time"
              className="input-field"
              value={settings.working_hours_start || '09:00'}
              onChange={e => updateSetting('working_hours_start', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Late Threshold Time</label>
            <input
              type="time"
              className="input-field"
              value={settings.late_threshold || '09:30'}
              onChange={e => updateSetting('late_threshold', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Half-Day Threshold (hours)</label>
            <input
              type="number"
              className="input-field"
              value={settings.half_day_threshold_hours || '4'}
              onChange={e => updateSetting('half_day_threshold_hours', e.target.value)}
              min="1"
              max="8"
              step="0.5"
            />
          </div>

          <div className="input-group">
            <label>Working Days</label>
            <select
              className="input-field"
              value={settings.working_days || 'Mon-Fri'}
              onChange={e => updateSetting('working_days', e.target.value)}
            >
              <option value="Mon-Fri">Monday - Friday</option>
              <option value="Mon-Sat">Monday - Saturday</option>
              <option value="Mon-Sun">All 7 days</option>
            </select>
          </div>

          <div className="input-group">
            <label>Timezone</label>
            <select
              className="input-field"
              value={settings.timezone || 'Asia/Kolkata'}
              onChange={e => updateSetting('timezone', e.target.value)}
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="Asia/Dubai">Asia/Dubai</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>

        {/* GPS Settings */}
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>📍 GPS Settings</h3>

          <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ margin: 0 }}>Enable GPS Tracking</label>
            <input
              type="checkbox"
              checked={settings.gps_enabled === 'true'}
              onChange={e => updateSetting('gps_enabled', e.target.checked ? 'true' : 'false')}
              style={{ width: 20, height: 20 }}
            />
          </div>

          <div className="input-group">
            <label>Office Latitude</label>
            <input
              type="number"
              className="input-field"
              value={settings.office_lat || '30.9000'}
              onChange={e => updateSetting('office_lat', e.target.value)}
              step="0.0001"
            />
          </div>

          <div className="input-group">
            <label>Office Longitude</label>
            <input
              type="number"
              className="input-field"
              value={settings.office_lng || '75.8500'}
              onChange={e => updateSetting('office_lng', e.target.value)}
              step="0.0001"
            />
          </div>

          <div className="input-group">
            <label>GPS Radius (meters)</label>
            <input
              type="number"
              className="input-field"
              value={settings.gps_radius_meters || '100'}
              onChange={e => updateSetting('gps_radius_meters', e.target.value)}
              min="10"
              max="10000"
            />
          </div>

          <div className="input-group">
            <label>Auto Mark Late After (minutes past start)</label>
            <input
              type="number"
              className="input-field"
              value={settings.auto_late_after_minutes || '30'}
              onChange={e => updateSetting('auto_late_after_minutes', e.target.value)}
              min="0"
              max="120"
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
        <button className="btn btn-outline btn-lg" onClick={() => navigate('/admin')}>
          ← Back to Dashboard
        </button>
      </div>

      {/* Info card */}
      <div className="card" style={{ marginTop: 24, background: 'var(--bg-secondary)' }}>
        <h4>📋 System Information</h4>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
          <div><strong>Total Employees:</strong> <span id="emp-count">-</span></div>
          <div><strong>Server Time:</strong> {new Date().toLocaleString('en-IN')}</div>
          <div><strong>Database:</strong> SQLite (local)</div>
          <div><strong>Data Retention:</strong> 3+ years</div>
        </div>
      </div>
    </div>
  );
}
