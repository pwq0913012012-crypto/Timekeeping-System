// ============================================================
// DUCK 企業打卡系統 — Express + sql.js Backend
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'duck-hr-system-secret-key-2024';
const DB_PATH = path.join(__dirname, 'hr_system.db');

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// SHIFT CONSTANTS
// ============================================================
const SHIFT_TIMES = {
  morning:   { startH:9, endH:18, label:'早班' },
  afternoon: { startH:14, endH:22, label:'中班' },
  night:     { startH:22, endH:6, label:'晚班' }
};

const UID_SHIFT_MAP = { 9:'afternoon', 10:'afternoon', 11:'night', 12:'night' };

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function pad2(n) { return String(n).padStart(2, '0'); }
function minToTime(m) { return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }

function fmtDate(d) {
  if (typeof d === 'string') return d;
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function todayStr() { return fmtDate(new Date()); }

// sql.js helpers
let db;

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  return { lastInsertRowid: dbGet('SELECT last_insert_rowid() as id').id, changes: db.getRowsModified() };
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Periodic save
setInterval(saveDatabase, 30000);

function getUserShift(userId, dateStr) {
  const s = dbGet('SELECT shift_type FROM schedules WHERE user_id = ? AND date = ?', [userId, dateStr]);
  if (s) return s.shift_type;
  return UID_SHIFT_MAP[userId] || 'morning';
}

function userToJSON(u) {
  return {
    id: u.id,
    employeeId: u.employee_id,
    name: u.name,
    email: u.email,
    departmentId: u.department_id,
    role: u.role,
    salary: u.salary,
    status: u.status,
    hireDate: u.hire_date
  };
}

function attendanceToJSON(a) {
  return {
    id: a.id,
    userId: a.user_id,
    date: a.date,
    clockIn: a.clock_in,
    clockOut: a.clock_out,
    status: a.status,
    lateMinutes: a.late_minutes,
    earlyLeaveMinutes: a.early_leave_minutes,
    shift: a.shift
  };
}

function leaveToJSON(l) {
  return {
    id: l.id,
    userId: l.user_id,
    type: l.type,
    startDate: l.start_date,
    endDate: l.end_date,
    reason: l.reason,
    status: l.status,
    approvedBy: l.approved_by,
    createdAt: l.created_at
  };
}

function overtimeToJSON(o) {
  return {
    id: o.id,
    userId: o.user_id,
    date: o.date,
    hours: o.hours,
    reason: o.reason,
    status: o.status,
    approvedBy: o.approved_by
  };
}

function announcementToJSON(a) {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    authorId: a.author_id,
    createdAt: a.created_at,
    pinned: !!a.pinned
  };
}

function scheduleToJSON(s) {
  return {
    id: s.id,
    userId: s.user_id,
    date: s.date,
    shiftType: s.shift_type
  };
}

function leaveBalanceToJSON(b) {
  return {
    id: b.id,
    userId: b.user_id,
    leaveType: b.leave_type,
    totalDays: b.total_days,
    usedDays: b.used_days,
    year: b.year
  };
}

function departmentToJSON(d) {
  return {
    id: d.id,
    name: d.name,
    managerId: d.manager_id
  };
}

// ============================================================
// CREATE TABLES
// ============================================================
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      department_id INTEGER,
      role TEXT DEFAULT 'employee',
      salary INTEGER DEFAULT 40000,
      status TEXT DEFAULT 'active',
      hire_date TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      manager_id INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      clock_in TEXT,
      clock_out TEXT,
      status TEXT DEFAULT 'normal',
      late_minutes INTEGER DEFAULT 0,
      early_leave_minutes INTEGER DEFAULT 0,
      shift TEXT DEFAULT 'morning'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      created_at TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS overtime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      created_at TEXT,
      pinned INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      shift_type TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS leave_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      leave_type TEXT NOT NULL,
      total_days INTEGER NOT NULL,
      used_days INTEGER DEFAULT 0,
      year INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
}

