require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initializeDatabase } = require('./database');

initializeDatabase();

console.log('Seeding database...');

const adminHash = bcrypt.hashSync('admin123', 10);
const adminResult = db.prepare(
  `INSERT OR IGNORE INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run('Studio Owner', '9876543210', 'owner@soulfulweddings.com', adminHash, 'Admin', 'Owner', '2020-01-01', 'Active');

if (adminResult.changes > 0) {
  db.prepare('INSERT OR IGNORE INTO admins (user_id, permission_level) VALUES (?, ?)').run(adminResult.lastInsertRowid, 'Full Access');
  console.log('Admin user created: owner@soulfulweddings.com / admin123');
}

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

const empHash = bcrypt.hashSync('emp123', 10);
const insertEmp = db.prepare(
  `INSERT OR IGNORE INTO users (full_name, phone, email, password_hash, role, roles, date_of_joining, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`
);

for (const emp of employees) {
  insertEmp.run(emp.name, emp.phone, emp.email, empHash, 'Employee', emp.roles, emp.doj);
  console.log('Created employee:', emp.name);
}

const today = new Date();
const currentMonth = today.getMonth();
const currentYear = today.getFullYear();
const allUsers = db.prepare("SELECT id FROM users WHERE status = 'Active'").all();

const insertAttendance = db.prepare(
  `INSERT OR IGNORE INTO attendance (user_id, date, check_in_time, check_out_time, status, session_number)
   VALUES (?, ?, ?, ?, ?, ?)`
);

for (const user of allUsers) {
  for (let dayOffset = 1; dayOffset <= 20; dayOffset++) {
    const date = new Date(currentYear, currentMonth, today.getDate() - dayOffset);
    if (date.getDay() === 0) continue;

    const dateStr = date.toISOString().split('T')[0];
    const checkInHour = 8 + Math.floor(Math.random() * 3);
    const checkInMin = Math.floor(Math.random() * 60);
    const checkOutHour = 17 + Math.floor(Math.random() * 3);
    const checkOutMin = Math.floor(Math.random() * 60);

    const checkInTime = dateStr + 'T' + checkInHour.toString().padStart(2, '0') + ':' + checkInMin.toString().padStart(2, '0') + ':00.000Z';
    const checkOutTime = dateStr + 'T' + checkOutHour.toString().padStart(2, '0') + ':' + checkOutMin.toString().padStart(2, '0') + ':00.000Z';

    let status = 'Present';
    if (checkInHour > 9 || (checkInHour === 9 && checkInMin > 30)) {
      status = Math.random() > 0.5 ? 'Late' : 'Present';
    }

    insertAttendance.run(user.id, dateStr, checkInTime, checkOutTime, status, 1);
  }
}

console.log('Sample attendance records created');
console.log('\nLogin credentials:');
console.log('Admin: owner@soulfulweddings.com / admin123');
console.log('Employee: rahul@soulfulweddings.com / emp123');
console.log('(All employees use password: emp123)');
console.log('\nSeed complete!');
