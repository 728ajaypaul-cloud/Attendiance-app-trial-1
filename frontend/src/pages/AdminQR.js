import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdminQR() {
  const { api } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await api.get('/employees');
      // Show only in-house editors for QR generation
      const editors = res.data.employees.filter(e => e.employee_type === 'in-house-editor');
      setEmployees(editors);
    } catch (err) {
      console.error('Load employees error:', err);
    }
  };

  const generateQR = async () => {
    if (!selectedEmployee) {
      setMessageType('error');
      setMessage('Please select an employee');
      return;
    }
    setLoading(true);
    setMessage('');
    setQrCode(null);
    try {
      const res = await api.post('/qr/generate-printable', {
        user_id: parseInt(selectedEmployee)
      });
      setQrCode(res.data);
      setMessageType('success');
      setMessage('QR code generated! Print and paste at office entrance.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.response?.data?.error || 'Failed to generate QR');
    } finally {
      setLoading(false);
    }
  };

  const printQR = () => {
    if (!qrCode) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>QR Code - ${qrCode.user.name}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          .container { max-width: 500px; margin: 0 auto; }
          img { width: 100%; max-width: 400px; }
          h2 { margin: 20px 0 10px; }
          .wifi { color: #666; font-size: 14px; margin: 10px 0; }
          .instructions { background: #f0f0f0; padding: 15px; border-radius: 8px; font-size: 13px; }
          .footer { margin-top: 30px; font-size: 12px; color: #999; }
          @media print { body { padding: 20px; } }
        </style>
        </head>
        <body>
          <div class="container">
            <h2>📸 Soulful Weddings</h2>
            <h3>Attendance QR Code</h3>
            <img src="${qrCode.qrCode}" alt="QR Code" />
            <p style="font-size:18px;font-weight:bold;margin:10px 0">${qrCode.user.name}</p>
            <p class="wifi">🔒 Only works on: <strong>${qrCode.wifiSsid}</strong></p>
            <div class="instructions">
              <p><strong>📱 Instructions:</strong></p>
              <p>1️⃣ First scan = <strong>Check In</strong></p>
              <p>2️⃣ Second scan = <strong>Check Out</strong></p>
              <p>⚠️ Must be connected to office WiFi</p>
            </div>
            <p class="footer">Soulful Weddings Attendance System</p>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
  };

  return (
    <div className="page">
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>📱 QR Code Generator</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Generate printable QR codes for in-house editors to check in/out at the office entrance.
        </p>

        {message && (
          <div className={`alert alert-${messageType}`} style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div className="input-group">
            <label>Select In-house Editor</label>
            <select
              className="input-field"
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
            >
              <option value="">-- Select Employee --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.roles})
                </option>
              ))}
            </select>
          </div>

          {employees.length === 0 && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              No in-house editors found. Go to Employees page to set employee types.
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            onClick={generateQR}
            disabled={loading || !selectedEmployee}
            style={{ marginTop: 16 }}
          >
            {loading ? 'Generating...' : '🎯 Generate QR Code'}
          </button>
        </div>

        {qrCode && (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <h3 style={{ marginBottom: 16 }}>✅ QR Code Ready</h3>
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              display: 'inline-block',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
            }}>
              <img src={qrCode.qrCode} alt="QR Code" style={{ width: 300, maxWidth: '100%' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 600, marginTop: 16, color: 'var(--text-primary)' }}>
              {qrCode.user.name}
            </p>
            <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
              <p>🔒 WiFi: <strong>{qrCode.wifiSsid}</strong></p>
              <p>🔄 First scan = Check In | Second scan = Check Out</p>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <button className="btn btn-primary" onClick={printQR}>
                🖨️ Print
              </button>
              <button className="btn btn-outline" onClick={() => {
                const link = document.createElement('a');
                link.download = `qr-${qrCode.user.name}.png`;
                link.href = qrCode.qrCode;
                link.click();
              }}>
                💾 Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