// ============================================================
// SEED DATA
// ============================================================
function seedDatabase() {
  const userCount = dbGet('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count > 0) return;

  const now = new Date();
  const year = now.getFullYear();

  // Departments
  dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [1, '研發部', 2]);
  dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [2, '業務部', 4]);
  dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [3, '人資部', 1]);
  dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [4, '財務部', 7]);

  // Users
  const users = [
    [1, 'A001', '系統管理員', 'admin@company.com', 'admin123', 3, 'admin', 80000, 'active', '2020-01-01'],
    [2, 'A002', '王大明', 'wang@company.com', '123456', 1, 'manager', 65000, 'active', '2021-03-15'],
    [3, 'A003', '李小華', 'li@company.com', '123456', 1, 'employee', 48000, 'active', '2022-06-01'],
    [4, 'A004', '張美玲', 'zhang@company.com', '123456', 2, 'manager', 62000, 'active', '2021-07-20'],
    [5, 'A005', '陳志豪', 'chen@company.com', '123456', 2, 'employee', 45000, 'active', '2023-01-10'],
    [6, 'A006', '林雅婷', 'lin@company.com', '123456', 3, 'employee', 50000, 'active', '2022-09-01'],
    [7, 'A007', '黃建國', 'huang@company.com', '123456', 4, 'manager', 60000, 'active', '2020-11-15'],
    [8, 'A008', '吳佳蓉', 'wu@company.com', '123456', 4, 'employee', 46000, 'active', '2023-04-01'],
    [9, 'A009', '許志偉', 'hsu@company.com', '123456', 1, 'employee', 47000, 'active', '2024-02-15'],
    [10, 'A010', '鄭雅琪', 'cheng@company.com', '123456', 2, 'employee', 46000, 'active', '2024-05-01'],
    [11, 'A011', '蔡明翰', 'tsai@company.com', '123456', 1, 'employee', 48000, 'active', '2024-01-10'],
    [12, 'A012', '周佩君', 'chou@company.com', '123456', 4, 'employee', 45000, 'active', '2024-06-20'],
  ];
  for (const u of users) {
    const hashed = bcrypt.hashSync(u[4], 10);
    dbRun('INSERT INTO users (id, employee_id, name, email, password, department_id, role, salary, status, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [u[0], u[1], u[2], u[3], hashed, u[5], u[6], u[7], u[8], u[9]]);
  }

  // Sample attendance
  generateSampleAttendance(now);

  // Leaves
  dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [3, '特休', `${year}-03-25`, `${year}-03-26`, '家庭旅遊', 'approved', 2, `${year}-03-20`]);
  dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [5, '病假', `${year}-03-28`, `${year}-03-28`, '感冒發燒', 'approved', 4, `${year}-03-27`]);
  dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [8, '事假', `${year}-04-05`, `${year}-04-05`, '個人事務', 'pending', null, `${year}-04-01`]);

  // Overtime
  dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [3, `${year}-03-20`, 2, '專案趕工', 'approved', 2]);
  dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [5, `${year}-03-22`, 3, '客戶需求緊急', 'approved', 4]);
  dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [6, `${year}-04-01`, 1.5, '月報整理', 'pending', null]);

  // Announcements
  dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    ['四月份員工旅遊通知', '本月 25 日（星期六）將舉辦公司員工旅遊，地點為日月潭。請各部門於 4/10 前回報參加人數。交通統一安排遊覽車，費用由公司全額補助。', 1, `${year}-04-01T09:00:00`, 1]);
  dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    ['系統維護公告', '本週六晚間 22:00 至隔日 06:00 將進行系統維護，期間打卡系統暫停服務。請同仁提前完成打卡作業。', 1, `${year}-03-28T14:30:00`, 0]);
  dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    ['新進員工歡迎會', '歡迎三月份加入的新同仁！本週五下午 3 點將於 B1 會議室舉辦歡迎茶會，邀請各位同仁踴躍參加。', 6, `${year}-03-26T10:00:00`, 0]);

  // Schedules
  generateDefaultSchedules(now);

  // Leave balances
  generateLeaveBalances(year);

  saveDatabase();
  console.log('Database seeded successfully.');
}

