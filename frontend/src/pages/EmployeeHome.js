import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function EmployeeHome() {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch today's status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/attendance/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Refresh status every 30s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    setMessage('');
    try {
      // Get GPS position if available
      let gps_lat, gps_lng;
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          });
        });
        gps_lat = pos.coords.latitude;
        gps_lng = pos.coords.longitude;
      } catch (e) {
        // GPS not available, proceed without
        console.log('GPS not available:', e.message);
      }

      const res = await api.post('/attendance/checkin', {
        gps_lat,
        gps_lng,
        device_info: navigator.userAgent
      });

      setMessageType('success');
      setMessage(`✅ Checked in successfully at ${new Date(res.data.checkIn.time).toLocaleTimeString()}`);
      fetchStatus();
    } catch (err) {
      setMessageType('error');
      setMessage(err.response?.data?.error || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    setMessage('');
    try {
      let gps_lat, gps_lng;
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          });
        });
        gps_lat = pos.coords.latitude;
        gps_lng = pos.coords.longitude;
      } catch (e) {
        console.log('GPS not available:', e.message);
      }

      const res = await api.post('/attendance/checkout', {
        gps_lat,
        gps_lng,
        device_info: navigator.userAgent
      });

      setMessageType('success');
      setMessage(`✅ Checked out at ${new Date(res.data.checkOut.checkOutTime).toLocaleTimeString()} | Worked ${res.data.checkOut.duration}`);
      fetchStatus();
    } catch (err) {
      setMessageType('error');
      setMessage(err.response?.data?.error || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate elapsed time for active session
  const getElapsedTime = () => {
    if (!status?.activeSession?.check_in_time) return null;
    const checkIn = new Date(status.activeSession.check_in_time);
    const diff = Date.now() - checkIn.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (status?.isCheckedIn) {
      const timer = setInterval(() => {
        setElapsed(getElapsedTime());
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status?.isCheckedIn]);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>{formatDate(currentTime)}</p>
        <h1 style={{ fontSize: 48, fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(currentTime)}
        </h1>
      </div>

      {status?.isOnLeave && (
        <div className="alert alert-warning" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          🏖️ On Leave: {status.leaveDetails?.leave_type} ({status.leaveDetails?.reason || 'No reason'})
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '32px 0' }}>
        {status?.isCheckedIn ? (
          <>
            <button
              className="checkin-btn checkout"
              onClick={handleCheckOut}
              disabled={actionLoading}
            >
              {actionLoading ? '...' : 'CHECK OUT'}
            </button>
            <div style={{ marginTop: 16 }}>
              <span className="badge badge-success" style={{ fontSize: 16, padding: '8px 16px' }}>
                ✅ Checked In at {new Date(status.activeSession.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            </div>
            <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
              You've worked <strong>{elapsed || getElapsedTime()}</strong>
            </p>
          </>
        ) : status?.checkedInToday && !status?.isCheckedIn ? (
          <>
            <div className="alert alert-info" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
              ✅ All sessions completed for today
            </div>
            <button
              className="checkin-btn checkin"
              onClick={handleCheckIn}
              disabled={actionLoading}
              style={{ marginTop: 16 }}
            >
              {actionLoading ? '...' : 'CHECK IN'}
            </button>
            {status.sessions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Last session: {new Date(status.sessions[status.sessions.length - 1].checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <button
              className="checkin-btn checkin"
              onClick={handleCheckIn}
              disabled={actionLoading}
            >
              {actionLoading ? '...' : 'CHECK IN'}
            </button>
            <div style={{ marginTop: 16 }}>
              <span className="badge badge-danger" style={{ fontSize: 16, padding: '8px 16px' }}>
                ❌ Not Checked In
              </span>
            </div>
          </>
        )}
      </div>

      {message && (
        <div className={`alert alert-${messageType}`} style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
        <button className="btn btn-outline" onClick={() => navigate('/weekly')}>
          📅 Weekly View
        </button>
        <button className="btn btn-outline" onClick={() => navigate('/monthly')}>
          📊 Monthly View
        </button>
      </div>
    </div>
  );
}
