import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ toggleTheme, theme }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span style={{ fontSize: 24 }}>📸</span>
        <span className="navbar-title">Soulful Weddings</span>
      </div>

      {/* Hamburger for mobile */}
      <button className="navbar-hamburger" onClick={() => setMenuOpen(!menuOpen)}>
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
        <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
      </button>

      {/* User info & logout on right (desktop) */}
      <div className={`navbar-right ${menuOpen ? 'show' : ''}`}>
        <div className="navbar-links">
          {isAdmin ? (
            <>
              <Link to="/admin" className={isActive('/admin')} onClick={closeMenu}>Dashboard</Link>
              <Link to="/admin/calendar" className={isActive('/admin/calendar')} onClick={closeMenu}>Calendar</Link>
              <Link to="/admin/reports" className={isActive('/admin/reports')} onClick={closeMenu}>Reports</Link>
              <Link to="/admin/employees" className={isActive('/admin/employees')} onClick={closeMenu}>Employees</Link>
              <Link to="/admin/qr" className={isActive('/admin/qr')} onClick={closeMenu}>QR Codes</Link>
              <Link to="/admin/settings" className={isActive('/admin/settings')} onClick={closeMenu}>Settings</Link>
            </>
          ) : (
            <>
              <Link to="/" className={isActive('/')} onClick={closeMenu}>Home</Link>
              <Link to="/weekly" className={isActive('/weekly')} onClick={closeMenu}>Weekly</Link>
              <Link to="/monthly" className={isActive('/monthly')} onClick={closeMenu}>Monthly</Link>
              <Link to="/qr-scanner" className={isActive('/qr-scanner')} onClick={closeMenu}>📷 Scan QR</Link>
            </>
          )}
        </div>
        <div className="navbar-user">
          <button onClick={toggleTheme} className="btn btn-outline navbar-theme-btn">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <span className="navbar-username">{user?.full_name}</span>
          <button onClick={handleLogout} className="btn btn-danger navbar-logout-btn">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