function generateSampleAttendance(now) {
  const year = now.getFullYear(), month = now.getMonth();
  const SHIFT_CFG = {
    morning:   { startH:9, startM:0, endH:18, endM:0, earlyBase:8, earlyRange:15 },
    afternoon: { startH:14, startM:0, endH:22, endM:0, earlyBase:13, earlyRange:15 },
    night:     { startH:22, startM:0, endH:6, endM:0, earlyBase:21, earlyRange:15 }
  };

  let seed = year * 10000 + month * 100 + now.getDate();
  function srand() { seed = (seed * 16807 + 7) % 2147483647; return (seed & 0x7fffffff) / 2147483647; }

  const records = [];

  for (let d = 29; d >= 0; d--) {
    const date = new Date(year, month, now.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = fmtDate(date);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    for (let uid = 2; uid <= 12; uid++) {
      let clockIn, clockOut, status = 'normal', lateMins = 0, earlyMins = 0;
      const r1 = srand(), r2 = srand();
      const shift = UID_SHIFT_MAP[uid] || 'morning';
      const cfg = SHIFT_CFG[shift];
      const shiftStartMin = cfg.startH * 60 + cfg.startM;
      const shiftEndMin = cfg.endH * 60 + (cfg.endM || 0);
      const crossesMidnight = shiftEndMin < shiftStartMin;

      if (r1 < 0.05 && d > 0) continue;
      if (d === 0 && nowMin < shiftStartMin - 15) continue;

      if (r1 < 0.20) {
        lateMins = Math.floor(srand() * 25) + 5;
        clockIn = minToTime(shiftStartMin + lateMins);
        status = 'late';
      } else {
        clockIn = minToTime(cfg.earlyBase * 60 + Math.floor(srand() * cfg.earlyRange) + 45);
      }

      if (d === 0) {
        const [ciH, ciM] = clockIn.split(':').map(Number);
        if (ciH * 60 + ciM > nowMin) continue;
        const shiftEnded = crossesMidnight
          ? (nowMin > shiftEndMin && nowMin < shiftStartMin)
          : (nowMin > shiftEndMin);
        if (shiftEnded) {
          clockOut = srand() < 0.8 ? `${pad2(cfg.endH)}:${pad2(Math.floor(srand() * 15))}` : null;
        } else {
          clockOut = null;
        }
      } else {
        const isCrossMidnight = cfg.endH < cfg.startH;
        if (d === 1 && isCrossMidnight && nowMin < cfg.endH * 60 + (cfg.endM || 0)) {
          clockOut = null;
        } else if (r2 < 0.15) {
          earlyMins = Math.floor(srand() * 25) + 5;
          clockOut = minToTime(cfg.endH * 60 - earlyMins);
          status = status === 'late' ? 'late+early' : 'early';
        } else {
          clockOut = `${pad2(cfg.endH)}:${pad2(Math.floor(srand() * 25))}`;
        }
      }
      records.push({ uid, dateStr, clockIn, clockOut, status, lateMins, earlyMins, shift });
    }
  }

  // Guaranteed early leave records (yesterday)
  const yesterday = new Date(year, month, now.getDate() - 1);
  if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6) {
    const yd = fmtDate(yesterday);
    const filtered = records.filter(r => !(r.dateStr === yd && [5, 7, 10, 12].includes(r.uid)));
    records.length = 0;
    records.push(...filtered);

    records.push({ uid:5, dateStr:yd, clockIn:'08:52', clockOut:'17:35', status:'early', lateMins:0, earlyMins:25, shift:'morning' });
    records.push({ uid:7, dateStr:yd, clockIn:'08:48', clockOut:'17:42', status:'early', lateMins:0, earlyMins:18, shift:'morning' });
    records.push({ uid:10, dateStr:yd, clockIn:'13:55', clockOut:'21:38', status:'early', lateMins:0, earlyMins:22, shift:'afternoon' });
    records.push({ uid:12, dateStr:yd, clockIn:'21:50', clockOut:'05:40', status:'early', lateMins:0, earlyMins:20, shift:'night' });
  }

  for (const r of records) {
    dbRun('INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [r.uid, r.dateStr, r.clockIn, r.clockOut || null, r.status, r.lateMins, r.earlyMins, r.shift]);
  }
}

function generateDefaultSchedules(now) {
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  for (let w = 0; w < 14; w++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + w);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = fmtDate(d);
    dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [9, dateStr, 'afternoon']);
    dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [10, dateStr, 'afternoon']);
    dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [11, dateStr, 'night']);
    dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [12, dateStr, 'night']);
  }
}

function generateLeaveBalances(year) {
  const types = ['特休','病假','事假','婚假','喪假'];
  const days = [7, 30, 14, 8, 8];
  let seed = year * 31;
  function srand() { seed = (seed * 16807 + 7) % 2147483647; return (seed & 0x7fffffff) / 2147483647; }

  for (let uid = 1; uid <= 12; uid++) {
    types.forEach((t, i) => {
      const used = Math.floor(srand() * Math.min(3, days[i]));
      dbRun('INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, year) VALUES (?, ?, ?, ?, ?)',
        [uid, t, days[i], used, year]);
    });
  }
}

