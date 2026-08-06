import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ROLE_OPTIONS = ['Photographer', 'Cinematographer', 'Editor', 'Drone Pilot', 'Assistant', 'Intern', 'Album Designer', 'Freelancer', 'Other'];

export default function AdminEmployees() {
  const { api } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', password: '', roles: 'Photographer',
    date_of_joining: '', is_admin: false, permission_level: 'Full Access'
  });

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    try {
      const res = await api.get('/employees');
      setEmployees(res.data.employees);
    } catch (err) {
      console.error('Load employees error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      await api.post('/auth/register', form);
      setShowAddModal(false);
      resetForm();
      loadEmployees();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add employee');
    }
  };

  const handleEdit = async () => {
    if (!editEmployee) return;
    try {
      await api.put(`/employees/${editEmployee.id}`, form);
      setEditEmployee(null);
      resetForm();
      loadEmployees();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update employee');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Deactivate ${name}? Historical data will be preserved.`)) return;
    try {
      await api.delete(`/employees/${id}`);
      loadEmployees();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate employee');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedIds.length === 0) return alert('Select employees first');
    try {
      await api.post('/employees/bulk', { action, employee_ids: selectedIds });
      setSelectedIds([]);
      loadEmployees();
    } catch (err) {
      alert(err.response?.data?.error || 'Bulk action failed');
    }
  };

  const openEdit = (emp) => {
    setEditEmployee(emp);
    setForm({
      full_name: emp.full_name,
      phone: emp.phone,
      email: emp.email,
      password: '',
      roles: emp.roles,
      date_of_joining: emp.date_of_joining || '',
      is_admin: emp.role === 'Admin',
      permission_level: 'Full Access'
    });
  };

  const resetForm = () => {
    setForm({
      full_name: '', phone: '', email: '', password: '', roles: 'Photographer',
      date_of_joining: '', is_admin: false, permission_level: 'Full Access'
    });
  };

  const filtered = employees.filter(e => {
    if (search) {
      const s = search.toLowerCase();
      if (!e.full_name?.toLowerCase().includes(s) && !e.phone?.includes(s) && !e.email?.toLowerCase().includes(s)) return false;
    }
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  if (loading) return <div className="spinner" />;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <h1>👥 Employee Management</h1>
          <p>{employees.length} total employees</p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowAddModal(true); }}>+ Add Employee</button>
      </div>

      {/* Filters & bulk actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input-field" placeholder="Search name, phone or email..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        {selectedIds.length > 0 && (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selectedIds.length} selected</span>
            <button className="btn btn-success" style={{ padding: '6px 16px', minHeight: 36, fontSize: 13 }} onClick={() => handleBulkAction('activate')}>Activate</button>
            <button className="btn btn-danger" style={{ padding: '6px 16px', minHeight: 36, fontSize: 13 }} onClick={() => handleBulkAction('deactivate')}>Deactivate</button>
          </>
        )}
      </div>

      {/* Employee table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" onChange={e => {
                  if (e.target.checked) setSelectedIds(filtered.map(f => f.id));
                  else setSelectedIds([]);
                }} checked={selectedIds.length === filtered.length && filtered.length > 0} />
              </th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id}>
                <td><input type="checkbox" checked={selectedIds.includes(emp.id)} onChange={() => toggleSelect(emp.id)} /></td>
                <td style={{ fontWeight: 500 }}>{emp.full_name}</td>
                <td>{emp.phone}</td>
                <td style={{ fontSize: 13 }}>{emp.email}</td>
                <td><span className="badge badge-info">{emp.roles}</span></td>
                <td style={{ fontSize: 13 }}>{emp.date_of_joining || '-'}</td>
                <td>
                  <span className={`badge ${emp.status === 'Active' ? 'badge-success' : 'badge-danger'}`}>
                    {emp.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" style={{ padding: '4px 10px', minHeight: 30, fontSize: 12 }} onClick={() => openEdit(emp)}>Edit</button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px', minHeight: 30, fontSize: 12 }} onClick={() => handleDelete(emp.id, emp.full_name)}>
                      {emp.status === 'Active' ? 'Deactivate' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {(showAddModal || editEmployee) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditEmployee(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editEmployee ? 'Edit Employee' : 'Add Employee'}</h2>

            <div className="input-group">
              <label>Full Name *</label>
              <input className="input-field" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" />
            </div>

            <div className="grid grid-2">
              <div className="input-group">
                <label>Phone *</label>
                <input className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" />
              </div>
              <div className="input-group">
                <label>Email *</label>
                <input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" />
              </div>
            </div>

            <div className="grid grid-2">
              <div className="input-group">
                <label>Password {editEmployee ? '(leave blank to keep)' : '*'}</label>
                <input className="input-field" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editEmployee ? 'New password' : 'Password'} />
              </div>
              <div className="input-group">
                <label>Role(s)</label>
                <select className="input-field" value={form.roles} onChange={e => setForm({ ...form, roles: e.target.value })}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="input-group">
                <label>Date of Joining</label>
                <input className="input-field" type="date" value={form.date_of_joining} onChange={e => setForm({ ...form, date_of_joining: e.target.value })} />
              </div>
              <div className="input-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 12 }}>
                <label style={{ marginBottom: 0 }}>
                  <input type="checkbox" checked={form.is_admin} onChange={e => setForm({ ...form, is_admin: e.target.checked })} style={{ width: 18, height: 18, marginRight: 8 }} />
                  Make Admin
                </label>
              </div>
            </div>

            {form.is_admin && (
              <div className="input-group">
                <label>Permission Level</label>
                <select className="input-field" value={form.permission_level} onChange={e => setForm({ ...form, permission_level: e.target.value })}>
                  <option value="Full Access">Full Access</option>
                  <option value="Edit Attendance">Edit Attendance</option>
                  <option value="View-Only">View-Only</option>
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => { setShowAddModal(false); setEditEmployee(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editEmployee ? handleEdit : handleAdd} disabled={!form.full_name || !form.phone || !form.email || (!editEmployee && !form.password)}>
                {editEmployee ? 'Update' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
