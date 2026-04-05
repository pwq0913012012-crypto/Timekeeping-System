// ============================================================
// DUCK 企業打卡系統 — Express + libsql (Turso) Backend
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { reseedDemoData } = require('./lib/demo-data');

const app = express();
const PORT = process.env.PORT || 3007;
const JWT_SECRET = process.env.JWT_SECRET || 'duck-hr-system-secret-key-2024';

// 資料庫連線：
//   - 正式 (Vercel): 使用 Turso 雲端，需設定 TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
//   - 本機: 預設用 file:./hr_system_v2.db (本地 SQLite)
const dbUrl = process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, 'hr_system_v2.db');
const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

let db; // libsql client
function getDb() {
  if (!db) {
    db = createClient({
      url: dbUrl,
      authToken: dbAuthToken,
    });
  }
  return db;
}

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

// ============================================================
// libsql (Turso) DB HELPERS
// ============================================================
async function dbAll(sql, params = []) {
  const result = await getDb().execute({ sql, args: params });
  return result.rows.map(r => {
    // libsql 回傳的 row 已經是物件 (具 columnName 屬性)，但我們程式碼到處
    // 用 `row.某欄位`，所以保持 plain object
    const obj = {};
    for (const k of Object.keys(r)) obj[k] = r[k];
    return obj;
  });
}

