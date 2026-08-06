import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ toggleTheme, theme }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path ? 'active' : '';

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span style={{ fontSize: 24 }}>📸</span>
        <span>Soulful Weddings</span>
      </div>
      <div className="navbar-links">
        {isAdmin ? (
          <>
            <Link to="/admin" className={isActive('/admin')}>Dashboard</Link>
            <Link to="/admin/calendar" className={isActive('/admin/calendar')}>Calendar</Link>
            <Link to="/admin/reports" className={isActive('/admin/reports')}>Reports</Link>
            <Link to="/admin/employees" className={isActive('/admin/employees')}>Employees</Link>
            <Link to="/admin/settings" className={isActive('/admin/settings')}>Settings</Link>
          </>
        ) : (
          <>
            <Link to="/" className={isActive('/')}>Home</Link>
            <Link to="/weekly" className={isActive('/weekly')}>Weekly</Link>
            <Link to="/monthly" className={isActive('/monthly')}>Monthly</Link>
          </>
        )}
        <button onClick={toggleTheme} className="btn btn-outline" style={{ padding: '8px 12px', minHeight: 36, fontSize: 14 }}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{user?.full_name}</span>
        <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '8px 16px', minHeight: 36, fontSize: 14 }}>
          Logout
        </button>
      </div>
    </nav>
  );
}