// ============================================================
// WEEKLY CYCLE ATTENDANCE (ensureTodayAttendance)
// ============================================================
function ensureTodayAttendance(excludeUserId) {
  const today = todayStr();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const meta = dbGet('SELECT value FROM meta WHERE key = ?', ['lastAttendanceDate']);
  if (meta && meta.value === today) return;

  const shiftCfg = {
    morning:   { startH:9, endH:18, earlyBase:8 },
    afternoon: { startH:14, endH:22, earlyBase:13 },
    night:     { startH:22, endH:6, earlyBase:21 }
  };

  const weeklyLate  = { 1:[3,10], 2:[5,7], 3:[4,9], 4:[2,6], 5:[8,3] };
  const weeklyEarly = { 1:[7,12], 2:[4,11], 3:[6,8], 4:[5,10], 5:[2,9] };
  const lateMinPool  = [12, 18, 7, 25, 15, 9, 22, 5, 30, 14, 8, 20];
  const earlyMinPool = [10, 15, 22, 8, 18, 12, 25, 6, 20, 14, 9, 17];

  const dayOfWeek = now.getDay();
  const dayOfMonth = now.getDate();
  const todayLate = weeklyLate[dayOfWeek] || [];
  const todayEarly = weeklyEarly[dayOfWeek] || [];

  const activeUsers = dbAll('SELECT * FROM users WHERE status = ?', ['active']);

  for (const u of activeUsers) {
    if (u.id === excludeUserId) continue;
    const existing = dbGet('SELECT id FROM attendance WHERE user_id = ? AND date = ?', [u.id, today]);
    if (existing) continue;

    const shift = UID_SHIFT_MAP[u.id] || 'morning';
    const cfg = shiftCfg[shift];
    const shiftStartMin = cfg.startH * 60;
    const shiftEndMin = cfg.endH * 60;
    const crossesMidnight = shiftEndMin < shiftStartMin;

    if (crossesMidnight) {
      if (nowMin < shiftStartMin - 15 && nowMin > shiftEndMin) continue;
    } else {
      if (nowMin < shiftStartMin - 15) continue;
    }

    const isLate = todayLate.includes(u.id);
    const isEarly = todayEarly.includes(u.id);
    let clockIn, clockOut = null, status = 'normal', lateMins = 0, earlyMins = 0;

    if (isLate) {
      lateMins = lateMinPool[(u.id + dayOfMonth) % lateMinPool.length];
      clockIn = minToTime(cfg.startH * 60 + lateMins);
      status = 'late';
    } else {
      const offset = ((u.id * 7 + dayOfMonth * 3) % 14) + 1;
      clockIn = minToTime(cfg.earlyBase * 60 + 60 - offset);
    }

    const [ciH, ciM] = clockIn.split(':').map(Number);
    if (ciH * 60 + ciM > nowMin) continue;

    const shiftEnded = crossesMidnight
      ? (nowMin > shiftEndMin && nowMin < shiftStartMin)
      : (nowMin > shiftEndMin);

    if (shiftEnded) {
      if (isEarly) {
        earlyMins = earlyMinPool[(u.id + dayOfMonth) % earlyMinPool.length];
        clockOut = minToTime(cfg.endH * 60 - earlyMins);
        status = status === 'late' ? 'late+early' : 'early';
      } else {
        clockOut = `${pad2(cfg.endH)}:${pad2(((u.id * 3 + dayOfMonth) % 12) + 1)}`;
      }
    }

    dbRun('INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [u.id, today, clockIn, clockOut, status, lateMins, earlyMins, shift]);
  }

  dbRun('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['lastAttendanceDate', today]);
  saveDatabase();
}

// ============================================================
// JWT AUTH MIDDLEWARE
// ============================================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授權，請先登入' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token 無效或已過期' });
  }
}

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login') return next();
  authMiddleware(req, res, next);
});

// ============================================================
// API ROUTES
// ============================================================

// ---------- AUTH ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '請提供帳號與密碼' });
  }

  let user;
  if (username === 'admin') {
    user = dbGet('SELECT * FROM users WHERE role = ? AND status = ?', ['admin', 'active']);
  } else {
    user = dbGet('SELECT * FROM users WHERE (employee_id = ? OR email = ?) AND status = ?', [username, username, 'active']);
  }

  if (!user) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  ensureTodayAttendance(user.id);

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    token,
    user: userToJSON(user)
  });
});

