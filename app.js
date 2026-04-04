// ============================================================
// DATA LAYER — localStorage
// ============================================================
const DB_KEY = 'hr_system_db';
const DB_VERSION = 9; // weekly pattern attendance

var storageAvailable = false;
try { localStorage.setItem('_test','1'); localStorage.removeItem('_test'); storageAvailable = true; } catch(e) {}

function loadDB() {
  if (storageAvailable) {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.users && parsed.attendance && parsed.version === DB_VERSION) return parsed;
      }
    } catch(e) { console.warn('DB load error:', e); }
  }
  return initDB();
}

function saveDB(data) {
  if (storageAvailable) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch(e) { console.warn('DB save error:', e); }
  }
}

function initDB() {
  const now = new Date();
  const year = now.getFullYear();
  const db = {
    users: [
      { id:1, employeeId:'A001', name:'系統管理員', email:'admin@company.com', password:'admin123', departmentId:3, role:'admin', salary:80000, status:'active', hireDate:'2020-01-01' },
      { id:2, employeeId:'A002', name:'王大明', email:'wang@company.com', password:'123456', departmentId:1, role:'manager', salary:65000, status:'active', hireDate:'2021-03-15' },
      { id:3, employeeId:'A003', name:'李小華', email:'li@company.com', password:'123456', departmentId:1, role:'employee', salary:48000, status:'active', hireDate:'2022-06-01' },
      { id:4, employeeId:'A004', name:'張美玲', email:'zhang@company.com', password:'123456', departmentId:2, role:'manager', salary:62000, status:'active', hireDate:'2021-07-20' },
      { id:5, employeeId:'A005', name:'陳志豪', email:'chen@company.com', password:'123456', departmentId:2, role:'employee', salary:45000, status:'active', hireDate:'2023-01-10' },
      { id:6, employeeId:'A006', name:'林雅婷', email:'lin@company.com', password:'123456', departmentId:3, role:'employee', salary:50000, status:'active', hireDate:'2022-09-01' },
      { id:7, employeeId:'A007', name:'黃建國', email:'huang@company.com', password:'123456', departmentId:4, role:'manager', salary:60000, status:'active', hireDate:'2020-11-15' },
      { id:8, employeeId:'A008', name:'吳佳蓉', email:'wu@company.com', password:'123456', departmentId:4, role:'employee', salary:46000, status:'active', hireDate:'2023-04-01' },
      { id:9, employeeId:'A009', name:'許志偉', email:'hsu@company.com', password:'123456', departmentId:1, role:'employee', salary:47000, status:'active', hireDate:'2024-02-15' },
      { id:10, employeeId:'A010', name:'鄭雅琪', email:'cheng@company.com', password:'123456', departmentId:2, role:'employee', salary:46000, status:'active', hireDate:'2024-05-01' },
      { id:11, employeeId:'A011', name:'蔡明翰', email:'tsai@company.com', password:'123456', departmentId:1, role:'employee', salary:48000, status:'active', hireDate:'2024-01-10' },
      { id:12, employeeId:'A012', name:'周佩君', email:'chou@company.com', password:'123456', departmentId:4, role:'employee', salary:45000, status:'active', hireDate:'2024-06-20' },
    ],
    departments: [
      { id:1, name:'研發部', managerId:2 },
      { id:2, name:'業務部', managerId:4 },
      { id:3, name:'人資部', managerId:1 },
      { id:4, name:'財務部', managerId:7 },
    ],
    attendance: generateSampleAttendance(),
    leaves: [
      { id:1, userId:3, type:'特休', startDate:`${year}-03-25`, endDate:`${year}-03-26`, reason:'家庭旅遊', status:'approved', approvedBy:2, createdAt:`${year}-03-20` },
      { id:2, userId:5, type:'病假', startDate:`${year}-03-28`, endDate:`${year}-03-28`, reason:'感冒發燒', status:'approved', approvedBy:4, createdAt:`${year}-03-27` },
      { id:3, userId:8, type:'事假', startDate:`${year}-04-05`, endDate:`${year}-04-05`, reason:'個人事務', status:'pending', approvedBy:null, createdAt:`${year}-04-01` },
    ],
    overtime: [
      { id:1, userId:3, date:`${year}-03-20`, hours:2, reason:'專案趕工', status:'approved', approvedBy:2 },
      { id:2, userId:5, date:`${year}-03-22`, hours:3, reason:'客戶需求緊急', status:'approved', approvedBy:4 },
      { id:3, userId:6, date:`${year}-04-01`, hours:1.5, reason:'月報整理', status:'pending', approvedBy:null },
    ],
    announcements: [
      { id:1, title:'四月份員工旅遊通知', content:'本月 25 日（星期六）將舉辦公司員工旅遊，地點為日月潭。請各部門於 4/10 前回報參加人數。交通統一安排遊覽車，費用由公司全額補助。', authorId:1, createdAt:`${year}-04-01T09:00:00`, pinned:true },
      { id:2, title:'系統維護公告', content:'本週六晚間 22:00 至隔日 06:00 將進行系統維護，期間打卡系統暫停服務。請同仁提前完成打卡作業。', authorId:1, createdAt:`${year}-03-28T14:30:00`, pinned:false },
      { id:3, title:'新進員工歡迎會', content:'歡迎三月份加入的新同仁！本週五下午 3 點將於 B1 會議室舉辦歡迎茶會，邀請各位同仁踴躍參加。', authorId:6, createdAt:`${year}-03-26T10:00:00`, pinned:false },
    ],
    schedules: generateDefaultSchedules(now),
    leaveBalances: generateLeaveBalances(year),
    settings: { workStart:'09:00', workEnd:'18:00', lateGrace:10, overtimeRate:1.33 },
    nextId: { users:13, attendance:200, leaves:4, overtime:4, announcements:4, schedules:100 },
    version: DB_VERSION
  };
  saveDB(db);
  return db;
}

