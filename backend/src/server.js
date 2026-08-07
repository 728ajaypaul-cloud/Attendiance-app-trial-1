require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, initializeDatabase } = require('./database');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/auth', limiter);

app.use('/uploads', express.static('uploads'));
initializeDatabase();
app.set('io', io);

// Auto-seed if no users exist (fresh deploy)
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  console.log('Empty database detected — auto-seeding...');
  const adminHash = bcrypt.hashSync('admin123', 10);
  const empHash = bcrypt.hashSync('emp123', 10);

  // Create admin
  const adminResult = db.prepare(
    `INSERT INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status, employee_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('Studio Owner', '9876543210', 'owner@soulfulweddings.com', adminHash, 'Admin', 'Owner', '2020-01-01', 'Active', 'other');
  db.prepare('INSERT OR IGNORE INTO admins (user_id, permission_level) VALUES (?, ?)').run(adminResult.lastInsertRowid, 'Full Access');

  // Also create Ajay as admin
  const ajayHash = bcrypt.hashSync('ajay123', 10);
  const ajayResult = db.prepare(
    `INSERT INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status, employee_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('Ajay', '9812345681', 'ajay@soulfulweddings.com', ajayHash, 'Admin', 'Owner', '2020-01-01', 'Active', 'other');
  db.prepare('INSERT OR IGNORE INTO admins (user_id, permission_level) VALUES (?, ?)').run(ajayResult.lastInsertRowid, 'Full Access');

  // Create 6 employees
  const employees = [
    { name: 'Nonu', phone: '9812345671', email: 'nonu@soulfulweddings.com', roles: 'Editor', doj: '2024-01-01' },
    { name: 'Sahil', phone: '9812345672', email: 'sahil@soulfulweddings.com', roles: 'Editor', doj: '2024-01-01' },
    { name: 'Junior', phone: '9812345673', email: 'junior@soulfulweddings.com', roles: 'Editor', doj: '2024-01-01' },
    { name: 'Rohit', phone: '9812345674', email: 'rohit1@soulfulweddings.com', roles: 'Photographer', doj: '2024-01-01' },
    { name: 'Vikas', phone: '9812345675', email: 'vikas@soulfulweddings.com', roles: 'Editor', doj: '2024-01-01' },
    { name: 'Ajay Kumar', phone: '9812345676', email: 'ajayk@soulfulweddings.com', roles: 'Photographer', doj: '2024-01-01' },
  ];

  const insertEmp = db.prepare(
    `INSERT INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status, employee_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', 'other')`
  );
  for (const emp of employees) {
    insertEmp.run(emp.name, emp.phone, emp.email, empHash, 'Employee', emp.roles, emp.doj);
  }

  console.log('Auto-seed complete!');
  console.log('Admin: owner@soulfulweddings.com / admin123');
  console.log('Admin: ajay@soulfulweddings.com / ajay123');
  console.log('Employees all use password: emp123');
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/export', require('./routes/export'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/qr', require('./routes/qr'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve React frontend in production
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join-admin', () => socket.join('admin-room'));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('Soulful Weddings Attendance API running on port ' + PORT);
});

module.exports = { app, server, io };