// ---------- ATTENDANCE ----------
app.get('/api/attendance', (req, res) => {
  const dateStr = req.query.date || todayStr();
  let records = dbAll('SELECT * FROM attendance WHERE date = ?', [dateStr]);

  const activeUsers = dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  const result = records.map(attendanceToJSON);

  for (const u of activeUsers) {
    if (!result.find(r => r.userId === u.id)) {
      result.push({
        id: null,
        userId: u.id,
        date: dateStr,
        clockIn: null,
        clockOut: null,
        status: 'absent',
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        shift: getUserShift(u.id, dateStr)
      });
    }
  }

  result.sort((a, b) => a.userId - b.userId);

  res.json({
    records: result,
    users: activeUsers.map(userToJSON),
    departments: dbAll('SELECT * FROM departments').map(departmentToJSON)
  });
});

app.post('/api/attendance/clockin', (req, res) => {
  const userId = req.user.id;
  const today = todayStr();

  const existing = dbGet('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);
  if (existing) {
    return res.status(400).json({ error: '今日已打卡上班' });
  }

  const now = new Date();
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const shift = getUserShift(userId, today);
  const cfg = SHIFT_TIMES[shift];
  const workStartMin = cfg.startH * 60 + 10;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isLate = nowMin > workStartMin;
  const lateMins = isLate ? nowMin - cfg.startH * 60 : 0;

  dbRun('INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, today, timeStr, null, isLate ? 'late' : 'normal', lateMins, 0, shift]);
  saveDatabase();

  const record = dbGet('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);

  res.json({
    record: attendanceToJSON(record),
    message: isLate ? `上班打卡成功（遲到 ${lateMins} 分鐘）` : `上班打卡成功！(${cfg.label})`,
    isLate
  });
});

app.post('/api/attendance/clockout', (req, res) => {
  const userId = req.user.id;
  const today = todayStr();

  const record = dbGet('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);
  if (!record) {
    return res.status(400).json({ error: '尚未打卡上班' });
  }
  if (record.clock_out) {
    return res.status(400).json({ error: '今日已打卡下班' });
  }

  const now = new Date();
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const shift = record.shift || getUserShift(userId, today);
  const cfg = SHIFT_TIMES[shift];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endMin = cfg.endH * 60;
  const isEarly = nowMin < endMin;
  const earlyMins = isEarly ? endMin - nowMin : 0;

  let newStatus = record.status;
  if (isEarly) {
    newStatus = record.status === 'late' ? 'late+early' : 'early';
  }

  dbRun('UPDATE attendance SET clock_out = ?, early_leave_minutes = ?, status = ? WHERE id = ?',
    [timeStr, earlyMins, newStatus, record.id]);
  saveDatabase();

  const updated = dbGet('SELECT * FROM attendance WHERE id = ?', [record.id]);

  res.json({
    record: attendanceToJSON(updated),
    message: isEarly ? `下班打卡成功（早退 ${earlyMins} 分鐘）` : '下班打卡成功！祝您有美好的一天！',
    isEarly
  });
});

// ---------- LEAVES ----------
app.get('/api/leaves', (req, res) => {
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const isManagerOrAdmin = user.role === 'admin' || user.role === 'manager';
  let leaves;
  if (isManagerOrAdmin) {
    leaves = dbAll('SELECT * FROM leaves ORDER BY id DESC');
  } else {
    leaves = dbAll('SELECT * FROM leaves WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  }
  const users = dbAll('SELECT * FROM users').map(userToJSON);
  res.json({ leaves: leaves.map(leaveToJSON), users, isManager: isManagerOrAdmin });
});

app.post('/api/leaves', (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  if (!type || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: '請填寫完整資訊' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: '結束日期不可早於開始日期' });
  }

  dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, type, startDate, endDate, reason, 'pending', null, todayStr()]);
  saveDatabase();

  res.json({ message: '請假申請已送出' });
});

app.put('/api/leaves/:id', (req, res) => {
  const { status } = req.body;
  const leaveId = parseInt(req.params.id);
  const leave = dbGet('SELECT * FROM leaves WHERE id = ?', [leaveId]);
  if (!leave) return res.status(404).json({ error: '找不到此請假記錄' });

  dbRun('UPDATE leaves SET status = ?, approved_by = ? WHERE id = ?', [status, req.user.id, leaveId]);

  if (status === 'approved') {
    const days = Math.ceil((new Date(leave.end_date) - new Date(leave.start_date)) / 86400000) + 1;
    const bal = dbGet('SELECT * FROM leave_balances WHERE user_id = ? AND leave_type = ?', [leave.user_id, leave.type]);
    if (bal) {
      dbRun('UPDATE leave_balances SET used_days = used_days + ? WHERE id = ?', [days, bal.id]);
    }
  }

  saveDatabase();
  res.json({ message: status === 'approved' ? '已核准請假' : '已拒絕請假' });
});

// ---------- OVERTIME ----------
app.get('/api/overtime', (req, res) => {
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const isManagerOrAdmin = user.role === 'admin' || user.role === 'manager';
  let ots;
  if (isManagerOrAdmin) {
    ots = dbAll('SELECT * FROM overtime ORDER BY id DESC');
  } else {
    ots = dbAll('SELECT * FROM overtime WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  }
  const users = dbAll('SELECT * FROM users').map(userToJSON);
  res.json({ overtime: ots.map(overtimeToJSON), users, isManager: isManagerOrAdmin });
});

app.post('/api/overtime', (req, res) => {
  const { date, hours, reason } = req.body;
  if (!date || !hours || !reason) {
    return res.status(400).json({ error: '請填寫完整資訊' });
  }

  dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, date, hours, reason, 'pending', null]);
  saveDatabase();

  res.json({ message: '加班申請已送出' });
});

app.put('/api/overtime/:id', (req, res) => {
  const { status } = req.body;
  const otId = parseInt(req.params.id);

  dbRun('UPDATE overtime SET status = ?, approved_by = ? WHERE id = ?', [status, req.user.id, otId]);
  saveDatabase();

  res.json({ message: status === 'approved' ? '已核准加班' : '已拒絕加班' });
});

// ---------- EMPLOYEES ----------
app.get('/api/employees', (req, res) => {
  const users = dbAll('SELECT * FROM users ORDER BY id ASC');
  const departments = dbAll('SELECT * FROM departments');
  const maxId = dbGet('SELECT MAX(id) as maxId FROM users');
  const nextId = (maxId && maxId.maxId ? maxId.maxId : 0) + 1;
  res.json({
    users: users.map(userToJSON),
    departments: departments.map(departmentToJSON),
    nextId
  });
});

app.post('/api/employees', (req, res) => {
  const { employeeId, name, email, password, departmentId, role, salary, hireDate } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: '請填寫完整資訊' });
  }

  const hashed = bcrypt.hashSync(password || '123456', 10);
  const result = dbRun('INSERT INTO users (employee_id, name, email, password, department_id, role, salary, status, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [employeeId, name, email, hashed, departmentId, role || 'employee', salary || 40000, 'active', hireDate || todayStr()]);

  const year = new Date().getFullYear();
  const types = ['特休','病假','事假','婚','喪假'];
  const days = [7, 30, 14, 8, 8];
  types.forEach((t, i) => {
    dbRun('INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, year) VALUES (?, ?, ?, ?, ?)',
      [result.lastInsertRowid, t, days[i], 0, year]);
  });

  saveDatabase();
  res.json({ message: '員工已新增', id: result.lastInsertRowid });
});