function generateSampleAttendance() {
  const records = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let id = 1;
  // Seed a simple deterministic random so data is consistent
  let seed = year * 10000 + month * 100 + now.getDate();
  function srand() { seed = (seed * 16807 + 7) % 2147483647; return (seed & 0x7fffffff) / 2147483647; }

  // shift config for attendance generation
  const shiftCfg = {
    morning:   { startH:9, startM:0, endH:18, earlyBase:8, earlyRange:15 },
    afternoon: { startH:14, startM:0, endH:22, earlyBase:13, earlyRange:15 },
    night:     { startH:22, startM:0, endH:6, earlyBase:21, earlyRange:15 }
  };
  // uid -> default shift
  const uidShift = { 9:'afternoon', 10:'afternoon', 11:'night', 12:'night' };

  for (let d = 29; d >= 0; d--) {
    const date = new Date(year, month, now.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = fmtDate(date);
    for (let uid = 2; uid <= 12; uid++) {
      let clockIn, clockOut, status = 'normal', lateMins = 0, earlyMins = 0;
      const r1 = srand(), r2 = srand();
      const shift = uidShift[uid] || 'morning';
      const cfg = shiftCfg[shift];

      // 5% absent (not today)
      if (r1 < 0.05 && d > 0) continue;

      // Today: skip if current time is before shift start
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const shiftStartMin = cfg.startH * 60 + cfg.startM;
      if (d === 0 && nowMin < shiftStartMin - 15) continue;

      // 20% chance late
      if (r1 < 0.20) {
        const lateBy = Math.floor(srand() * 25) + 5;
        const totalMin = cfg.startH * 60 + cfg.startM + lateBy;
        clockIn = `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
        lateMins = lateBy;
        status = 'late';
      } else {
        const m = cfg.earlyBase * 60 + Math.floor(srand() * cfg.earlyRange) + 45;
        clockIn = `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      }

      // Today: if clockIn time is in the future, skip
      if (d === 0) {
        const [ciH, ciM] = clockIn.split(':').map(Number);
        if (ciH * 60 + ciM > nowMin) continue;
      }

      // Clock out
      if (d === 0) {
        // Today: if past shift end, 80% already clocked out normally, 20% overtime
        const shiftStartMin = cfg.startH * 60 + (cfg.startM || 0);
        const shiftEndMin = cfg.endH * 60 + (cfg.endM || 0);
        // Handle overnight shifts (e.g. 22:00-06:00): shift ended if nowMin > endMin AND nowMin < startMin
        const crossesMidnight = shiftEndMin < shiftStartMin;
        const shiftEnded = crossesMidnight
          ? (nowMin > shiftEndMin && nowMin < shiftStartMin)
          : (nowMin > shiftEndMin);
        if (shiftEnded) {
          if (srand() < 0.8) {
            const extra = Math.floor(srand() * 15);
            clockOut = `${String(cfg.endH).padStart(2,'0')}:${String(extra).padStart(2,'0')}`;
          } else {
            clockOut = null; // still working overtime
          }
        } else {
          clockOut = null; // shift not over yet
        }
      } else {
        // For yesterday's overnight shift: if now is before shift end, they're still working
        const isCrossMidnight = cfg.endH < cfg.startH;
        if (d === 1 && isCrossMidnight && nowMin < cfg.endH * 60 + (cfg.endM || 0)) {
          clockOut = null; // still working from yesterday's night shift
        } else if (r2 < 0.15) {
          const earlyBy = Math.floor(srand() * 25) + 5;
          const totalMin = cfg.endH * 60 - earlyBy;
          clockOut = `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
          earlyMins = earlyBy;
          status = status === 'late' ? 'late+early' : 'early';
        } else {
          const extra = Math.floor(srand() * 25);
          clockOut = `${String(cfg.endH).padStart(2,'0')}:${String(extra).padStart(2,'0')}`;
        }
      }
      records.push({ id: id++, userId: uid, date: dateStr, clockIn, clockOut, status, lateMinutes: lateMins, earlyLeaveMinutes: earlyMins, shift });
    }
  }
  // Guaranteed early leave records (yesterday)
  const yesterday = new Date(year, month, now.getDate() - 1);
  if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6) {
    const yd = fmtDate(yesterday);
    const replace = [5, 7, 10, 12];
    replace.forEach(uid => {
      const idx = records.findIndex(r => r.userId === uid && r.date === yd);
      if (idx >= 0) records.splice(idx, 1);
    });
    records.push({ id: id++, userId: 5, date: yd, clockIn: '08:52', clockOut: '17:35', status: 'early', lateMinutes: 0, earlyLeaveMinutes: 25, shift:'morning' });
    records.push({ id: id++, userId: 7, date: yd, clockIn: '08:48', clockOut: '17:42', status: 'early', lateMinutes: 0, earlyLeaveMinutes: 18, shift:'morning' });
    records.push({ id: id++, userId: 10, date: yd, clockIn: '13:55', clockOut: '21:38', status: 'early', lateMinutes: 0, earlyLeaveMinutes: 22, shift:'afternoon' });
    records.push({ id: id++, userId: 12, date: yd, clockIn: '21:50', clockOut: '05:40', status: 'early', lateMinutes: 0, earlyLeaveMinutes: 20, shift:'night' });
  }
  return records;
}

function generateLeaveBalances(year) {
  const types = ['特休','病假','事假','婚假','喪假'];
  const days = [7, 30, 14, 8, 8];
  const balances = [];
  let id = 1;
  for (let uid = 1; uid <= 12; uid++) {
    types.forEach((t, i) => {
      balances.push({ id: id++, userId: uid, leaveType: t, totalDays: days[i], usedDays: Math.floor(Math.random() * Math.min(3, days[i])), year });
    });
  }
  return balances;
}

function generateDefaultSchedules(now) {
  const schedules = [];
  let id = 1;
  const year = now.getFullYear(), month = now.getMonth();
  // Generate schedules for current week + next week
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  for (let w = 0; w < 14; w++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + w);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = fmtDate(d);
    // 許志偉、鄭雅琪 → 中班
    schedules.push({ id: id++, userId: 9, date: dateStr, shiftType: 'afternoon' });
    schedules.push({ id: id++, userId: 10, date: dateStr, shiftType: 'afternoon' });
    // 蔡明翰、周佩君 → 晚班
    schedules.push({ id: id++, userId: 11, date: dateStr, shiftType: 'night' });
    schedules.push({ id: id++, userId: 12, date: dateStr, shiftType: 'night' });
  }
  return schedules;
}

// ============================================================
// GLOBALS
// ============================================================
var db, currentUser = null, currentPage = 'dashboard', clockInterval = null, lastViewedAnnId = 0;
try { db = loadDB(); } catch(e) { console.error('DB init error:', e); db = initDB(); }

// ============================================================
// 週循環出勤邏輯
// 讓所有員工一個禮拜都正常上班下班，遲到的遲到、早退的早退
// 每天不同，一週為單位無限循環
// 只有系統管理員需要自己手動打卡操控
// ============================================================

// Auto-generate realistic attendance for today so the demo doesn't look empty
function ensureTodayAttendance(excludeUserId) {
  const todayStr = fmtDate(new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (db.lastAttendanceDate === todayStr) return;

  // Fixed shift mapping
  const uidShift = { 9:'afternoon', 10:'afternoon', 11:'night', 12:'night' };
  const shiftCfg = {
    morning:   { startH:9, endH:18, earlyBase:8 },
    afternoon: { startH:14, endH:22, earlyBase:13 },
    night:     { startH:22, endH:6, earlyBase:21 }
  };

  // Weekly pattern: which user IDs are late / early each day (loops every 7 days)
  // day 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  const weeklyLate = {
    1: [3, 10],       // Mon: 李小華 late, 鄭雅琪 late
    2: [5, 7],        // Tue: 陳志豪 late, 黃建國 late
    3: [4, 9],        // Wed: 張美玲 late, 許志偉 late
    4: [2, 6],        // Thu: 王大明 late, 林雅婷 late
    5: [8, 3],        // Fri: 吳佳蓉 late, 李小華 late
  };
  const weeklyEarly = {
    1: [7, 12],       // Mon: 黃建國 early, 周佩君 early
    2: [4, 11],       // Tue: 張美玲 early, 蔡明翰 early
    3: [6, 8],        // Wed: 林雅婷 early, 吳佳蓉 early
    4: [5, 10],       // Thu: 陳志豪 early, 鄭雅琪 early
    5: [2, 9],        // Fri: 王大明 early, 許志偉 early
  };
  // Late minutes per person per day (varies)
  const lateMinPool = [12, 18, 7, 25, 15, 9, 22, 5, 30, 14, 8, 20];
  const earlyMinPool = [10, 15, 22, 8, 18, 12, 25, 6, 20, 14, 9, 17];

  const dayOfWeek = now.getDay();
  const dayOfMonth = now.getDate();
  const todayLate = weeklyLate[dayOfWeek] || [];
  const todayEarly = weeklyEarly[dayOfWeek] || [];

  const activeUsers = db.users.filter(u => u.status === 'active');
  activeUsers.forEach(u => {
    if (u.id === excludeUserId) return;
    if (db.attendance.find(a => a.userId === u.id && a.date === todayStr)) return;

    const shift = uidShift[u.id] || 'morning';
    const cfg = shiftCfg[shift];
    const shiftStartMin = cfg.startH * 60;
    const shiftEndMin = cfg.endH * 60;
    const crossesMidnight = shiftEndMin < shiftStartMin;

    // Only generate if current time is past shift start - 15min
    if (crossesMidnight) {
      if (nowMin < shiftStartMin - 15 && nowMin > shiftEndMin) return;
    } else {
      if (nowMin < shiftStartMin - 15) return;
    }

    const isLate = todayLate.includes(u.id);
    const isEarly = todayEarly.includes(u.id);
    let clockIn, clockOut = null, status = 'normal', lateMins = 0, earlyMins = 0;

    // Clock in
    if (isLate) {
      lateMins = lateMinPool[(u.id + dayOfMonth) % lateMinPool.length];
      const totalMin = cfg.startH * 60 + lateMins;
      clockIn = `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
      status = 'late';
    } else {
      const offset = ((u.id * 7 + dayOfMonth * 3) % 14) + 1; // 1~14 min early
      const m = cfg.earlyBase * 60 + 60 - offset;
      clockIn = `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    }

    // Don't generate if clock-in time is in the future
    const [ciH, ciM] = clockIn.split(':').map(Number);
    if (ciH * 60 + ciM > nowMin) return;

    // Clock out
    const shiftEnded = crossesMidnight
      ? (nowMin > shiftEndMin && nowMin < shiftStartMin)
      : (nowMin > shiftEndMin);

    if (shiftEnded) {
      if (isEarly) {
        earlyMins = earlyMinPool[(u.id + dayOfMonth) % earlyMinPool.length];
        const totalMin = cfg.endH * 60 - earlyMins;
        clockOut = `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
        status = status === 'late' ? 'late+early' : 'early';
      } else {
        const extra = ((u.id * 3 + dayOfMonth) % 12) + 1;
        clockOut = `${String(cfg.endH).padStart(2,'0')}:${String(extra).padStart(2,'0')}`;
      }
    }

    db.attendance.push({
      id: db.nextId.attendance++,
      userId: u.id, date: todayStr, clockIn, clockOut, status,
      lateMinutes: lateMins, earlyLeaveMinutes: earlyMins, shift
    });
  });

  db.lastAttendanceDate = todayStr;
  saveDB(db);
}

// ============================================================
// UTILITIES
// ============================================================
function fmtDate(d) {
  if (typeof d === 'string') return d;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDateTime(d) { return new Date(d).toLocaleString('zh-TW'); }
function today() { return fmtDate(new Date()); }
function getUserName(id) { const u = db.users.find(u=>u.id===id); return u ? u.name : '未知'; }
function getDeptName(id) { const d = db.departments.find(d=>d.id===id); return d ? d.name : '未知'; }
function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isManager() { return currentUser && (currentUser.role === 'manager' || currentUser.role === 'admin'); }

const shiftTimes = {
  morning:   { start:'09:00', end:'18:00', startH:9, startM:0, endH:18, endM:0, label:'早班' },
  afternoon: { start:'14:00', end:'22:00', startH:14, startM:0, endH:22, endM:0, label:'中班' },
  night:     { start:'22:00', end:'06:00', startH:22, startM:0, endH:6, endM:0, label:'晚班' }
};

function getUserShift(userId, dateStr) {
  const s = db.schedules.find(s => s.userId === userId && s.date === dateStr);
  if (s) return s.shiftType;
  // Default shift by user ID
  const defaultShifts = { 9:'afternoon', 10:'afternoon', 11:'night', 12:'night' };
  return defaultShifts[userId] || 'morning';
}

function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showModal(title, bodyHtml, footerHtml='') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }

// ============================================================
// AUTH
// ============================================================
function doLogin() {
  try {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const found = db.users.find(u => (u.employeeId === user || u.email === user || (user === 'admin' && u.role === 'admin')) && u.password === pass && u.status === 'active');
    if (!found) {
      const err = document.getElementById('loginError');
      err.textContent = '帳號或密碼錯誤，請重新輸入';
      err.style.display = 'block';
      return;
    }
    currentUser = found;
    try { sessionStorage.setItem('hr_user_id', found.id); } catch(e) {};
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('app').style.width = '100%';
    document.getElementById('userName').textContent = found.name;
    document.getElementById('userRole').textContent = found.role === 'admin' ? '系統管理員' : found.role === 'manager' ? '部門主管' : '一般員工';
    document.getElementById('userAvatar').textContent = found.name[0];
    if (found.role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
    ensureTodayAttendance(found.id);
    startClock();
    navigate('clock');
  } catch(e) {
    console.error('Login error:', e);
    alert('登入發生錯誤: ' + e.message);
  }
}

function doLogout() {
  try { sessionStorage.removeItem('hr_user_id'); } catch(e) {};
  currentUser = null;
  document.getElementById('loginPage').style.display = '';
  document.getElementById('app').style.display = 'none';
  if (clockInterval) clearInterval(clockInterval);
}

function autoLogin() {
  try {
    const uid = sessionStorage.getItem('hr_user_id');
    if (uid) {
      const found = db.users.find(u => u.id === parseInt(uid));
      if (found) {
        document.getElementById('loginUser').value = found.employeeId;
        document.getElementById('loginPass').value = found.password;
        doLogin();
      }
    }
  } catch(e) {}
}

// ============================================================
// CLOCK
// ============================================================
function startClock() {
  function tick() {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-TW', { hour12: false });
    const date = now.toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
    document.getElementById('topClock').textContent = time;
    document.getElementById('topDate').textContent = date;
    const lc = document.getElementById('liveClock');
    if (lc) lc.textContent = time;
    const ld = document.getElementById('liveDate');
    if (ld) ld.textContent = date;
  }
  tick();
  clockInterval = setInterval(tick, 1000);
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ============================================================
// NAVIGATION
// ============================================================
document.addEventListener('click', e => {
  const nav = e.target.closest('.nav-item[data-page]');
  if (nav) {
    navigate(nav.dataset.page);
    document.getElementById('sidebar').classList.remove('open');
  }
});

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const titles = { dashboard:'儀表板', clock:'員工打卡', records:'出勤記錄', leave:'請假管理', overtime:'加班管理', schedule:'排班管理', announcements:'公告系統', employees:'員工管理', departments:'部門管理', salary:'薪資報表', reports:'統計報表' };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  const render = { dashboard:renderDashboard, clock:renderClock, records:renderRecords, leave:renderLeave, overtime:renderOvertime, schedule:renderSchedule, announcements:renderAnnouncements, employees:renderEmployees, departments:renderDepartments, salary:renderSalary, reports:renderReports };
  if (render[page]) render[page]();
  updateBadges();
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count === 0) {
    el.className = '';
    el.textContent = '';
  } else if (count === 1) {
    el.className = 'nav-badge dot';
    el.textContent = '';
  } else {
    el.className = 'nav-badge';
    el.textContent = count;
  }
}

function updateBadges() {
  if (!currentUser) return;

  // Clock: red dot if not clocked in (after shift start) or not clocked out (after shift end)
  const myClock = db.attendance.find(a => a.userId === currentUser.id && a.date === today());
  const myShift = getUserShift(currentUser.id, today());
  const myCfg = shiftTimes[myShift];
  const nowTime = new Date();
  const nowMinutes = nowTime.getHours() * 60 + nowTime.getMinutes();
  const myStartMin = myCfg.startH * 60 + myCfg.startM;
  const myEndMin = myCfg.endH * 60 + myCfg.endM;
  const myCrosses = myEndMin < myStartMin;
  const myShiftEnded = myCrosses ? (nowMinutes > myEndMin && nowMinutes < myStartMin) : (nowMinutes > myEndMin);
  let clockBadge = 0;
  if (!myClock && nowMinutes >= myStartMin) {
    clockBadge = 1; // not clocked in, shift started
  } else if (myClock && !myClock.clockOut && myShiftEnded) {
    // Only show clock-out dot if they clocked in BEFORE shift end
    const [ciH, ciM] = myClock.clockIn.split(':').map(Number);
    const clockInMin = ciH * 60 + ciM;
    const clockedInBeforeEnd = myCrosses
      ? (clockInMin >= myStartMin || clockInMin <= myEndMin)
      : (clockInMin <= myEndMin);
    if (clockedInBeforeEnd) clockBadge = 1;
  }
  setBadge('badge-clock', clockBadge);

  // Leave: pending leave requests (for managers/admin)
  const pendingLeaves = isManager() ? db.leaves.filter(l => l.status === 'pending').length : 0;
  setBadge('badge-leave', pendingLeaves);

  // Overtime: pending overtime requests (for managers/admin)
  const pendingOT = isManager() ? db.overtime.filter(o => o.status === 'pending').length : 0;
  setBadge('badge-overtime', pendingOT);

  // Announcements: show badge for new announcements since last viewed
  const newAnn = db.announcements.filter(a => a.id > lastViewedAnnId).length;
  setBadge('badge-announcements', newAnn);

  // Records: count of employees whose shift started but haven't clocked in (遲到中)
  const todayStr = today();
  if (isManager()) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const activeUsers = db.users.filter(u => u.status === 'active');
    let lateCount = 0;
    activeUsers.forEach(u => {
      const hasRecord = db.attendance.find(a => a.userId === u.id && a.date === todayStr);
      if (!hasRecord) {
        const shift = getUserShift(u.id, todayStr);
        const cfg = shiftTimes[shift];
        const startMin = cfg.startH * 60 + cfg.startM;
        if (nowMin >= startMin) lateCount++;
      }
    });
    setBadge('badge-records', lateCount);
  } else {
    setBadge('badge-records', 0);
  }

  // Dashboard & Schedule: no badges
  setBadge('badge-dashboard', 0);
  setBadge('badge-schedule', 0);
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const todayStr = today();
  const todayRecords = db.attendance.filter(a => a.date === todayStr);
  const activeUsers = db.users.filter(u => u.status === 'active').length;
  const clockedIn = todayRecords.length;
  const lateCount = todayRecords.filter(a => a.status.includes('late')).length;
  const pendingLeaves = db.leaves.filter(l => l.status === 'pending').length;
  const pendingOT = db.overtime.filter(o => o.status === 'pending').length;

  const myRecord = todayRecords.find(a => a.userId === currentUser.id);
  const myStatus = myRecord ? (myRecord.clockOut ? '已下班 ✓' : '已打卡上班') : '尚未打卡';
  const myStatusClass = myRecord ? (myRecord.clockOut ? 'badge-success' : 'badge-info') : 'badge-warning';

  let html = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info"><div class="stat-value">${activeUsers}</div><div class="stat-label">在職員工</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info"><div class="stat-value">${clockedIn}</div><div class="stat-label">今日已打卡</div></div></div>
      <div class="stat-card"><div class="stat-icon yellow">⚠️</div><div class="stat-info"><div class="stat-value">${lateCount}</div><div class="stat-label">今日遲到</div></div></div>
      <div class="stat-card"><div class="stat-icon red">📝</div><div class="stat-info"><div class="stat-value">${pendingLeaves + pendingOT}</div><div class="stat-label">待審核申請</div></div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-header"><h3>我的今日狀態</h3><span class="badge ${myStatusClass}">${myStatus}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><div style="font-size:11px;color:var(--text-muted)">上班打卡</div><div style="font-size:18px;font-weight:700;margin-top:4px">${myRecord ? myRecord.clockIn : '--:--'}</div></div>
          <div><div style="font-size:11px;color:var(--text-muted)">下班打卡</div><div style="font-size:18px;font-weight:700;margin-top:4px">${myRecord && myRecord.clockOut ? myRecord.clockOut : '--:--'}</div></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary btn-sm" onclick="navigate('clock')">前往打卡</button></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>最新公告</h3></div>
        ${db.announcements.slice(0,2).map(a => `
          <div style="margin-bottom:12px">
            <div style="font-size:13px;font-weight:600">${a.pinned ? '📌 ' : ''}${a.title}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${getUserName(a.authorId)} · ${a.createdAt.substring(0,10)}</div>
          </div>
        `).join('')}
        <button class="btn btn-ghost btn-sm" onclick="navigate('announcements')">查看全部</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header"><h3>本月出勤趨勢</h3></div>
      ${renderAttendanceChart()}
    </div>
  `;
  document.getElementById('pageContent').innerHTML = html;
}

function renderAttendanceChart() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = [];
  for (let d = 1; d <= now.getDate(); d++) {
    const date = new Date(year, month, d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = fmtDate(date);
    const count = db.attendance.filter(a => a.date === dateStr).length;
    days.push({ label: d, count });
  }
  const max = Math.max(...days.map(d => d.count), 1);
  return `<div class="chart-bar">${days.map(d => `
    <div class="chart-col">
      <div class="chart-value">${d.count}</div>
      <div class="chart-bar-fill" style="height:${(d.count/max)*160}px;background:var(--accent)"></div>
      <div class="chart-label">${d.label}</div>
    </div>
  `).join('')}</div>`;
}

// ============================================================
// CLOCK IN/OUT
// ============================================================
function renderClock() {
  const todayStr = today();
  const myRecord = db.attendance.find(a => a.userId === currentUser.id && a.date === todayStr);
  const hasClockedIn = !!myRecord;
  const hasClockedOut = myRecord && myRecord.clockOut;

  let statusHtml = '';
  if (!hasClockedIn) statusHtml = '<div class="clock-status"><span class="badge badge-warning">尚未打卡上班</span></div>';
  else if (!hasClockedOut) statusHtml = `<div class="clock-status"><span class="badge badge-info">已於 ${myRecord.clockIn} 打卡上班</span>${myRecord.status.includes('late') ? ` <span class="badge badge-danger">遲到 ${myRecord.lateMinutes} 分鐘</span>` : ''}</div>`;
  else statusHtml = `<div class="clock-status"><span class="badge badge-success">今日出勤完成 ${myRecord.clockIn} ~ ${myRecord.clockOut}</span></div>`;

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="clock-section">
        <div class="live-clock" id="liveClock">00:00:00</div>
        <div class="live-date" id="liveDate"></div>
        <div class="clock-buttons">
          <button class="btn btn-success btn-clock" onclick="doClockIn()" ${hasClockedIn ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>☀️ 上班打卡</button>
          <button class="btn btn-primary btn-clock" onclick="doClockOut()" ${!hasClockedIn || hasClockedOut ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>🌙 下班打卡</button>
        </div>
        ${statusHtml}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>本週打卡記錄</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>日期</th><th>上班</th><th>下班</th><th>狀態</th></tr></thead>
          <tbody>
            ${getWeekRecords().map(r => `<tr>
              <td>${r.date}</td>
              <td style="color:${r.lateMinutes?'var(--danger)':r.clockIn?'var(--success)':'var(--text-muted)'};font-weight:600">${r.clockIn || '--'}</td>
              <td style="color:${r.earlyLeaveMinutes?'var(--warning)':r.clockOut?'var(--success)':'var(--text-muted)'};font-weight:600">${r.clockOut || '--'}</td>
              <td>${statusBadge(r.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function doClockIn() {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const shift = getUserShift(currentUser.id, today());
  const cfg = shiftTimes[shift];
  const graceMinutes = db.settings.lateGrace || 0;
  const workStartMin = cfg.startH * 60 + cfg.startM + graceMinutes;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isLate = nowMin > workStartMin;
  const lateMins = isLate ? nowMin - (cfg.startH * 60 + cfg.startM) : 0;

  const record = {
    id: db.nextId.attendance++,
    userId: currentUser.id,
    date: today(),
    clockIn: timeStr,
    clockOut: null,
    status: isLate ? 'late' : 'normal',
    lateMinutes: lateMins,
    earlyLeaveMinutes: 0,
    shift: shift
  };
  db.attendance.push(record);
  saveDB(db);
  toast(isLate ? `上班打卡成功（遲到 ${lateMins} 分鐘）` : `上班打卡成功！(${cfg.label})`, isLate ? 'error' : 'success');
  renderClock();
  updateBadges();
}

function doClockOut() {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const record = db.attendance.find(a => a.userId === currentUser.id && a.date === today());
  if (!record) return;
  const shift = record.shift || getUserShift(currentUser.id, today());
  const cfg = shiftTimes[shift];
  const workEndMin = cfg.endH * 60 + cfg.endM;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isEarly = nowMin < workEndMin;
  const earlyMins = isEarly ? workEndMin - nowMin : 0;

  record.clockOut = timeStr;
  record.earlyLeaveMinutes = earlyMins;
  if (isEarly) record.status = record.status === 'late' ? 'late+early' : 'early';
  saveDB(db);
  toast(isEarly ? `下班打卡成功（早退 ${earlyMins} 分鐘）` : '下班打卡成功！祝您有美好的一天！', isEarly ? 'warning' : 'success');
  renderClock();
  updateBadges();
}

function getWeekRecords() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const records = [];
  const todayStr = today();
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = fmtDate(d);
    if (dateStr > todayStr) break; // don't show future days
    const rec = db.attendance.find(a => a.userId === currentUser.id && a.date === dateStr);
    records.push(rec || { date: dateStr, clockIn: null, clockOut: null, status: 'absent' });
  }
  return records;
}

function statusBadge(s) {
  const map = { normal:'<span class="badge badge-success">正常</span>', late:'<span class="badge badge-danger">遲到</span>', early:'<span class="badge badge-warning">早退</span>', 'late+early':'<span class="badge badge-danger">遲到+早退</span>', absent:'<span class="badge badge-danger">缺勤</span>', future:'<span class="badge badge-info">--</span>' };
  return map[s] || `<span class="badge badge-info">${s}</span>`;
}

// ============================================================
// RECORDS
// ============================================================
function renderRecords() {
  document.getElementById('pageContent').innerHTML = `
    <h3 style="margin-bottom:12px">📅 今日出勤 (${today()})</h3>
    <div id="shiftMorning" class="card"></div>
    <div id="shiftAfternoon" class="card"></div>
    <div id="shiftNight" class="card"></div>

    <div style="text-align:center;margin:20px 0">
      <button class="btn btn-ghost" onclick="toggleYesterday()" id="yesterdayBtn">📋 查看昨日出勤記錄</button>
    </div>
    <div id="yesterdayRecords" style="display:none">
      <h3 id="yesterdayTitle" style="margin-bottom:12px"></h3>
      <div id="yShiftMorning" class="card"></div>
      <div id="yShiftAfternoon" class="card"></div>
      <div id="yShiftNight" class="card"></div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3>📆 歷史出勤查詢</h3></div>
      <div class="filter-bar">
        <div class="form-group" style="margin:0"><label>選擇日期</label><input type="date" class="form-control" id="historyDate" max="${today()}"></div>
        <div class="form-group" style="margin:0;align-self:flex-end"><button class="btn btn-primary" onclick="loadHistoryRecords()">查詢</button></div>
      </div>
    </div>
    <div id="historyRecords" style="display:none">
      <h3 id="historyTitle" style="margin:12px 0"></h3>
      <div id="hShiftMorning" class="card"></div>
      <div id="hShiftAfternoon" class="card"></div>
      <div id="hShiftNight" class="card"></div>
    </div>
  `;
  filterRecords();
}

function isOvertimeNow(r) {
  if (r.clockOut || r.date !== today() || !r.clockIn) return false;
  const shift = getRecordShift(r);
  const cfg = shiftTimes[shift];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = cfg.startH * 60 + cfg.startM;
  const endMin = cfg.endH * 60 + cfg.endM;
  const crossesMidnight = endMin < startMin;
  return crossesMidnight ? (nowMin > endMin && nowMin < startMin) : (nowMin > endMin);
}

function getRecordShift(r) {
  if (r.shift) return r.shift;
  return getUserShift(r.userId, r.date);
}

function shiftStartedToday(r) {
  if (r.date !== today()) return true;
  const shift = getRecordShift(r);
  const cfg = shiftTimes[shift];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // For overnight shifts: if now is before end time (e.g. 00:30 < 06:00), the shift from yesterday is ongoing
  const crossesMidnight = cfg.endH < cfg.startH;
  if (crossesMidnight && nowMin < cfg.endH * 60 + cfg.endM) return false; // yesterday's shift still going, today's hasn't started
  return nowMin >= cfg.startH * 60 + cfg.startM;
}

// Check if a night shift worker from yesterday is still working now (past midnight)
function getOvernightRecord(userId) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const shift = getUserShift(userId, today());
  const cfg = shiftTimes[shift];
  const crossesMidnight = cfg.endH < cfg.startH;
  if (!crossesMidnight || nowMin >= cfg.endH * 60 + cfg.endM) return null;
  // Check yesterday's record
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yd = fmtDate(yesterday);
  const yRecord = db.attendance.find(a => a.userId === userId && a.date === yd && !a.clockOut);
  return yRecord;
}