async function dbGet(sql, params = []) {
  const rows = await dbAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function dbRun(sql, params = []) {
  const result = await getDb().execute({ sql, args: params });
  return {
    lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    changes: result.rowsAffected ?? 0,
  };
}

// 相容呼叫：舊程式碼有 saveDatabase() — libsql 每個 execute 都即時寫入，
// 所以這裡是 no-op，留著避免動太多呼叫點。
function saveDatabase() { /* no-op on libsql */ }

async function getUserShift(userId, dateStr) {
  const s = await dbGet('SELECT shift_type FROM schedules WHERE user_id = ? AND date = ?', [userId, dateStr]);
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
async function createTables() {
  await dbRun(`
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
  await dbRun(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      manager_id INTEGER
    )
  `);
  await dbRun(`
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
  await dbRun(`
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
  await dbRun(`
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
  await dbRun(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      created_at TEXT,
      pinned INTEGER DEFAULT 0
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      shift_type TEXT NOT NULL
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS leave_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      leave_type TEXT NOT NULL,
      total_days INTEGER NOT NULL,
      used_days INTEGER DEFAULT 0,
      year INTEGER NOT NULL
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
}

// ============================================================
// SEED DATA
// ============================================================
async function seedDatabase() {
  const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count > 0) return;

  const now = new Date();
  const year = now.getFullYear();

  // Departments
  await dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [1, '研發部', 2]);
  await dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [2, '業務部', 4]);
  await dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [3, '人資部', 1]);
  await dbRun('INSERT INTO departments (id, name, manager_id) VALUES (?, ?, ?)', [4, '財務部', 7]);

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
    await dbRun('INSERT INTO users (id, employee_id, name, email, password, department_id, role, salary, status, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [u[0], u[1], u[2], u[3], hashed, u[5], u[6], u[7], u[8], u[9]]);
  }

  // Sample attendance
  await generateSampleAttendance(now);

  // Leaves
  await dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [3, '特休', `${year}-03-25`, `${year}-03-26`, '家庭旅遊', 'approved', 2, `${year}-03-20`]);
  await dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [5, '病假', `${year}-03-28`, `${year}-03-28`, '感冒發燒', 'approved', 4, `${year}-03-27`]);
  await dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [8, '事假', `${year}-04-05`, `${year}-04-05`, '個人事務', 'pending', null, `${year}-04-01`]);

  // Overtime
  await dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [3, `${year}-03-20`, 2, '專案趕工', 'approved', 2]);
  await dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [5, `${year}-03-22`, 3, '客戶需求緊急', 'approved', 4]);
  await dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [6, `${year}-04-01`, 1.5, '月報整理', 'pending', null]);

  // Announcements
  await dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    ['四月份員工旅遊通知', '本月 25 日（星期六）將舉辦公司員工旅遊，地點為日月潭。請各部門於 4/10 前回報參加人數。交通統一安排遊覽車，費用由公司全額補助。', 1, `${year}-04-01T09:00:00`, 1]);
  await dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    ['系統維護公告', '本週六晚間 22:00 至隔日 06:00 將進行系統維護，期間打卡系統暫停服務。請同仁提前完成打卡作業。', 1, `${year}-03-28T14:30:00`, 0]);
  await dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    ['新進員工歡迎會', '歡迎三月份加入的新同仁！本週五下午 3 點將於 B1 會議室舉辦歡迎茶會，邀請各位同仁踴躍參加。', 6, `${year}-03-26T10:00:00`, 0]);

  // Schedules
  await generateDefaultSchedules(now);

  // Leave balances
  await generateLeaveBalances(year);

  saveDatabase();
  console.log('Database seeded successfully.');
}

async function generateSampleAttendance(now) {
  // 展示資料：除了系統管理員 (uid=1)，其他所有員工每個工作日都正常打卡
  // 每個班別的打卡時間都固定（準時上下班，無遲到無早退無缺勤），
  // 用意是給展示用，狀態看起來整齊漂亮。
  const year = now.getFullYear(), month = now.getMonth();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = fmtDate(now);

  // 每個 shift 的打卡時間（固定值，不隨機，讓畫面整齊）
  const SHIFT_PUNCH = {
    morning:   { clockIn: '08:55', clockOut: '18:05', endH: 18 },
    afternoon: { clockIn: '13:55', clockOut: '22:05', endH: 22 },
    night:     { clockIn: '21:55', clockOut: '06:05', endH: 6 }, // 跨夜
  };

  const records = [];

  // 過去 30 天 + 今天，每一天都寫入 (含週末, 讓展示畫面隨時都有資料)
  for (let d = 29; d >= 0; d--) {
    const date = new Date(year, month, now.getDate() - d);
    const dateStr = fmtDate(date);
    const isToday = dateStr === today;

    for (let uid = 2; uid <= 12; uid++) {
      const shift = UID_SHIFT_MAP[uid] || 'morning';
      const cfg = SHIFT_PUNCH[shift];
      let { clockIn, clockOut } = cfg;

      // 今天的資料：根據現在時間判斷是否已下班
      if (isToday) {
        const [ciH, ciM] = clockIn.split(':').map(Number);
        const clockInMin = ciH * 60 + ciM;
        // 還沒到上班時間 → 不產生記錄（讓 UI 顯示「待上班」）
        if (nowMin < clockInMin) continue;

        // 判斷是否該有 clockOut
        const crossesMidnight = shift === 'night';
        if (crossesMidnight) {
          // 夜班 21:55 - 06:05；如果現在還在班內 (21:55 之後 或 06:05 之前) → 未下班
          const inShift = (nowMin >= clockInMin) || (nowMin < cfg.endH * 60 + 5);
          if (inShift && nowMin >= clockInMin) clockOut = null;
        } else {
          // 日/中班：現在時間 < 下班時間 → 還沒下班
          if (nowMin < cfg.endH * 60 + 5) clockOut = null;
        }
      }

      records.push({
        uid, dateStr, clockIn, clockOut,
        status: 'normal', lateMins: 0, earlyMins: 0, shift
      });
    }
  }

  for (const r of records) {
    await dbRun('INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [r.uid, r.dateStr, r.clockIn, r.clockOut || null, r.status, r.lateMins, r.earlyMins, r.shift]);
  }
}

async function generateDefaultSchedules(now) {
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  for (let w = 0; w < 14; w++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + w);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = fmtDate(d);
    await dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [9, dateStr, 'afternoon']);
    await dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [10, dateStr, 'afternoon']);
    await dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [11, dateStr, 'night']);
    await dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [12, dateStr, 'night']);
  }
}

async function generateLeaveBalances(year) {
  const types = ['特休','病假','事假','婚假','喪假'];
  const days = [7, 30, 14, 8, 8];
  let seed = year * 31;
  function srand() { seed = (seed * 16807 + 7) % 2147483647; return (seed & 0x7fffffff) / 2147483647; }

  for (let uid = 1; uid <= 12; uid++) {
    for (let i = 0; i < types.length; i++) {
      const used = Math.floor(srand() * Math.min(3, days[i]));
      await dbRun('INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, year) VALUES (?, ?, ?, ?, ?)',
        [uid, types[i], days[i], used, year]);
    }
  }
}

// ============================================================
// WEEKLY CYCLE ATTENDANCE (ensureTodayAttendance)
// ============================================================
// 記憶體快取：同一個實例 2 分鐘內不重複補資料，降低每次登入的延遲
let __ensureCache = { date: null, at: 0 };

async function ensureTodayAttendance(excludeUserId) {
  const today = todayStr();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 快取：同實例 2 分鐘內已處理過 → skip
  if (__ensureCache.date === today && (Date.now() - __ensureCache.at) < 120000) return;

  const SHIFT_PUNCH = {
    morning:   { clockIn: '08:55', clockOut: '18:05', endH: 18 },
    afternoon: { clockIn: '13:55', clockOut: '22:05', endH: 22 },
    night:     { clockIn: '21:55', clockOut: '06:05', endH: 6 },
  };

  // 一次查出今天所有已存在 attendance 的 user_id，避免 N+1
  const existingRows = await dbAll('SELECT user_id FROM attendance WHERE date = ?', [today]);
  const existsSet = new Set(existingRows.map(r => r.user_id));

  // 除了 admin 以外的啟用員工
  const activeUsers = await dbAll("SELECT * FROM users WHERE status = 'active' AND role != 'admin'");

  for (const u of activeUsers) {
    if (u.id === excludeUserId) continue;
    if (existsSet.has(u.id)) continue;

    const shift = UID_SHIFT_MAP[u.id] || 'morning';
    const cfg = SHIFT_PUNCH[shift];
    const [ciH, ciM] = cfg.clockIn.split(':').map(Number);
    const clockInMin = ciH * 60 + ciM;

    // 還沒到上班時間 → 不補 (讓 UI 顯示「待上班」)
    if (nowMin < clockInMin) continue;

    // 判斷是否已下班
    let clockOut = null;
    if (shift !== 'night') {
      if (nowMin >= cfg.endH * 60 + 5) clockOut = cfg.clockOut;
    }
    // 夜班 record 的 clockOut 屬於隔日，這個函式只寫 today，所以保持 null

    await dbRun(
      'INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [u.id, today, cfg.clockIn, clockOut, 'normal', 0, 0, shift]
    );
    existsSet.add(u.id);
  }

  __ensureCache = { date: today, at: Date.now() };
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

app.use('/api', async (req, res, next) => {
  if (req.path === '/auth/login') return next();
  authMiddleware(req, res, next);
});

// ============================================================
// API ROUTES
// ============================================================

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '請提供帳號與密碼' });
  }

  let user;
  if (username === 'admin') {
    user = await dbGet('SELECT * FROM users WHERE role = ? AND status = ?', ['admin', 'active']);
  } else {
    user = await dbGet('SELECT * FROM users WHERE (employee_id = ? OR email = ?) AND status = ?', [username, username, 'active']);
  }

  if (!user) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  await ensureTodayAttendance(user.id);

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    token,
    user: userToJSON(user)
  });
});

// ---------- ATTENDANCE ----------
app.get('/api/attendance', async (req, res) => {
  const dateStr = req.query.date || todayStr();
  let records = await dbAll('SELECT * FROM attendance WHERE date = ?', [dateStr]);

  const activeUsers = await dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  // 一次抓當天所有排班, 避免 N+1 (每個員工查一次)
  const scheduleRows = await dbAll('SELECT user_id, shift_type FROM schedules WHERE date = ?', [dateStr]);
  const schedMap = {};
  for (const s of scheduleRows) schedMap[s.user_id] = s.shift_type;

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
        shift: schedMap[u.id] || UID_SHIFT_MAP[u.id] || 'morning'
      });
    }
  }

  result.sort((a, b) => a.userId - b.userId);

  res.json({
    records: result,
    users: activeUsers.map(userToJSON),
    departments: (await dbAll('SELECT * FROM departments')).map(departmentToJSON)
  });
});

app.post('/api/attendance/clockin', async (req, res) => {
  const userId = req.user.id;
  const today = todayStr();

  const existing = await dbGet('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);
  if (existing) {
    return res.status(400).json({ error: '今日已打卡上班' });
  }

  const now = new Date();
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const shift = await getUserShift(userId, today);
  const cfg = SHIFT_TIMES[shift];
  const workStartMin = cfg.startH * 60 + 10;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isLate = nowMin > workStartMin;
  const lateMins = isLate ? nowMin - cfg.startH * 60 : 0;

  await dbRun('INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, today, timeStr, null, isLate ? 'late' : 'normal', lateMins, 0, shift]);
  saveDatabase();

  const record = await dbGet('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);

  res.json({
    record: attendanceToJSON(record),
    message: isLate ? `上班打卡成功（遲到 ${lateMins} 分鐘）` : `上班打卡成功！(${cfg.label})`,
    isLate
  });
});

app.post('/api/attendance/clockout', async (req, res) => {
  const userId = req.user.id;
  const today = todayStr();

  const record = await dbGet('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [userId, today]);
  if (!record) {
    return res.status(400).json({ error: '尚未打卡上班' });
  }
  if (record.clock_out) {
    return res.status(400).json({ error: '今日已打卡下班' });
  }

  const now = new Date();
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const shift = record.shift || await getUserShift(userId, today);
  const cfg = SHIFT_TIMES[shift];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endMin = cfg.endH * 60;
  const isEarly = nowMin < endMin;
  const earlyMins = isEarly ? endMin - nowMin : 0;

  let newStatus = record.status;
  if (isEarly) {
    newStatus = record.status === 'late' ? 'late+early' : 'early';
  }

  await dbRun('UPDATE attendance SET clock_out = ?, early_leave_minutes = ?, status = ? WHERE id = ?',
    [timeStr, earlyMins, newStatus, record.id]);
  saveDatabase();

  const updated = await dbGet('SELECT * FROM attendance WHERE id = ?', [record.id]);

  res.json({
    record: attendanceToJSON(updated),
    message: isEarly ? `下班打卡成功（早退 ${earlyMins} 分鐘）` : '下班打卡成功！祝您有美好的一天！',
    isEarly
  });
});

// ---------- LEAVES ----------
app.get('/api/leaves', async (req, res) => {
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const isManagerOrAdmin = user.role === 'admin' || user.role === 'manager';
  let leaves;
  if (isManagerOrAdmin) {
    leaves = await dbAll('SELECT * FROM leaves ORDER BY id DESC');
  } else {
    leaves = await dbAll('SELECT * FROM leaves WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  }
  const users = (await dbAll('SELECT * FROM users')).map(userToJSON);
  res.json({ leaves: leaves.map(leaveToJSON), users, isManager: isManagerOrAdmin });
});

app.post('/api/leaves', async (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  if (!type || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: '請填寫完整資訊' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: '結束日期不可早於開始日期' });
  }

  await dbRun('INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, type, startDate, endDate, reason, 'pending', null, todayStr()]);
  saveDatabase();

  res.json({ message: '請假申請已送出' });
});

app.put('/api/leaves/:id', async (req, res) => {
  const { status } = req.body;
  const leaveId = parseInt(req.params.id);
  const leave = await dbGet('SELECT * FROM leaves WHERE id = ?', [leaveId]);
  if (!leave) return res.status(404).json({ error: '找不到此請假記錄' });

  await dbRun('UPDATE leaves SET status = ?, approved_by = ? WHERE id = ?', [status, req.user.id, leaveId]);

  if (status === 'approved') {
    const days = Math.ceil((new Date(leave.end_date) - new Date(leave.start_date)) / 86400000) + 1;
    const bal = await dbGet('SELECT * FROM leave_balances WHERE user_id = ? AND leave_type = ?', [leave.user_id, leave.type]);
    if (bal) {
      await dbRun('UPDATE leave_balances SET used_days = used_days + ? WHERE id = ?', [days, bal.id]);
    }
  }

  saveDatabase();
  res.json({ message: status === 'approved' ? '已核准請假' : '已拒絕請假' });
});

// ---------- OVERTIME ----------
app.get('/api/overtime', async (req, res) => {
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const isManagerOrAdmin = user.role === 'admin' || user.role === 'manager';
  let ots;
  if (isManagerOrAdmin) {
    ots = await dbAll('SELECT * FROM overtime ORDER BY id DESC');
  } else {
    ots = await dbAll('SELECT * FROM overtime WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  }
  const users = (await dbAll('SELECT * FROM users')).map(userToJSON);
  res.json({ overtime: ots.map(overtimeToJSON), users, isManager: isManagerOrAdmin });
});

app.post('/api/overtime', async (req, res) => {
  const { date, hours, reason } = req.body;
  if (!date || !hours || !reason) {
    return res.status(400).json({ error: '請填寫完整資訊' });
  }

  await dbRun('INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, date, hours, reason, 'pending', null]);
  saveDatabase();

  res.json({ message: '加班申請已送出' });
});

app.put('/api/overtime/:id', async (req, res) => {
  const { status } = req.body;
  const otId = parseInt(req.params.id);

  await dbRun('UPDATE overtime SET status = ?, approved_by = ? WHERE id = ?', [status, req.user.id, otId]);
  saveDatabase();

  res.json({ message: status === 'approved' ? '已核准加班' : '已拒絕加班' });
});

// ---------- EMPLOYEES ----------
app.get('/api/employees', async (req, res) => {
  const users = await dbAll('SELECT * FROM users ORDER BY id ASC');
  const departments = await dbAll('SELECT * FROM departments');
  const maxId = await dbGet('SELECT MAX(id) as maxId FROM users');
  const nextId = (maxId && maxId.maxId ? maxId.maxId : 0) + 1;
  res.json({
    users: users.map(userToJSON),
    departments: departments.map(departmentToJSON),
    nextId
  });
});

app.post('/api/employees', async (req, res) => {
  const { employeeId, name, email, password, departmentId, role, salary, hireDate } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: '請填寫完整資訊' });
  }

  const hashed = bcrypt.hashSync(password || '123456', 10);
  const result = await dbRun('INSERT INTO users (employee_id, name, email, password, department_id, role, salary, status, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [employeeId, name, email, hashed, departmentId, role || 'employee', salary || 40000, 'active', hireDate || todayStr()]);

  const year = new Date().getFullYear();
  const types = ['特休','病假','事假','婚','喪假'];
  const days = [7, 30, 14, 8, 8];
  for (let i = 0; i < types.length; i++) {
    await dbRun('INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, year) VALUES (?, ?, ?, ?, ?)',
      [result.lastInsertRowid, types[i], days[i], 0, year]);
  }

  saveDatabase();
  res.json({ message: '員工已新增', id: result.lastInsertRowid });
});

app.put('/api/employees/:id', async (req, res) => {
  const userId = parseInt(req.params.id);
  const { employeeId, name, email, password, departmentId, role, salary, hireDate, status } = req.body;

  if (status !== undefined) {
    await dbRun('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    saveDatabase();
    const u = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
    return res.json({ message: `已${status === 'active' ? '啟用' : '停用'} ${u.name}`, user: userToJSON(u) });
  }

  if (password) {
    const hashed = bcrypt.hashSync(password, 10);
    if (employeeId) {
      await dbRun('UPDATE users SET employee_id = ?, name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ?, password = ? WHERE id = ?',
        [employeeId, name, email, departmentId, role, salary, hireDate, hashed, userId]);
    } else {
      await dbRun('UPDATE users SET name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ?, password = ? WHERE id = ?',
        [name, email, departmentId, role, salary, hireDate, hashed, userId]);
    }
  } else {
    if (employeeId) {
      await dbRun('UPDATE users SET employee_id = ?, name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ? WHERE id = ?',
        [employeeId, name, email, departmentId, role, salary, hireDate, userId]);
    } else {
      await dbRun('UPDATE users SET name = ?, email = ?, department_id = ?, role = ?, salary = ?, hire_date = ? WHERE id = ?',
        [name, email, departmentId, role, salary, hireDate, userId]);
    }
  }

  saveDatabase();
  res.json({ message: '員工資料已更新' });
});

// ---------- DEPARTMENTS ----------
app.get('/api/departments', async (req, res) => {
  const departments = await dbAll('SELECT * FROM departments');
  const users = await dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  res.json({
    departments: departments.map(d => {
      const dept = departmentToJSON(d);
      dept.memberCount = users.filter(u => u.department_id === d.id).length;
      return dept;
    }),
    users: users.map(userToJSON)
  });
});

app.post('/api/departments', async (req, res) => {
  const { name, managerId } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入部門名稱' });

  await dbRun('INSERT INTO departments (name, manager_id) VALUES (?, ?)', [name, managerId || null]);
  saveDatabase();
  res.json({ message: '部門已新增' });
});

app.put('/api/departments/:id', async (req, res) => {
  const { name, managerId } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入部門名稱' });

  await dbRun('UPDATE departments SET name = ?, manager_id = ? WHERE id = ?', [name, managerId || null, parseInt(req.params.id)]);
  saveDatabase();
  res.json({ message: '部門已更新' });
});

// ---------- ANNOUNCEMENTS ----------
app.get('/api/announcements', async (req, res) => {
  const anns = await dbAll('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC');
  const users = (await dbAll('SELECT * FROM users')).map(userToJSON);
  res.json({ announcements: anns.map(announcementToJSON), users });
});

app.post('/api/announcements', async (req, res) => {
  const { title, content, pinned } = req.body;
  if (!title || !content) return res.status(400).json({ error: '請填寫完整資訊' });

  await dbRun('INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
    [title, content, req.user.id, new Date().toISOString(), pinned ? 1 : 0]);
  saveDatabase();
  res.json({ message: '公告已發布' });
});

app.delete('/api/announcements/:id', async (req, res) => {
  await dbRun('DELETE FROM announcements WHERE id = ?', [parseInt(req.params.id)]);
  saveDatabase();
  res.json({ message: '公告已刪除' });
});

// ---------- SCHEDULES ----------
app.get('/api/schedules', async (req, res) => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const schedules = await dbAll('SELECT * FROM schedules WHERE date >= ? AND date <= ?', [fmtDate(weekStart), fmtDate(weekEnd)]);
  const users = await dbAll('SELECT * FROM users WHERE status = ?', ['active']);

  res.json({
    schedules: schedules.map(scheduleToJSON),
    users: users.map(userToJSON),
    weekStart: fmtDate(weekStart),
    weekEnd: fmtDate(weekEnd)
  });
});

app.post('/api/schedules', async (req, res) => {
  const { userId, date, shiftType } = req.body;
  if (!userId || !date || !shiftType) return res.status(400).json({ error: '請填寫完整資訊' });

  const existing = await dbGet('SELECT * FROM schedules WHERE user_id = ? AND date = ?', [userId, date]);
  if (existing) {
    await dbRun('UPDATE schedules SET shift_type = ? WHERE id = ?', [shiftType, existing.id]);
  } else {
    await dbRun('INSERT INTO schedules (user_id, date, shift_type) VALUES (?, ?, ?)', [userId, date, shiftType]);
  }

  saveDatabase();
  res.json({ message: '排班已更新' });
});

// ---------- SALARY ----------
app.get('/api/salary', async (req, res) => {
  const monthStr = req.query.month || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() !== 0 && date.getDay() !== 6) workDays++;
  }

  const users = await dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  const overtimeRate = 1.33;

  const rows = [];
  for (const u of users) {
    const monthRecords = await dbAll('SELECT * FROM attendance WHERE user_id = ? AND date LIKE ?', [u.id, monthStr + '%']);
    const lateMins = monthRecords.reduce((s, r) => s + (r.late_minutes || 0), 0);
    const earlyMins = monthRecords.reduce((s, r) => s + (r.early_leave_minutes || 0), 0);
    const absentDays = workDays - monthRecords.length;
    const otRecords = await dbAll('SELECT * FROM overtime WHERE user_id = ? AND date LIKE ? AND status = ?', [u.id, monthStr + '%', 'approved']);
    const otHours = otRecords.reduce((s, o) => s + o.hours, 0);

    const dailyRate = u.salary / workDays;
    const hourlyRate = dailyRate / 8;
    const latePenalty = Math.round(Math.floor(lateMins / 30) * (hourlyRate * 0.5));
    const earlyPenalty = Math.round(Math.floor(earlyMins / 30) * (hourlyRate * 0.5));
    const absentDeduct = Math.round(absentDays * dailyRate);
    const otPay = Math.round(otHours * hourlyRate * overtimeRate);
    const totalPay = Math.round(u.salary - latePenalty - earlyPenalty - absentDeduct + otPay) || 0;

    rows.push({
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
    });
  }

  res.json({ rows, workDays, overtimeRate });
});

// ---------- REPORTS ----------
app.get('/api/reports', async (req, res) => {
  const monthStr = req.query.month || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;

  const departments = await dbAll('SELECT * FROM departments');
  const users = await dbAll('SELECT * FROM users WHERE status = ?', ['active']);
  const allRecords = await dbAll('SELECT * FROM attendance WHERE date LIKE ?', [monthStr + '%']);

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
app.get('/api/leave-balances', async (req, res) => {
  const userId = req.query.userId || req.user.id;
  const balances = await dbAll('SELECT * FROM leave_balances WHERE user_id = ?', [userId]);
  res.json({ balances: balances.map(leaveBalanceToJSON) });
});

// ---------- DASHBOARD ----------
app.get('/api/dashboard', async (req, res) => {
  const today = todayStr();
  const todayRecords = await dbAll('SELECT * FROM attendance WHERE date = ?', [today]);
  const activeUsersRow = await dbGet('SELECT COUNT(*) as count FROM users WHERE status = ?', ['active']);
  const activeUsers = activeUsersRow ? activeUsersRow.count : 0;
  const clockedIn = todayRecords.length;
  const lateCount = todayRecords.filter(a => a.status.includes('late')).length;
  // 計算待審核：排除自己送出的 (避免自己申請後 sidebar 出現紅點提醒自己審自己)
  const pendingLeavesRow = await dbGet('SELECT COUNT(*) as count FROM leaves WHERE status = ? AND user_id != ?', ['pending', req.user.id]);
  const pendingLeaves = pendingLeavesRow ? pendingLeavesRow.count : 0;
  const pendingOTRow = await dbGet('SELECT COUNT(*) as count FROM overtime WHERE status = ? AND user_id != ?', ['pending', req.user.id]);
  const pendingOT = pendingOTRow ? pendingOTRow.count : 0;
  const pendingTotal = pendingLeaves + pendingOT;

  const myRecord = todayRecords.find(a => a.user_id === req.user.id);

  const announcements = (await dbAll('SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC')).map(announcementToJSON);
  const users = (await dbAll('SELECT * FROM users')).map(userToJSON);

  // 圖表：一次查出本月出勤統計 (避免 N+1 往返雲端 DB)
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const monthPrefix = `${year}-${pad2(month + 1)}`;
  const monthRows = await dbAll(
    'SELECT date, COUNT(*) as count FROM attendance WHERE date LIKE ? GROUP BY date',
    [monthPrefix + '%']
  );
  const countByDate = {};
  for (const r of monthRows) countByDate[r.date] = r.count;
  const chartDays = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = fmtDate(date);
    chartDays.push({ label: d, count: countByDate[dateStr] || 0 });
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

// ---------- DEMO RESET (admin only) ----------
// 點一下就把 DB 洗回初始展示狀態, 用在給人看的 demo 情境
app.post('/api/admin/reset-demo', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '僅系統管理員可使用' });
  }
  try {
    await reseedDemoData({ dbRun: async (sql, args) => await dbRun(sql, args) });
    // 清掉 ensureTodayAttendance 的記憶體 cache, 讓下次登入不會被跳過
    __ensureCache = { date: null, at: 0 };
    res.json({ message: '展示資料已重置' });
  } catch (e) {
    console.error('reset-demo failed:', e);
    res.status(500).json({ error: '重置失敗: ' + e.message });
  }
});

// ============================================================
// FALLBACK: Serve index.html
// ============================================================
app.get('*', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// DEMO RESET — 純展示模式用
// ============================================================
// 在 Vercel serverless 模式下，每次冷啟動載入 DB 後呼叫一次。
// 目的：不管磁碟上的 hr_system.db 累積了多少髒資料，每個新函式
// 實例都從乾淨狀態開始，避免「剛登入就看到以前的打卡 / 請假 / 加班」。
async function resetDemoState() {
  try {
    // 1. 清空系統管理員 (id=1) 的所有出勤紀錄
    await dbRun('DELETE FROM attendance WHERE user_id = 1');

    // 2. 清空所有請假申請 (讓展示畫面維持「全新未使用」的狀態)
    await dbRun('DELETE FROM leaves');

    // 3. 清空所有加班申請
    await dbRun('DELETE FROM overtime');

    console.log('Demo state reset: admin attendance / leaves / overtime cleared.');
  } catch (err) {
    console.error('resetDemoState failed:', err);
  }
}

// ============================================================
// DATABASE INITIALIZATION (shared by local & serverless)
// ============================================================
async function initializeDatabase() {
  // libsql client 是 lazy-init，只要 getDb() 被呼叫就建好連線
  getDb();
  console.log('Connected to libsql:', dbUrl.startsWith('libsql://') ? 'Turso (cloud)' : dbUrl);

  await createTables();
  await seedDatabase();
  // 有真實雲端 DB (Turso) 後, 資料會持久化, 不再需要冷啟動清洗。
}

// ============================================================
// SERVERLESS (Vercel) vs LOCAL
// ============================================================
if (process.env.VERCEL) {
  // Vercel: 在模組載入時就初始化一次 (冷啟動), 暖函式會重用
  let readyPromise = initializeDatabase();

  // 在每個請求前確保 DB 已就緒
  const wrappedApp = require('express')();
  wrappedApp.use(async (req, res, next) => {
    try {
      await readyPromise;
      next();
    } catch (err) {
      console.error('DB init failed:', err);
      res.status(500).json({ error: 'Database init failed' });
    }
  });
  wrappedApp.use(app);

  module.exports = wrappedApp;
} else {
  // 本機: 正常啟動伺服器
  initializeDatabase().then(() => {
    process.on('SIGINT', () => { saveDatabase(); process.exit(0); });
    process.on('SIGTERM', () => { saveDatabase(); process.exit(0); });
    app.listen(PORT, () => {
      console.log(`DUCK HR System running at http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