app.put('/api/employees/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const { employeeId, name, email, password, departmentId, role, salary, hireDate, status } = req.body;

  if (status !== undefined) {
    dbRun('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    saveDatabase();
    const u = dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    return res.json({ message: `已${status === 'active' ? '啟用' : '停用'} ${u.name}`, user: userToJSON(u) });
  }

  if (password) {
    const hashed = bcrypt.hashSync(password, 10);
    if (employeeId) {
      dbRun('UPDATE users SET employee_id = ?, name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ?, password = ? WHERE id = ?',
        [employeeId, name, email, departmentId, role, salary, hireDate, hashed, userId]);
    } else {
      dbRun('UPDATE users SET name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ?, password = ? WHERE id = ?',
        [name, email, departmentId, role, salary, hireDate, hashed, userId]);
    }
  } else {
    if (employeeId) {
      dbRun('UPDATE users SET employee_id = ?, name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ? WHERE id = ?',
        [employeeId, name, email, departmentId, role, salary, hireDate, userId]);
    } else {
      dbRun('UPDATE users SET name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ? WHERE id = ?',
        [name, email, departmentId, role, salary, hireDate, userId]);
    }
  }

  saveDatabase();
  res.json({ message: '員工資料已更新' });
});

// ---------- DEPARTMENTS ----------
app.get('/api/departments', (req, res) => {
  const departments = dbAll('SELECT * FROM departments');
  const users = dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  res.json({
    departments: departments.map(d => {
      const dept = departmentToJSON(d);
      dept.memberCount = users.filter(u => u.department_id === d.id).length;
      return dept;
    }),
    users: users.map(userToJSON)
  });
});

