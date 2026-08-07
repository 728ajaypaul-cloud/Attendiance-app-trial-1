import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import EmployeeHome from './pages/EmployeeHome';
import EmployeeWeekly from './pages/EmployeeWeekly';
import EmployeeMonthly from './pages/EmployeeMonthly';
import AdminDashboard from './pages/AdminDashboard';
import AdminCalendar from './pages/AdminCalendar';
import AdminReports from './pages/AdminReports';
import AdminEmployees from './pages/AdminEmployees';
import AdminSettings from './pages/AdminSettings';
import AdminQR from './pages/AdminQR';
import Navbar from './components/Navbar';
import './styles/App.css';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner" />;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'Admin') return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  if (loading) return <div className="spinner" />;

  return (
    <div className="app-container">
      {user && <Navbar toggleTheme={toggleTheme} theme={theme} />}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            {user?.role === 'Admin' ? <AdminDashboard /> : <EmployeeHome />}
          </ProtectedRoute>
        } />
        <Route path="/weekly" element={
          <ProtectedRoute><EmployeeWeekly /></ProtectedRoute>
        } />
        <Route path="/monthly" element={
          <ProtectedRoute><EmployeeMonthly /></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/calendar" element={
          <ProtectedRoute adminOnly><AdminCalendar /></ProtectedRoute>
        } />
        <Route path="/admin/reports" element={
          <ProtectedRoute adminOnly><AdminReports /></ProtectedRoute>
        } />
        <Route path="/admin/employees" element={
          <ProtectedRoute adminOnly><AdminEmployees /></ProtectedRoute>
        } />
        <Route path="/admin/settings" element={
          <ProtectedRoute adminOnly><AdminSettings /></ProtectedRoute>
        } />
        <Route path="/admin/qr" element={
          <ProtectedRoute adminOnly><AdminQR /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