// Check if a night shift worker from yesterday is currently working (past midnight, before shift end)
function isOvernightWorking(r) {
  if (r.date !== today() || r.clockIn || r.clockOut) return false;
  const shift = getRecordShift(r);
  const cfg = shiftTimes[shift];
  if (cfg.endH >= cfg.startH) return false; // not an overnight shift
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= cfg.endH * 60 + cfg.endM) return false; // past shift end
  // Check if yesterday has a clock-in record for this user's night shift
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yd = fmtDate(yesterday);
  const yRec = db.attendance.find(a => a.userId === r.userId && a.date === yd);
  return !!(yRec && yRec.clockIn);
}

function todayClockInLabel(r) {
  if (r.clockIn) return r.clockIn;
  if (isOvernightWorking(r)) { const yd = fmtDate(new Date(new Date().setDate(new Date().getDate()-1))); const yr = db.attendance.find(a=>a.userId===r.userId&&a.date===yd); return yr ? yr.clockIn : '工作中~'; }
  if (r.date !== today()) return '缺曠';
  return shiftStartedToday(r) ? '遲到中~' : '待上班';
}

function todayClockInColor(r) {
  if (r.lateMinutes) return 'var(--danger)';
  if (r.clockIn) return 'var(--success)';
  if (isOvernightWorking(r)) return 'var(--success)';
  if (r.date !== today()) return 'var(--danger)';
  return shiftStartedToday(r) ? 'var(--danger)' : 'var(--text-muted)';
}