app.post('/api/departments', (req, res) => {
  const { name, managerId } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入部門名稱' });

  dbRun('INSERT INTO departments (name, manager_id) VALUES (?, ?)', [name, managerId || null]);
  saveDatabase();
  res.json({ message: '部門已新增' });
});

app.put('/api/departments/:id', (req, res) => {
  const { name, managerId } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入部門名稱' });

  dbRun('UPDATE departments SET name = ?, manager_id = ? WHERE id = ?', [name, managerId || null, parseInt(req.params.id)]);
  saveDatabase();
  res.json({ message: '部門已更新' });
});

// ---------- ANNOUNCEMENTS ----------
app.get('/api/announcements', (req, res) => {
  const anns = dbAll('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC');
  const users = dbAll('SELECT * FROM users').map(userToJSON);
  res.json({ announcements: anns.map(announcementToJSON), users });
});

app.post('/api/announcements', (req, res) => {
  const { title, content, pinned } = req.body;
  if (!title || !content) return res.status(400).json({ error: '請填寫完整資訊' });

  dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    [title, content, req.user.id, new Date().toISOString(), pinned ? 1 : 0]);
  saveDatabase();
  res.json({ message: '公告已發布' });
});

app.delete('/api/announcements/:id', (req, res) => {
  dbRun('DELETE FROM announcements WHERE id = ?', [parseInt(req.params.id)]);
  saveDatabase();
  res.json({ message: '公告已刪除' });
});

// ---------- SCHEDULES ----------
app.get('/api/schedules', (req, res) => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const schedules = dbAll('SELECT * FROM schedules WHERE date >= ? AND date <= ?', [fmtDate(weekStart), fmtDate(weekEnd)]);
  const users = dbAll('SELECT * FROM users WHERE status = ?', ['active']);

  res.json({
    schedules: schedules.map(scheduleToJSON),
    users: users.map(userToJSON),
    weekStart: fmtDate(weekStart),
    weekEnd: fmtDate(weekEnd)
  });
});

app.post('/api/schedules', (req, res) => {
  const { userId, date, shiftType } = req.body;
  if (!userId || !date || !shiftType) return res.status(400).json({ error: '請填寫完整資訊' });

  const existing = dbGet('SELECT * FROM schedules WHERE user_id = ? AND date = ?', [userId, date]);
  if (existing) {
    dbRun('UPDATE schedules SET shift_type = ? WHERE id = ?', [shiftType, existing.id]);
  } else {
    dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [userId, date, shiftType]);
  }

  saveDatabase();
  res.json({ message: '排班已更新' });
});

// ---------- SALARY ----------
app.get('/api/salary', (req, res) => {
  const monthStr = req.query.month || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() !== 0 && date.getDay() !== 6) workDays++;
  }

  const users = dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  const overtimeRate = 1.33;

  const rows = users.map(u => {
    const monthRecords = dbAll('SELECT * FROM attendance WHERE user_id = ? AND date LIKE ?', [u.id, monthStr + '%']);
    const lateMins = monthRecords.reduce((s, r) => s + (r.late_minutes || 0), 0);
    const earlyMins = monthRecords.reduce((s, r) => s + (r.early_leave_minutes || 0), 0);
    const absentDays = workDays - monthRecords.length;
    const otRecords = dbAll('SELECT * FROM overtime WHERE user_id = ? AND date LIKE ? AND status = ?', [u.id, monthStr + '%', 'approved']);
    const otHours = otRecords.reduce((s, o) => s + o.hours, 0);

    const dailyRate = u.salary / workDays;
    const hourlyRate = dailyRate / 8;
    const latePenalty = Math.round(Math.floor(lateMins / 30) * (hourlyRate * 0.5));
    const earlyPenalty = Math.round(Math.floor(earlyMins / 30) * (hourlyRate * 0.5));
    const absentDeduct = Math.round(absentDays * dailyRate);
    const otPay = Math.round(otHours * hourlyRate * overtimeRate);
    const totalPay = Math.round(u.salary - latePenalty - earlyPenalty - absentDeduct + otPay) || 0;

    return {
      ...userToJSON(u),
      attendDays: monthRecords.length,
      lateMins,
      earlyMins,
      absentDays,
      otHours,
      latePenalty,
      earlyPenalty,
      absentDeduct,
      otPay,
      totalPay
    };
  });

  res.json({ rows, workDays, overtimeRate });
});

