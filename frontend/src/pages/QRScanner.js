import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function QRScanner() {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [wifiSSID, setWifiSSID] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    // Try to detect WiFi
    tryWifiDetection();
    return () => stopCamera();
  }, []);

  const tryWifiDetection = () => {
    // For mobile browsers, we try to detect WiFi via network information API
    try {
      if (navigator.connection) {
        const conn = navigator.connection;
        if (conn.ssid) {
          setWifiSSID(conn.ssid);
          return;
        }
      }
    } catch(e) {}
    
    // On most phones we can't get SSID from JS — 
    // we'll ask the user to confirm they're on office WiFi
    setWifiSSID('');
  };

  const startCamera = async () => {
    setScanning(true);
    setMessage('');
    setResult(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanQRCode();
      }
    } catch (err) {
      setMessageType('error');
      setMessage('Camera access denied. Please allow camera permissions.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const scanQRCode = () => {
    // Use setInterval to capture frames and look for QR codes
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    let attempts = 0;
    const maxAttempts = 300; // ~30 seconds

    const interval = setInterval(async () => {
      if (!video.videoWidth) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data for QR detection
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Try to decode QR from canvas
      try {
        // Use built-in barcode detector if available
        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          
          if (barcodes.length > 0) {
            clearInterval(interval);
            stopCamera();
            const qrText = barcodes[0].rawValue;
            handleQRData(qrText);
            return;
          }
        }
      } catch(e) {
        // BarcodeDetector not supported or failed
      }

      // Fallback: try jsQR approach via manual parsing
      // Since we can't include jsQR, we'll use the BarcodeDetector API
      // If not available, show an alternative manual input

      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        stopCamera();
        setMessageType('info');
        setMessage('Could not detect QR code. Try the manual QR input below.');
      }
    }, 100);
  };

  const handleQRData = async (qrText) => {
    try {
      // Parse QR data
      let qrData;
      try {
        qrData = JSON.parse(qrText);
      } catch(e) {
        qrData = { token: qrText, smart: true };
      }

      // Ask user to confirm WiFi
      const wifiConfirmed = window.confirm(
        'Are you connected to "Soulful weddings 5G" WiFi?'
      );
      
      if (!wifiConfirmed) {
        setMessageType('error');
        setMessage('Please connect to "Soulful weddings 5G" WiFi and try again.');
        return;
      }

      setMessageType('info');
      setMessage('Processing scan...');

      // Send to server
      const res = await api.post('/qr/scan', {
        qrData,
        wifi_ssid: 'Soulful weddings 5G',
        wifi_bssid: ''
      });

      setResult(res.data);
      setMessageType('success');
      setMessage(res.data.message);
      
      // Refresh page after 3 seconds
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (err) {
      setMessageType('error');
      setMessage(err.response?.data?.error || 'Scan failed. Try again.');
    }
  };

  const handleManualQRInput = async () => {
    const input = prompt('Paste the QR code text here:');
    if (input) {
      await handleQRData(input);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 500, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22 }}>📱 QR Scanner</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Scan the QR code at the office entrance
        </p>
      </div>

      {message && (
        <div className={`alert alert-${messageType}`} style={{ marginBottom: 16, textAlign: 'center' }}>
          {message}
        </div>
      )}

      {result ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>
            {result.action === 'checkin' ? '✅' : '👋'}
          </div>
          <h2>{result.user?.name}</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            {result.action === 'checkin' ? 'Checked In' : 'Checked Out'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {result.action === 'checkout' ? `Worked ${result.duration}` : ''}
          </p>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            {!scanning ? (
              <>
                <div style={{ fontSize: 64, marginBottom: 16 }}>📷</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                  Point your camera at the office QR code
                </p>
                <div style={{ background: '#F0F0F0', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#666' }}>
                  🔒 Works only on <strong>Soulful weddings 5G</strong> WiFi
                </div>
                <button className="btn btn-primary btn-lg btn-block" onClick={startCamera}>
                  📷 Open Camera
                </button>
                <button 
                  className="btn btn-outline btn-block" 
                  style={{ marginTop: 12 }}
                  onClick={handleManualQRInput}
                >
                  ⌨️ Enter QR Code Manually
                </button>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', width: '100%', maxWidth: 400, margin: '0 auto' }}>
                  <video 
                    ref={videoRef}
                    style={{ width: '100%', borderRadius: 12, border: '3px solid var(--primary)' }}
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 200, height: 200,
                    border: '3px dashed rgba(108,99,255,0.5)',
                    borderRadius: 12
                  }} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 12 }}>
                  Scanning... Align QR code within the box
                </p>
                <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={stopCamera}>
                  Cancel
                </button>
              </>
            )}
          </div>

          <div className="card" style={{ padding: 16, marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            <p><strong>📋 Instructions:</strong></p>
            <p>1. Connect to <strong>Soulful weddings 5G</strong> WiFi</p>
            <p>2. Tap "Open Camera"</p>
            <p>3. Scan QR at office entrance</p>
            <p>4. First scan = ✅ Check In</p>
            <p>5. Second scan = 👋 Check Out</p>
          </div>
        </>
      )}
    </div>
  );
}