function todayClockOutLabel(r) {
  if (r.clockOut) return r.clockOut;
  if (r.clockIn) return isOvertimeNow(r) ? '加班中~' : '工作中~';
  if (isOvernightWorking(r)) return '工作中~';
  if (r.date !== today()) return '缺曠';
  return shiftStartedToday(r) ? '遲到中~' : '待上班';
}

function todayClockOutColor(r) {
  if (r.earlyLeaveMinutes) return 'var(--warning)';
  if (r.clockOut) return 'var(--success)';
  if (r.clockIn) return isOvertimeNow(r) ? 'var(--warning)' : 'var(--accent)';
  if (isOvernightWorking(r)) return 'var(--accent)';
  if (r.date !== today()) return 'var(--danger)';
  return shiftStartedToday(r) ? 'var(--danger)' : 'var(--text-muted)';
}

function todayStatusBadge(r) {
  if (isOvernightWorking(r)) return '<span class="badge badge-info">工作中</span>';
  if (r.date === today() && !r.clockIn && !shiftStartedToday(r)) return '<span class="badge badge-info">待上班</span>';
  return statusBadge(r.status);
}

function buildRecordRows(records) {
  return records.map(r => `<tr>
    <td>${r.date}</td>
    ${isAdmin() ? `<td>${getUserName(r.userId)}</td>` : ''}
    <td style="color:${todayClockInColor(r)};font-weight:600">${todayClockInLabel(r)}</td>
    <td style="color:${todayClockOutColor(r)};font-weight:600">${todayClockOutLabel(r)}</td>
    <td>${todayStatusBadge(r)}</td>
    <td style="color:${r.lateMinutes?'var(--danger)':'var(--success)'};font-weight:600">${r.lateMinutes || 0}</td>
    <td style="color:${r.earlyLeaveMinutes?'var(--warning)':'var(--success)'};font-weight:600">${r.earlyLeaveMinutes || 0}</td>
  </tr>`).join('');
}

