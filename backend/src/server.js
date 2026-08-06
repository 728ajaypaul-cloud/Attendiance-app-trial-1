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

  // Create admin
  const adminResult = db.prepare(
    `INSERT INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('Studio Owner', '9876543210', 'owner@soulfulweddings.com', adminHash, 'Admin', 'Owner', '2020-01-01', 'Active');
  db.prepare('INSERT OR IGNORE INTO admins (user_id, permission_level) VALUES (?, ?)').run(adminResult.lastInsertRowid, 'Full Access');

  // Create employees with random passwords (admin sets/resets them later)
  const employees = [
    { name: 'Rahul Sharma', phone: '9812345671', email: 'rahul@soulfulweddings.com', roles: 'Photographer', doj: '2021-06-15' },
    { name: 'Aman Singh', phone: '9812345672', email: 'aman@soulfulweddings.com', roles: 'Cinematographer', doj: '2021-08-01' },
    { name: 'Priya Gupta', phone: '9812345673', email: 'priya@soulfulweddings.com', roles: 'Editor', doj: '2022-01-10' },
    { name: 'Vikram Joshi', phone: '9812345674', email: 'vikram@soulfulweddings.com', roles: 'Drone Pilot', doj: '2022-03-20' },
    { name: 'Neha Kapoor', phone: '9812345675', email: 'neha@soulfulweddings.com', roles: 'Album Designer', doj: '2022-07-05' },
    { name: 'Arjun Verma', phone: '9812345676', email: 'arjun@soulfulweddings.com', roles: 'Assistant', doj: '2023-02-14' },
    { name: 'Simran Kaur', phone: '9812345677', email: 'simran@soulfulweddings.com', roles: 'Cinematographer + Drone Pilot', doj: '2023-05-01' },
    { name: 'Rohit Malhotra', phone: '9812345678', email: 'rohit@soulfulweddings.com', roles: 'Freelancer', doj: '2024-01-15' },
    { name: 'Deepak Kumar', phone: '9812345679', email: 'deepak@soulfulweddings.com', roles: 'Photographer', doj: '2022-11-01' },
    { name: 'Anjali Mehta', phone: '9812345680', email: 'anjali@soulfulweddings.com', roles: 'Editor', doj: '2023-09-10' },
  ];

  const insertEmp = db.prepare(
    `INSERT INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`
  );
  for (const emp of employees) {
    // Each employee gets a unique random password — only admin knows it
    const randomPass = crypto.randomBytes(4).toString('hex');
    const empHash = bcrypt.hashSync(randomPass, 10);
    insertEmp.run(emp.name, emp.phone, emp.email, empHash, 'Employee', emp.roles, emp.doj);
  }

  console.log('Auto-seed complete!');
  console.log('Admin login: owner@soulfulweddings.com / admin123');
  console.log('Employees have random passwords. Admin must set them via the Employees page.');
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/export', require('./routes/export'));
app.use('/api/audit', require('./routes/audit'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve React frontend in production
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  // Only serve index.html for non-API routes
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