// ---------- REPORTS ----------
app.get('/api/reports', (req, res) => {
  const monthStr = req.query.month || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;

  const departments = dbAll('SELECT * FROM departments');
  const users = dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  const allRecords = dbAll('SELECT * FROM attendance WHERE date LIKE ?', [monthStr + '%']);

  const deptStats = departments.map(d => {
    const deptUsers = users.filter(u => u.department_id === d.id);
    const records = allRecords.filter(a => deptUsers.some(u => u.id === a.user_id));
    return {
      name: d.name,
      total: deptUsers.length,
      records: records.length,
      late: records.filter(r => r.status.includes('late')).length
    };
  });

  const total = allRecords.length || 1;
  const statusDist = {
    normal: allRecords.filter(r => r.status === 'normal').length,
    late: allRecords.filter(r => r.status.includes('late')).length,
    early: allRecords.filter(r => r.status.includes('early')).length,
    total
  };

  const userStats = users.map(u => {
    const rec = allRecords.filter(a => a.user_id === u.id);
    const late = rec.filter(r => r.status.includes('late')).length;
    const dept = departments.find(d => d.id === u.department_id);
    return {
      name: u.name,
      dept: dept ? dept.name : '未知',
      total: rec.length,
      late,
      onTime: rec.length - late
    };
  }).sort((a, b) => b.onTime - a.onTime);

  res.json({ deptStats, statusDist, userStats });
});

// ---------- LEAVE BALANCES ----------
app.get('/api/leave-balances', (req, res) => {
  const userId = req.query.userId || req.user.id;
  const balances = dbAll('SELECT * FROM leave_balances WHERE user_id = ?', [userId]);
  res.json({ balances: balances.map(leaveBalanceToJSON) });
});

// ---------- DASHBOARD ----------
app.get('/api/dashboard', (req, res) => {
  const today = todayStr();
  const todayRecords = dbAll('SELECT * FROM attendance WHERE date = ?', [today]);
  const activeUsersRow = dbGet('SELECT COUNT(*) as count FROM users WHERE status = ?', ['active']);
  const activeUsers = activeUsersRow ? activeUsersRow.count : 0;
  const clockedIn = todayRecords.length;
  const lateCount = todayRecords.filter(a => a.status.includes('late')).length;
  const pendingLeavesRow = dbGet('SELECT COUNT(*) as count FROM leaves WHERE status = ?', ['pending']);
  const pendingLeaves = pendingLeavesRow ? pendingLeavesRow.count : 0;
  const pendingOTRow = dbGet('SELECT COUNT(*) as count FROM overtime WHERE status = ?', ['pending']);
  const pendingOT = pendingOTRow ? pendingOTRow.count : 0;
  const pendingTotal = pendingLeaves + pendingOT;

  const myRecord = todayRecords.find(a => a.user_id === req.user.id);

  const announcements = dbAll('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 2').map(announcementToJSON);
  const users = dbAll('SELECT * FROM users').map(userToJSON);

  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const chartDays = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = fmtDate(date);
    const countRow = dbGet('SELECT COUNT(*) as count FROM attendance WHERE date = ?', [dateStr]);
    chartDays.push({ label: d, count: countRow ? countRow.count : 0 });
  }

  res.json({
    activeUsers,
    clockedIn,
    lateCount,
    pendingTotal,
    pendingLeaves,
    pendingOT,
    myRecord: myRecord ? attendanceToJSON(myRecord) : null,
    announcements,
    users,
    chartDays
  });
});

// ============================================================
// FALLBACK: Serve index.html
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER (async because sql.js needs async init)
// ============================================================
async function startServer() {
  const SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('Loaded existing database.');
  } else {
    db = new SQL.Database();
    console.log('Created new database.');
  }

  createTables();
  seedDatabase();

  // Save on exit
  process.on('SIGINT', () => { saveDatabase(); process.exit(0); });
  process.on('SIGTERM', () => { saveDatabase(); process.exit(0); });

  app.listen(PORT, () => {
    console.log(`DUCK HR System running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