function renderShiftSection(containerId, title, timeRange, color, records) {
  document.getElementById(containerId).innerHTML = `
    <div class="card-header">
      <h3><span style="color:${color}">● </span>${title} <span style="font-size:12px;color:var(--text-muted);font-weight:400">${timeRange}</span> <span style="font-size:12px;color:var(--text-muted);font-weight:400">(${records.length} 筆)</span></h3>
    </div>
    ${records.length ? `<div class="table-wrap"><table>
      <thead><tr><th>日期</th>${isAdmin() ? '<th>員工</th>' : ''}<th>上班</th><th>下班</th><th>狀態</th><th>遲到(分)</th><th>早退(分)</th></tr></thead>
      <tbody>${buildRecordRows(records)}</tbody>
    </table></div>` : '<div class="empty-state"><div class="icon">📭</div>此班別無出勤記錄</div>'}
  `;
}

function filterRecords() {
  renderRecordsForDate(today(), 'shiftMorning', 'shiftAfternoon', 'shiftNight');
}

function renderRecordsForDate(dateStr, mId, aId, nId) {
  let records = db.attendance.filter(a => a.date === dateStr);
  const targetUsers = db.users.filter(u => u.status === 'active');
  targetUsers.forEach(u => {
    if (!records.find(r => r.userId === u.id && r.date === dateStr)) {
      const shift = getUserShift(u.id, dateStr);
      records.push({ userId: u.id, date: dateStr, clockIn: null, clockOut: null, status: 'absent', lateMinutes: 0, earlyLeaveMinutes: 0, shift });
    }
  });
  records.sort((a, b) => a.userId - b.userId);
  renderShiftSection(mId, '早班', '09:00 - 18:00', '#60a5fa', records.filter(r => getRecordShift(r) === 'morning'));
  renderShiftSection(aId, '中班', '14:00 - 22:00', '#fbbf24', records.filter(r => getRecordShift(r) === 'afternoon'));
  renderShiftSection(nId, '晚班', '22:00 - 06:00', '#a78bfa', records.filter(r => getRecordShift(r) === 'night'));
}

function getYesterdayWorkday() {
  const now = new Date();
  let d = new Date(now);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

function toggleYesterday() {
  const section = document.getElementById('yesterdayRecords');
  const btn = document.getElementById('yesterdayBtn');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    btn.textContent = '📋 收起昨日出勤記錄';
    const yd = getYesterdayWorkday();
    document.getElementById('yesterdayTitle').textContent = '📋 昨日出勤 (' + yd + ')';
    renderRecordsForDate(yd, 'yShiftMorning', 'yShiftAfternoon', 'yShiftNight');
  } else {
    section.style.display = 'none';
    btn.textContent = '📋 查看昨日出勤記錄';
  }
}

function loadHistoryRecords() {
  const dateStr = document.getElementById('historyDate').value;
  if (!dateStr) { toast('請選擇日期', 'error'); return; }
  document.getElementById('historyRecords').style.display = 'block';
  document.getElementById('historyTitle').textContent = '📆 ' + dateStr + ' 出勤記錄';
  renderRecordsForDate(dateStr, 'hShiftMorning', 'hShiftAfternoon', 'hShiftNight');
  toast('已載入 ' + dateStr + ' 出勤記錄');
}

// ============================================================
// LEAVE
// ============================================================
function renderLeave() {
  const myBalances = db.leaveBalances.filter(b => b.userId === currentUser.id);
  const showAll = isManager();
  let leaves = showAll
    ? db.leaves.slice().sort((a,b) => b.id - a.id)
    : db.leaves.filter(l => l.userId === currentUser.id).sort((a,b) => b.id - a.id);

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>我的假期餘額</h3><button class="btn btn-primary btn-sm" onclick="showLeaveForm()">＋ 申請請假</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        ${myBalances.map(b => `
          <div style="padding:12px;background:var(--bg-secondary);border-radius:var(--radius);text-align:center">
            <div style="font-size:12px;color:var(--text-muted)">${b.leaveType}</div>
            <div style="font-size:22px;font-weight:700;margin:4px 0">${b.totalDays - b.usedDays}</div>
            <div style="font-size:11px;color:var(--text-muted)">剩餘 / 共${b.totalDays}天</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>${showAll ? '所有請假申請' : '我的請假記錄'}</h3></div>
      ${showAll ? `<div class="tabs" id="leaveTabs">
        <div class="tab active" data-filter="all" onclick="filterLeaves(this)">全部</div>
        <div class="tab" data-filter="pending" onclick="filterLeaves(this)">待審核</div>
        <div class="tab" data-filter="approved" onclick="filterLeaves(this)">已核准</div>
        <div class="tab" data-filter="rejected" onclick="filterLeaves(this)">已拒絕</div>
      </div>` : ''}
      <div class="table-wrap"><table>
        <thead><tr>${showAll ? '<th>申請人</th>' : ''}<th>假別</th><th>開始</th><th>結束</th><th>原因</th><th>狀態</th>${showAll ? '<th>操作</th>' : ''}</tr></thead>
        <tbody id="leaveTableBody">
          ${leaves.map(l => leaveRow(l, showAll)).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

function leaveRow(l, showAll) {
  const sBadge = l.status === 'pending' ? 'badge-pending' : l.status === 'approved' ? 'badge-success' : 'badge-danger';
  const sText = l.status === 'pending' ? '待審核' : l.status === 'approved' ? '已核准' : '已拒絕';
  return `<tr data-status="${l.status}">
    ${showAll ? `<td>${getUserName(l.userId)}</td>` : ''}
    <td>${l.type}</td><td>${l.startDate}</td><td>${l.endDate}</td><td>${l.reason}</td>
    <td><span class="badge ${sBadge}">${sText}</span></td>
    ${showAll && l.status === 'pending' ? `<td>
      <button class="btn btn-success btn-sm" onclick="approveLeave(${l.id})">核准</button>
      <button class="btn btn-danger btn-sm" onclick="rejectLeave(${l.id})">拒絕</button>
    </td>` : showAll ? '<td>--</td>' : ''}
  </tr>`;
}

function filterLeaves(tab) {
  document.querySelectorAll('#leaveTabs .tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const filter = tab.dataset.filter;
  document.querySelectorAll('#leaveTableBody tr').forEach(tr => {
    tr.style.display = (filter === 'all' || tr.dataset.status === filter) ? '' : 'none';
  });
}

function showLeaveForm() {
  const types = ['特休','病假','事假','婚假','喪假','公假','產假','陪產假'];
  showModal('申請請假', `
    <div class="form-group"><label>假別</label><select class="form-control" id="leaveType">${types.map(t=>`<option>${t}</option>`).join('')}</select></div>
    <div class="form-row">
      <div class="form-group"><label>開始日期</label><input type="date" class="form-control" id="leaveStart" value="${today()}"></div>
      <div class="form-group"><label>結束日期</label><input type="date" class="form-control" id="leaveEnd" value="${today()}"></div>
    </div>
    <div class="form-group"><label>請假原因</label><textarea class="form-control" id="leaveReason" placeholder="請輸入請假原因"></textarea></div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitLeave()">送出申請</button>`);
}

function submitLeave() {
  const type = document.getElementById('leaveType').value;
  const start = document.getElementById('leaveStart').value;
  const end = document.getElementById('leaveEnd').value;
  const reason = document.getElementById('leaveReason').value.trim();
  if (!start || !end || !reason) { toast('請填寫完整資訊','error'); return; }
  if (end < start) { toast('結束日期不可早於開始日期','error'); return; }
  db.leaves.push({ id: db.nextId.leaves++, userId: currentUser.id, type, startDate: start, endDate: end, reason, status:'pending', approvedBy:null, createdAt: today() });
  saveDB(db);
  closeModal();
  toast('請假申請已送出');
  renderLeave();
}

function approveLeave(id) {
  const l = db.leaves.find(l => l.id === id);
  if (!l) return;
  l.status = 'approved';
  l.approvedBy = currentUser.id;
  // Update balance
  const days = Math.ceil((new Date(l.endDate) - new Date(l.startDate)) / 86400000) + 1;
  const bal = db.leaveBalances.find(b => b.userId === l.userId && b.leaveType === l.type);
  if (bal) bal.usedDays += days;
  saveDB(db);
  toast('已核准請假');
  renderLeave();
  updateBadges();
}

function rejectLeave(id) {
  const l = db.leaves.find(l => l.id === id);
  if (!l) return;
  l.status = 'rejected';
  l.approvedBy = currentUser.id;
  saveDB(db);
  toast('已拒絕請假', 'error');
  renderLeave();
  updateBadges();
}

// ============================================================
// OVERTIME
// ============================================================
function renderOvertime() {
  const showAll = isManager();
  let ots = showAll
    ? db.overtime.slice().sort((a,b) => b.id - a.id)
    : db.overtime.filter(o => o.userId === currentUser.id).sort((a,b) => b.id - a.id);

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${showAll ? '加班申請管理' : '我的加班記錄'}</h3><button class="btn btn-primary btn-sm" onclick="showOvertimeForm()">＋ 申請加班</button></div>
      <div class="table-wrap"><table>
        <thead><tr>${showAll?'<th>申請人</th>':''}<th>日期</th><th>時數</th><th>原因</th><th>狀態</th>${showAll?'<th>操作</th>':''}</tr></thead>
        <tbody>${ots.map(o => {
          const sBadge = o.status==='pending'?'badge-pending':o.status==='approved'?'badge-success':'badge-danger';
          const sText = o.status==='pending'?'待審核':o.status==='approved'?'已核准':'已拒絕';
          return `<tr>
            ${showAll?`<td>${getUserName(o.userId)}</td>`:''}
            <td>${o.date}</td><td>${o.hours} 小時</td><td>${o.reason}</td>
            <td><span class="badge ${sBadge}">${sText}</span></td>
            ${showAll && o.status==='pending' ? `<td>
              <button class="btn btn-success btn-sm" onclick="approveOT(${o.id})">核准</button>
              <button class="btn btn-danger btn-sm" onclick="rejectOT(${o.id})">拒絕</button>
            </td>` : showAll ? '<td>--</td>' : ''}
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
  `;
}

function showOvertimeForm() {
  showModal('申請加班', `
    <div class="form-row">
      <div class="form-group"><label>加班日期</label><input type="date" class="form-control" id="otDate" value="${today()}"></div>
      <div class="form-group"><label>加班時數</label><input type="number" class="form-control" id="otHours" min="0.5" max="8" step="0.5" value="1"></div>
    </div>
    <div class="form-group"><label>加班原因</label><textarea class="form-control" id="otReason" placeholder="請輸入加班原因"></textarea></div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitOT()">送出申請</button>`);
}

function submitOT() {
  const date = document.getElementById('otDate').value;
  const hours = parseFloat(document.getElementById('otHours').value);
  const reason = document.getElementById('otReason').value.trim();
  if (!date || !hours || !reason) { toast('請填寫完整資訊','error'); return; }
  db.overtime.push({ id: db.nextId.overtime++, userId: currentUser.id, date, hours, reason, status:'pending', approvedBy:null });
  saveDB(db);
  closeModal();
  toast('加班申請已送出');
  renderOvertime();
}

function approveOT(id) {
  const o = db.overtime.find(o => o.id === id);
  if (!o) return;
  o.status = 'approved'; o.approvedBy = currentUser.id;
  saveDB(db); toast('已核准加班'); renderOvertime(); updateBadges();
}

function rejectOT(id) {
  const o = db.overtime.find(o => o.id === id);
  if (!o) return;
  o.status = 'rejected'; o.approvedBy = currentUser.id;
  saveDB(db); toast('已拒絕加班', 'error'); renderOvertime(); updateBadges();
}

// ============================================================
// SCHEDULE
// ============================================================
function renderSchedule() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDay.getDay();

  // Generate week view for current week
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDays.push(d);
  }

  const activeUsers = db.users.filter(u => u.status === 'active');

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>本週排班表 (${fmtDate(weekDays[0])} ~ ${fmtDate(weekDays[6])})</h3>
        ${isAdmin() ? '<button class="btn btn-primary btn-sm" onclick="showScheduleForm()">＋ 新增排班</button>' : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>員工</th>${weekDays.map((d,i) => `<th>${['一','二','三','四','五','六','日'][i]}<br>${d.getDate()}</th>`).join('')}</tr></thead>
        <tbody>${activeUsers.map(u => `<tr>
          <td style="font-weight:600">${u.name}</td>
          ${weekDays.map(d => {
            const dateStr = fmtDate(d);
            const s = db.schedules.find(s => s.userId === u.id && s.date === dateStr);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const shift = s ? s.shiftType : (isWeekend ? 'off' : 'morning');
            const labels = { morning:'早班<br><small style="opacity:.7">08:00-16:00</small>', afternoon:'中班<br><small style="opacity:.7">14:00-22:00</small>', night:'晚班<br><small style="opacity:.7">22:00-06:00</small>', off:'休假' };
            const cls = { morning:'shift-morning', afternoon:'shift-afternoon', night:'shift-night', off:'shift-off' };
            return `<td><span class="shift ${cls[shift]}">${labels[shift]}</span></td>`;
          }).join('')}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  `;
}

function showScheduleForm() {
  const activeUsers = db.users.filter(u => u.status === 'active');
  showModal('新增排班', `
    <div class="form-group"><label>員工</label><select class="form-control" id="schedUser">${activeUsers.map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}</select></div>
    <div class="form-group"><label>日期</label><input type="date" class="form-control" id="schedDate" value="${today()}"></div>
    <div class="form-group"><label>班別</label><select class="form-control" id="schedShift">
      <option value="morning">早班 (08:00-16:00)</option>
      <option value="afternoon">中班 (14:00-22:00)</option>
      <option value="night">晚班 (22:00-06:00)</option>
      <option value="off">休假</option>
    </select></div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitSchedule()">儲存</button>`);
}

function submitSchedule() {
  const userId = parseInt(document.getElementById('schedUser').value);
  const date = document.getElementById('schedDate').value;
  const shiftType = document.getElementById('schedShift').value;
  const existing = db.schedules.findIndex(s => s.userId === userId && s.date === date);
  if (existing >= 0) db.schedules[existing].shiftType = shiftType;
  else db.schedules.push({ id: db.nextId.schedules++, userId, date, shiftType });
  saveDB(db);
  closeModal();
  toast('排班已更新');
  renderSchedule();
}

// ============================================================
// ANNOUNCEMENTS
// ============================================================
function renderAnnouncements() {
  // Save current threshold before updating, so NEW tags render first
  const prevViewedId = lastViewedAnnId;

  const sorted = db.announcements.slice().sort((a,b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>公告列表</h3>
        ${isAdmin() ? '<button class="btn btn-primary btn-sm" onclick="showAnnouncementForm()">＋ 發布公告</button>' : ''}
      </div>
      ${sorted.map(a => `
        <div class="announcement-item">
          <h4>${a.pinned ? '📌 ' : ''}${a.id > prevViewedId ? '<span class="ann-new">NEW!!!</span> ' : ''}${a.title}${isAdmin() ? ` <button class="btn btn-ghost btn-sm" style="float:right" onclick="deleteAnnouncement(${a.id})">刪除</button>` : ''}</h4>
          <div class="meta">${getUserName(a.authorId)} · ${a.createdAt.substring(0,10)}</div>
          <p>${a.content}</p>
        </div>
      `).join('')}
    </div>
  `;
  // Now mark as viewed and clear badge
  lastViewedAnnId = db.announcements.reduce((m, a) => Math.max(m, a.id), 0);
  updateBadges();
}

function showAnnouncementForm() {
  showModal('發布公告', `
    <div class="form-group"><label>標題</label><input type="text" class="form-control" id="annTitle" placeholder="公告標題"></div>
    <div class="form-group"><label>內容</label><textarea class="form-control" id="annContent" rows="5" placeholder="公告內容"></textarea></div>
    <div class="form-group"><label><input type="checkbox" id="annPinned"> 置頂公告</label></div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitAnnouncement()">發布</button>`);
}

function submitAnnouncement() {
  const title = document.getElementById('annTitle').value.trim();
  const content = document.getElementById('annContent').value.trim();
  const pinned = document.getElementById('annPinned').checked;
  if (!title || !content) { toast('請填寫完整資訊','error'); return; }
  db.announcements.push({ id: db.nextId.announcements++, title, content, authorId: currentUser.id, createdAt: new Date().toISOString(), pinned });
  saveDB(db);
  closeModal();
  toast('公告已發布');
  renderAnnouncements();
}

function deleteAnnouncement(id) {
  db.announcements = db.announcements.filter(a => a.id !== id);
  saveDB(db);
  toast('公告已刪除');
  renderAnnouncements();
}

// ============================================================
// EMPLOYEES
// ============================================================
function renderEmployees() {
  const users = db.users.slice().sort((a,b) => a.id - b.id);
  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>員工列表 (${users.length} 人)</h3>
        <button class="btn btn-primary btn-sm" onclick="showEmployeeForm()">＋ 新增員工</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>編號</th><th>姓名</th><th>部門</th><th>角色</th><th>Email</th><th>到職日</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td>${u.employeeId}</td>
          <td style="font-weight:600">${u.name}</td>
          <td>${getDeptName(u.departmentId)}</td>
          <td>${u.role === 'admin' ? '管理員' : u.role === 'manager' ? '主管' : '員工'}</td>
          <td>${u.email}</td>
          <td>${u.hireDate}</td>
          <td><span class="badge ${u.status==='active'?'badge-success':'badge-danger'}">${u.status==='active'?'在職':'停用'}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="editEmployee(${u.id})">編輯</button>
            ${u.role !== 'admin' ? `<button class="btn btn-sm ${u.status==='active'?'btn-danger':'btn-success'}" onclick="toggleEmployee(${u.id})">${u.status==='active'?'停用':'啟用'}</button>` : ''}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  `;
}

function showEmployeeForm(user) {
  const isEdit = !!user;
  const depts = db.departments;
  showModal(isEdit ? '編輯員工' : '新增員工', `
    <div class="form-row">
      <div class="form-group"><label>員工編號</label><input type="text" class="form-control" id="empId" value="${isEdit?user.employeeId:('A'+String(db.nextId.users).padStart(3,'0'))}" ${isEdit?'readonly':''}></div>
      <div class="form-group"><label>姓名</label><input type="text" class="form-control" id="empName" value="${isEdit?user.name:''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="empEmail" value="${isEdit?user.email:''}"></div>
      <div class="form-group"><label>密碼</label><input type="text" class="form-control" id="empPass" value="${isEdit?user.password:'123456'}" placeholder="預設 123456"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>部門</label><select class="form-control" id="empDept">${depts.map(d=>`<option value="${d.id}" ${isEdit&&user.departmentId===d.id?'selected':''}>${d.name}</option>`).join('')}</select></div>
      <div class="form-group"><label>角色</label><select class="form-control" id="empRole">
        <option value="employee" ${isEdit&&user.role==='employee'?'selected':''}>一般員工</option>
        <option value="manager" ${isEdit&&user.role==='manager'?'selected':''}>部門主管</option>
        <option value="admin" ${isEdit&&user.role==='admin'?'selected':''}>系統管理員</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>月薪</label><input type="number" class="form-control" id="empSalary" value="${isEdit?user.salary:40000}"></div>
      <div class="form-group"><label>到職日</label><input type="date" class="form-control" id="empHire" value="${isEdit?user.hireDate:today()}"></div>
    </div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitEmployee(${isEdit?user.id:'null'})">${isEdit?'更新':'新增'}</button>`);
}

function submitEmployee(editId) {
  const data = {
    employeeId: document.getElementById('empId').value.trim(),
    name: document.getElementById('empName').value.trim(),
    email: document.getElementById('empEmail').value.trim(),
    password: document.getElementById('empPass').value,
    departmentId: parseInt(document.getElementById('empDept').value),
    role: document.getElementById('empRole').value,
    salary: parseInt(document.getElementById('empSalary').value),
    hireDate: document.getElementById('empHire').value,
  };
  if (!data.name || !data.email) { toast('請填寫完整資訊','error'); return; }

  if (editId) {
    const u = db.users.find(u => u.id === editId);
    Object.assign(u, data);
  } else {
    data.id = db.nextId.users++;
    data.status = 'active';
    db.users.push(data);
    // Create leave balances
    const types = ['特休','病假','事假','婚假','喪假'];
    const days = [7,30,14,8,8];
    types.forEach((t,i) => {
      db.leaveBalances.push({ id: db.leaveBalances.length+1, userId: data.id, leaveType:t, totalDays:days[i], usedDays:0, year: new Date().getFullYear() });
    });
  }
  saveDB(db);
  closeModal();
  toast(editId ? '員工資料已更新' : '員工已新增');
  renderEmployees();
}

function editEmployee(id) { showEmployeeForm(db.users.find(u => u.id === id)); }

function toggleEmployee(id) {
  const u = db.users.find(u => u.id === id);
  u.status = u.status === 'active' ? 'inactive' : 'active';
  saveDB(db);
  toast(`已${u.status === 'active' ? '啟用' : '停用'} ${u.name}`);
  renderEmployees();
}

// ============================================================
// DEPARTMENTS
// ============================================================
function renderDepartments() {
  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>部門管理</h3><button class="btn btn-primary btn-sm" onclick="showDeptForm()">＋ 新增部門</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>部門名稱</th><th>主管</th><th>人數</th><th>操作</th></tr></thead>
        <tbody>${db.departments.map(d => {
          const count = db.users.filter(u=>u.departmentId===d.id&&u.status==='active').length;
          return `<tr>
            <td style="font-weight:600">${d.name}</td>
            <td>${getUserName(d.managerId)}</td>
            <td>${count} 人</td>
            <td><button class="btn btn-ghost btn-sm" onclick="editDept(${d.id})">編輯</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
  `;
}

function showDeptForm(dept) {
  const isEdit = !!dept;
  const managers = db.users.filter(u => u.status === 'active');
  showModal(isEdit ? '編輯部門' : '新增部門', `
    <div class="form-group"><label>部門名稱</label><input type="text" class="form-control" id="deptName" value="${isEdit?dept.name:''}"></div>
    <div class="form-group"><label>部門主管</label><select class="form-control" id="deptMgr">
      <option value="">-- 選擇主管 --</option>
      ${managers.map(m=>`<option value="${m.id}" ${isEdit&&dept.managerId===m.id?'selected':''}>${m.name} (${m.employeeId})</option>`).join('')}
    </select></div>
  `, `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitDept(${isEdit?dept.id:'null'})">${isEdit?'更新':'新增'}</button>`);
}

function submitDept(editId) {
  const name = document.getElementById('deptName').value.trim();
  const managerId = parseInt(document.getElementById('deptMgr').value) || null;
  if (!name) { toast('請輸入部門名稱','error'); return; }
  if (editId) {
    const d = db.departments.find(d => d.id === editId);
    d.name = name; d.managerId = managerId;
  } else {
    db.departments.push({ id: Math.max(...db.departments.map(d=>d.id)) + 1, name, managerId });
  }
  saveDB(db); closeModal(); toast('部門已更新'); renderDepartments();
}

function editDept(id) { showDeptForm(db.departments.find(d => d.id === id)); }

// ============================================================
// SALARY
// ============================================================
function renderSalary() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>薪資報表</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="month" class="form-control" id="salaryMonth" value="${monthStr}" onchange="calcSalary()">
          <button class="btn btn-primary btn-sm" onclick="calcSalary()">計算</button>
        </div>
      </div>
      <div id="salaryTable"></div>
    </div>
  `;
  calcSalary();
}

function calcSalary() {
  const monthStr = document.getElementById('salaryMonth').value;
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Count work days
  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() !== 0 && date.getDay() !== 6) workDays++;
  }

  const rows = db.users.filter(u => u.status === 'active').map(u => {
    const monthRecords = db.attendance.filter(a => a.userId === u.id && a.date.startsWith(monthStr));
    const attendDays = monthRecords.length;
    const lateMins = monthRecords.reduce((s,r) => s + (r.lateMinutes || 0), 0);
    const earlyMins = monthRecords.reduce((s,r) => s + (r.earlyLeaveMinutes || 0), 0);
    const absentDays = workDays - attendDays;

    // Approved OT hours this month
    const otHours = db.overtime.filter(o => o.userId === u.id && o.date.startsWith(monthStr) && o.status === 'approved')
      .reduce((s,o) => s + o.hours, 0);

    const dailyRate = u.salary / workDays;
    const hourlyRate = dailyRate / 8;
    const latePenalty = Math.floor(lateMins / 30) * (hourlyRate * 0.5);
    const earlyPenalty = Math.floor(earlyMins / 30) * (hourlyRate * 0.5);
    const absentDeduct = absentDays * dailyRate;
    const otPay = otHours * hourlyRate * (db.settings.overtimeRate || 1.33);
    const totalPay = Math.round(u.salary - latePenalty - earlyPenalty - absentDeduct + otPay) || 0;

    return { ...u, attendDays, lateMins, earlyMins, absentDays, otHours, latePenalty: Math.round(latePenalty), earlyPenalty: Math.round(earlyPenalty), absentDeduct: Math.round(absentDeduct), otPay: Math.round(otPay), totalPay };
  });

  document.getElementById('salaryTable').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>員工</th><th>底薪</th><th>出勤</th><th>缺勤</th><th>遲到扣</th><th>早退扣</th><th>曠職扣</th><th>加班費</th><th style="color:var(--accent)">實發</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td style="font-weight:600">${r.name}</td>
        <td>$${r.salary.toLocaleString()}</td>
        <td>${r.attendDays}天</td>
        <td>${r.absentDays}天</td>
        <td style="color:var(--danger)">-$${r.latePenalty.toLocaleString()}</td>
        <td style="color:var(--danger)">-$${r.earlyPenalty.toLocaleString()}</td>
        <td style="color:var(--danger)">-$${r.absentDeduct.toLocaleString()}</td>
        <td style="color:var(--success)">+$${r.otPay.toLocaleString()}</td>
        <td style="font-weight:700;color:var(--accent)">$${r.totalPay.toLocaleString()}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="8" style="font-weight:700;text-align:right">合計</td><td style="font-weight:700;color:var(--accent)">$${rows.reduce((s,r)=>s+r.totalPay,0).toLocaleString()}</td></tr></tfoot>
    </table></div>
    <p style="margin-top:12px;font-size:11px;color:var(--text-muted)">* 遲到/早退每滿30分鐘扣時薪50%，曠職扣全日薪，加班費率 ${db.settings.overtimeRate}x</p>
  `;
}

// ============================================================
// REPORTS
// ============================================================
function renderReports() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>統計報表</h3>
        <input type="month" class="form-control" id="reportMonth" value="${monthStr}" onchange="updateReports()">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" id="deptReport"></div>
      <div class="card" id="statusReport"></div>
    </div>
    <div class="card" id="rankReport" style="margin-top:16px"></div>
  `;
  updateReports();
}

function updateReports() {
  const monthStr = document.getElementById('reportMonth').value;

  // Dept stats
  const deptStats = db.departments.map(d => {
    const users = db.users.filter(u => u.departmentId === d.id && u.status === 'active');
    const records = db.attendance.filter(a => a.date.startsWith(monthStr) && users.some(u => u.id === a.userId));
    const lateCount = records.filter(r => r.status.includes('late')).length;
    return { name: d.name, total: users.length, records: records.length, late: lateCount };
  });

  document.getElementById('deptReport').innerHTML = `
    <div class="card-header"><h3>部門出勤統計</h3></div>
    <table>
      <thead><tr><th>部門</th><th>人數</th><th>打卡次數</th><th>遲到次數</th><th>出勤率</th></tr></thead>
      <tbody>${deptStats.map(d => {
        const rate = d.total > 0 ? Math.round((d.records / (d.total * 22)) * 100) : 0;
        return `<tr><td style="font-weight:600">${d.name}</td><td>${d.total}</td><td>${d.records}</td><td style="color:var(--danger)">${d.late}</td><td><span class="badge ${rate>=90?'badge-success':rate>=70?'badge-warning':'badge-danger'}">${rate}%</span></td></tr>`;
      }).join('')}</tbody>
    </table>
  `;

  // Status distribution
  const allRecords = db.attendance.filter(a => a.date.startsWith(monthStr));
  const normalCount = allRecords.filter(r => r.status === 'normal').length;
  const lateTotal = allRecords.filter(r => r.status.includes('late')).length;
  const earlyTotal = allRecords.filter(r => r.status.includes('early')).length;
  const total = allRecords.length || 1;

  document.getElementById('statusReport').innerHTML = `
    <div class="card-header"><h3>出勤狀態分佈</h3></div>
    <div style="padding:20px">
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>正常</span><span>${normalCount} 次 (${Math.round(normalCount/total*100)}%)</span></div>
        <div style="height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden"><div style="height:100%;width:${normalCount/total*100}%;background:var(--success);border-radius:4px"></div></div>
      </div>
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>遲到</span><span>${lateTotal} 次 (${Math.round(lateTotal/total*100)}%)</span></div>
        <div style="height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden"><div style="height:100%;width:${lateTotal/total*100}%;background:var(--danger);border-radius:4px"></div></div>
      </div>
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>早退</span><span>${earlyTotal} 次 (${Math.round(earlyTotal/total*100)}%)</span></div>
        <div style="height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden"><div style="height:100%;width:${earlyTotal/total*100}%;background:var(--warning);border-radius:4px"></div></div>
      </div>
    </div>
  `;

  // Employee ranking
  const userStats = db.users.filter(u => u.status === 'active').map(u => {
    const rec = db.attendance.filter(a => a.userId === u.id && a.date.startsWith(monthStr));
    const late = rec.filter(r => r.status.includes('late')).length;
    return { name: u.name, dept: getDeptName(u.departmentId), total: rec.length, late, onTime: rec.length - late };
  }).sort((a,b) => b.onTime - a.onTime);

  document.getElementById('rankReport').innerHTML = `
    <div class="card-header"><h3>員工出勤排名</h3></div>
    <table>
      <thead><tr><th>排名</th><th>員工</th><th>部門</th><th>出勤天數</th><th>準時天數</th><th>遲到天數</th></tr></thead>
      <tbody>${userStats.map((u,i) => `<tr>
        <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
        <td style="font-weight:600">${u.name}</td>
        <td>${u.dept}</td>
        <td>${u.total}</td>
        <td style="color:var(--success)">${u.onTime}</td>
        <td style="color:var(--danger)">${u.late}</td>
      </tr>`).join('')}</tbody>
    </table>
  `;
}

// ============================================================
// INIT
// ============================================================
document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
autoLogin();
