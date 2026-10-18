// =============================================================
// API CLIENT
// =============================================================
let token = null;
const API = '/api';

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 401) { doLogout(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '伺服器錯誤' }));
    throw new Error(err.error || '請求失敗');
  }
  return res.json();
}

// ============================================================
// GLOBALS
// ============================================================
var currentUser = null, currentPage = 'dashboard', clockInterval = null, lastViewedAnnId = 0;
// Cache for user/department lookups (refreshed on each page load)
var cachedUsers = [], cachedDepartments = [];

// ============================================================
// UTILITIES
// ============================================================
function pad2(n) { return String(n).padStart(2, '0'); }
function minToTime(m) { return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }

function fmtDate(d) {
  if (typeof d === 'string') return d;
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function fmtDateTime(d) { return new Date(d).toLocaleString('zh-TW'); }
function today() { return fmtDate(new Date()); }
function getUserName(id) { const u = cachedUsers.find(u => u.id === id); return u ? u.name : '未知'; }
function getDeptName(id) { const d = cachedDepartments.find(d => d.id === id); return d ? d.name : '未知'; }
function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isManager() { return currentUser && (currentUser.role === 'manager' || currentUser.role === 'admin'); }
function getNowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

const UID_SHIFT_MAP = { 9:'afternoon', 10:'afternoon', 11:'night', 12:'night' };

const shiftTimes = {
  morning:   { start:'09:00', end:'18:00', startH:9, startM:0, endH:18, endM:0, label:'早班' },
  afternoon: { start:'14:00', end:'22:00', startH:14, startM:0, endH:22, endM:0, label:'中班' },
  night:     { start:'22:00', end:'06:00', startH:22, startM:0, endH:6, endM:0, label:'晚班' }
};

function getUserShift(userId, dateStr) {
  // Fallback client-side shift detection (schedules are handled server-side mostly)
  return UID_SHIFT_MAP[userId] || 'morning';
}

function shiftEnded(cfg, nowMin) {
  const endMin = cfg.endH * 60 + cfg.endM, startMin = cfg.startH * 60 + cfg.startM;
  return (endMin < startMin) ? (nowMin > endMin && nowMin < startMin) : (nowMin > endMin);
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

function modalFooter(submitLabel, submitFn) {
  return `<button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="${submitFn}">${submitLabel}</button>`;
}

function statusBadgeHtml(status, label) { return `<span class="badge badge-${status}">${label}</span>`; }

function approvalBadge(status) {
  const map = { pending: ['pending','待審核'], approved: ['success','已核准'], rejected: ['danger','已拒絕'] };
  const [cls, text] = map[status] || ['info', status];
  return statusBadgeHtml(cls, text);
}

// ============================================================
// AUTH
// ============================================================
async function doLogin() {
  try {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;

    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: user, password: pass })
    }).catch(err => {
      const errEl = document.getElementById('loginError');
      errEl.textContent = err.message || '帳號或密碼錯誤，請重新輸入';
      errEl.style.display = 'block';
      return null;
    });

    if (!data) return;

    token = data.token;
    currentUser = data.user;
    // 重設跨實例打卡快取 (admin 登入時後端會清空打卡, 前端快取也要跟著清)
    window.__latestMyRecord = null;
    try { sessionStorage.setItem('hr_token', token); sessionStorage.setItem('hr_user', JSON.stringify(currentUser)); } catch(e) {}

    document.getElementById('loginPage').style.display = 'none';
    const appEl = document.getElementById('app');
    appEl.style.display = 'flex';
    appEl.style.width = '100%';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role === 'admin' ? '系統管理員' : currentUser.role === 'manager' ? '部門主管' : '一般員工';
    document.getElementById('userAvatar').textContent = currentUser.name[0];
    if (currentUser.role !== 'admin') document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    else document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');

    startClock();
    navigate('clock');
  } catch(e) { console.error('Login error:', e); alert('登入發生錯誤: ' + e.message); }
}

async function doResetDemo() {
  if (!confirm('確定要把所有展示資料重置成初始狀態嗎？\n\n• 所有打卡紀錄將會被清掉並重新產生\n• 所有請假/加班申請會重置\n• 公告會回到 3 則預設公告\n\n此操作無法復原。')) return;
  try {
    toast('重置中，請稍候...', 'info');
    const data = await api('/admin/reset-demo', { method: 'POST', body: JSON.stringify({}) });
    if (!data) return;
    window.__latestMyRecord = null;
    toast(data.message || '已重置', 'success');
    // 重新載入頁面資料
    updateBadges();
    setTimeout(() => { navigate(currentPage || 'clock'); }, 300);
  } catch (e) {
    toast('重置失敗: ' + e.message, 'error');
  }
}

function doLogout() {
  try { sessionStorage.removeItem('hr_token'); sessionStorage.removeItem('hr_user'); } catch(e) {}
  token = null;
  currentUser = null;
  window.__latestMyRecord = null;
  document.getElementById('loginPage').style.display = '';
  document.getElementById('app').style.display = 'none';
  if (clockInterval) clearInterval(clockInterval);
}

function autoLogin() {
  try {
    const savedToken = sessionStorage.getItem('hr_token');
    const savedUser = sessionStorage.getItem('hr_user');
    if (savedToken && savedUser) {
      token = savedToken;
      currentUser = JSON.parse(savedUser);
      document.getElementById('loginPage').style.display = 'none';
      const appEl = document.getElementById('app');
      appEl.style.display = 'flex';
      appEl.style.width = '100%';
      document.getElementById('userName').textContent = currentUser.name;
      document.getElementById('userRole').textContent = currentUser.role === 'admin' ? '系統管理員' : currentUser.role === 'manager' ? '部門主管' : '一般員工';
      document.getElementById('userAvatar').textContent = currentUser.name[0];
      if (currentUser.role !== 'admin') document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      else document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
      startClock();
      navigate('clock');
    }
  } catch(e) { console.error('AutoLogin error:', e); }
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
  if (nav) { navigate(nav.dataset.page); document.getElementById('sidebar').classList.remove('open'); }
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
  if (count === 0) { el.className = ''; el.textContent = ''; }
  else if (count === 1) { el.className = 'nav-badge dot'; el.textContent = ''; }
  else { el.className = 'nav-badge'; el.textContent = count; }
}

async function updateBadges(overrideMyRecord) {
  if (!currentUser) return;
  try {
    const data = await api('/dashboard');
    if (!data) return;

    // Clock badge
    // 由於 serverless 跨實例可能導致 /dashboard 查到的 myRecord 與剛剛
    // 打卡寫入的那個實例不同步，允許呼叫端傳入剛拿到的 record 覆蓋。
    const myRecord = (overrideMyRecord !== undefined) ? overrideMyRecord : data.myRecord;

    const nowMin = getNowMin();
    const todayStr = today();
    const myShift = getUserShift(currentUser.id, todayStr);
    const myCfg = shiftTimes[myShift];
    const myStartMin = myCfg.startH * 60 + myCfg.startM;
    const myEndMin = myCfg.endH * 60 + myCfg.endM;
    const myCrosses = myEndMin < myStartMin;
    const myShiftDone = myCrosses ? (nowMin > myEndMin && nowMin < myStartMin) : (nowMin > myEndMin);
    let clockBadge = 0;
    if (!myRecord && nowMin >= myStartMin) {
      clockBadge = 1;
    } else if (myRecord && !myRecord.clockOut && myShiftDone) {
      const [ciH, ciM] = myRecord.clockIn.split(':').map(Number);
      const clockInMin = ciH * 60 + ciM;
      const clockedInBeforeEnd = myCrosses ? (clockInMin >= myStartMin || clockInMin <= myEndMin) : (clockInMin <= myEndMin);
      if (clockedInBeforeEnd) clockBadge = 1;
    }
    setBadge('badge-clock', clockBadge);
    setBadge('badge-leave', isManager() ? data.pendingLeaves : 0);
    setBadge('badge-overtime', isManager() ? data.pendingOT : 0);
    setBadge('badge-announcements', data.announcements ? data.announcements.filter(a => a.id > lastViewedAnnId).length : 0);
    setBadge('badge-records', 0);
    setBadge('badge-dashboard', 0);
    setBadge('badge-schedule', 0);
  } catch(e) { /* ignore badge errors */ }
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  const data = await api('/dashboard');
  if (!data) return;

  cachedUsers = data.users || cachedUsers;

  const myRecord = data.myRecord;
  const myStatus = myRecord ? (myRecord.clockOut ? '已下班 ✓' : '已打卡上班') : '尚未打卡';
  const myStatusClass = myRecord ? (myRecord.clockOut ? 'badge-success' : 'badge-info') : 'badge-warning';

  document.getElementById('pageContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon blue">👥</div><div class="stat-info"><div class="stat-value">${data.activeUsers}</div><div class="stat-label">在職員工</div></div></div>
      <div class="stat-card"><div class="stat-icon green">✅</div><div class="stat-info"><div class="stat-value">${data.clockedIn}</div><div class="stat-label">今日已打卡</div></div></div>
      <div class="stat-card"><div class="stat-icon yellow">⚠️</div><div class="stat-info"><div class="stat-value">${data.lateCount}</div><div class="stat-label">今日遲到</div></div></div>
      <div class="stat-card"><div class="stat-icon red">📝</div><div class="stat-info"><div class="stat-value">${data.pendingTotal}</div><div class="stat-label">待審核申請</div></div></div>
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
        ${data.announcements.slice(0,2).map(a => `
          <div style="margin-bottom:12px">
            <div style="font-size:13px;font-weight:600">${a.pinned ? '📌 ' : ''}${a.title}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${getUserName(a.authorId)} · ${a.createdAt.substring(0,10)}</div>
          </div>`).join('')}
        <button class="btn btn-ghost btn-sm" onclick="navigate('announcements')">查看全部</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><h3>本月出勤趨勢</h3></div>
      ${renderAttendanceChart(data.chartDays)}
    </div>`;
}

function renderAttendanceChart(days) {
  if (!days || !days.length) return '<div class="empty-state">暫無資料</div>';
  const max = Math.max(...days.map(d => d.count), 1);
  return `<div class="chart-bar">${days.map(d => `
    <div class="chart-col"><div class="chart-value">${d.count}</div><div class="chart-bar-fill" style="height:${(d.count/max)*160}px;background:var(--accent)"></div><div class="chart-label">${d.label}</div></div>`).join('')}</div>`;
}

// ============================================================
// CLOCK IN/OUT
// ============================================================
async function renderClock() {
  const data = await api(`/attendance?date=${today()}`);
  if (!data) return;

  cachedUsers = data.users || cachedUsers;
  let myRecord = data.records.find(a => a.userId === currentUser.id && a.clockIn);
  // 若前端剛剛打過卡，用本地快取蓋過可能不一致的 API 回傳
  // (serverless 跨實例可能讓 API 回的 record 還是舊的)
  if (window.__latestMyRecord && window.__latestMyRecord.date === today()) {
    myRecord = window.__latestMyRecord;
  }
  const hasClockedIn = !!(myRecord && myRecord.clockIn);
  const hasClockedOut = !!(myRecord && myRecord.clockOut);

  let statusHtml;
  if (!hasClockedIn) statusHtml = '<div class="clock-status"><span class="badge badge-warning">尚未打卡上班</span></div>';
  else if (!hasClockedOut) statusHtml = `<div class="clock-status"><span class="badge badge-info">已於 ${myRecord.clockIn} 打卡上班</span>${myRecord.status.includes('late') ? ` <span class="badge badge-danger">遲到 ${myRecord.lateMinutes} 分鐘</span>` : ''}</div>`;
  else statusHtml = `<div class="clock-status"><span class="badge badge-success">今日出勤完成 ${myRecord.clockIn} ~ ${myRecord.clockOut}</span></div>`;

  // Week records (Mon-Fri of current week)
  const weekRecords = await getWeekRecords();

  const disabledAttr = 'disabled style="opacity:.4;cursor:not-allowed"';
  document.getElementById('pageContent').innerHTML = `
    <div class="card"><div class="clock-section">
      <div class="live-clock" id="liveClock">00:00:00</div>
      <div class="live-date" id="liveDate"></div>
      <div class="clock-buttons">
        <button class="btn btn-success btn-clock" onclick="doClockIn()" ${hasClockedIn ? disabledAttr : ''}>☀️ 上班打卡</button>
        <button class="btn btn-primary btn-clock" onclick="doClockOut()" ${!hasClockedIn || hasClockedOut ? disabledAttr : ''}>🌙 下班打卡</button>
      </div>
      ${statusHtml}
    </div></div>
    <div class="card">
      <div class="card-header"><h3>本週打卡記錄</h3></div>
      <div class="table-wrap"><table>
        <thead><tr><th>日期</th><th>上班</th><th>下班</th><th>狀態</th></tr></thead>
        <tbody>${weekRecords.map(r => `<tr>
          <td>${r.date}</td>
          <td style="color:${r.lateMinutes?'var(--danger)':r.clockIn?'var(--success)':'var(--text-muted)'};font-weight:600">${r.clockIn || '--'}</td>
          <td style="color:${r.earlyLeaveMinutes?'var(--warning)':r.clockOut?'var(--success)':'var(--text-muted)'};font-weight:600">${r.clockOut || '--'}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

async function doClockIn() {
  try {
    const data = await api('/attendance/clockin', { method: 'POST', body: JSON.stringify({}) });
    if (!data) return;
    toast(data.message, data.isLate ? 'error' : 'success');
    // 把剛打卡成功的 record 快取到 renderClock 使用，避免被跨實例的舊資料蓋掉
    window.__latestMyRecord = data.record;
    renderClock();
    updateBadges(data.record);
  } catch(e) { toast(e.message, 'error'); }
}

async function doClockOut() {
  try {
    const data = await api('/attendance/clockout', { method: 'POST', body: JSON.stringify({}) });
    if (!data) return;
    toast(data.message, data.isEarly ? 'warning' : 'success');
    window.__latestMyRecord = data.record;
    renderClock();
    updateBadges(data.record);
  } catch(e) { toast(e.message, 'error'); }
}

async function getWeekRecords() {
  const now = new Date(), monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const records = [], todayStr = today();
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dateStr = fmtDate(d);
    if (dateStr > todayStr) break;
    const data = await api(`/attendance?date=${dateStr}`);
    if (data) {
      const rec = data.records.find(a => a.userId === currentUser.id && a.clockIn);
      records.push(rec || { date: dateStr, clockIn: null, clockOut: null, status: 'absent', lateMinutes: 0, earlyLeaveMinutes: 0 });
    } else {
      records.push({ date: dateStr, clockIn: null, clockOut: null, status: 'absent', lateMinutes: 0, earlyLeaveMinutes: 0 });
    }
  }
  return records;
}

function statusBadge(s) {
  const map = { normal:'badge-success:正常', late:'badge-danger:遲到', early:'badge-warning:早退', 'late+early':'badge-danger:遲到+早退', absent:'badge-danger:缺勤', future:'badge-info:--' };
  const entry = map[s];
  if (entry) { const [cls, text] = entry.split(':'); return statusBadgeHtml(cls, text); }
  return statusBadgeHtml('info', s);
}

// ============================================================
// RECORDS
// ============================================================
async function renderRecords() {
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
    </div>`;
  await filterRecords();
}

function getRecordShift(r) { return r.shift || getUserShift(r.userId, r.date); }

function isOvertimeNow(r) {
  if (r.clockOut || r.date !== today() || !r.clockIn) return false;
  return shiftEnded(shiftTimes[getRecordShift(r)], getNowMin());
}

function shiftStartedToday(r) {
  if (r.date !== today()) return true;
  const cfg = shiftTimes[getRecordShift(r)];
  const nowMin = getNowMin();
  const crossesMidnight = cfg.endH < cfg.startH;
  if (crossesMidnight && nowMin < cfg.endH * 60 + cfg.endM) return false;
  return nowMin >= cfg.startH * 60 + cfg.startM;
}

function isOvernightWorking(r, allRecords) {
  if (r.date !== today() || r.clockIn || r.clockOut) return false;
  const cfg = shiftTimes[getRecordShift(r)];
  if (cfg.endH >= cfg.startH) return false;
  const nowMin = getNowMin();
  if (nowMin >= cfg.endH * 60 + cfg.endM) return false;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yRec = allRecords ? allRecords.find(a => a.userId === r.userId && a.date === fmtDate(yesterday)) : null;
  return !!(yRec && yRec.clockIn);
}

function todayClockInLabel(r, allRecords) {
  if (r.clockIn) return r.clockIn;
  if (isOvernightWorking(r, allRecords)) {
    return '工作中~';
  }
  if (r.date !== today()) return '缺曠';
  return shiftStartedToday(r) ? '遲到中~' : '待上班';
}

function todayClockInColor(r, allRecords) {
  if (r.lateMinutes) return 'var(--danger)';
  if (r.clockIn || isOvernightWorking(r, allRecords)) return 'var(--success)';
  if (r.date !== today()) return 'var(--danger)';
  return shiftStartedToday(r) ? 'var(--danger)' : 'var(--text-muted)';
}

function todayClockOutLabel(r, allRecords) {
  if (r.clockOut) return r.clockOut;
  if (r.clockIn) return isOvertimeNow(r) ? '加班中~' : '工作中~';
  if (isOvernightWorking(r, allRecords)) return '工作中~';
  if (r.date !== today()) return '缺曠';
  return shiftStartedToday(r) ? '遲到中~' : '待上班';
}

function todayClockOutColor(r, allRecords) {
  if (r.earlyLeaveMinutes) return 'var(--warning)';
  if (r.clockOut) return 'var(--success)';
  if (r.clockIn) return isOvertimeNow(r) ? 'var(--warning)' : 'var(--accent)';
  if (isOvernightWorking(r, allRecords)) return 'var(--accent)';
  if (r.date !== today()) return 'var(--danger)';
  return shiftStartedToday(r) ? 'var(--danger)' : 'var(--text-muted)';
}

function todayStatusBadge(r, allRecords) {
  if (isOvernightWorking(r, allRecords)) return statusBadgeHtml('info', '工作中');
  if (r.date === today() && !r.clockIn && !shiftStartedToday(r)) return statusBadgeHtml('info', '待上班');
  return statusBadge(r.status);
}

function buildRecordRows(records, allRecords) {
  return records.map(r => `<tr>
    <td>${r.date}</td>
    ${isAdmin() ? `<td>${getUserName(r.userId)}</td>` : ''}
    <td style="color:${todayClockInColor(r, allRecords)};font-weight:600">${todayClockInLabel(r, allRecords)}</td>
    <td style="color:${todayClockOutColor(r, allRecords)};font-weight:600">${todayClockOutLabel(r, allRecords)}</td>
    <td>${todayStatusBadge(r, allRecords)}</td>
    <td style="color:${r.lateMinutes?'var(--danger)':'var(--success)'};font-weight:600">${r.lateMinutes || 0}</td>
    <td style="color:${r.earlyLeaveMinutes?'var(--warning)':'var(--success)'};font-weight:600">${r.earlyLeaveMinutes || 0}</td>
  </tr>`).join('');
}

function renderShiftSection(containerId, title, timeRange, color, records, allRecords) {
  const tableHeader = `<th>日期</th>${isAdmin() ? '<th>員工</th>' : ''}<th>上班</th><th>下班</th><th>狀態</th><th>遲到(分)</th><th>早退(分)</th>`;
  document.getElementById(containerId).innerHTML = `
    <div class="card-header">
      <h3><span style="color:${color}">● </span>${title} <span style="font-size:12px;color:var(--text-muted);font-weight:400">${timeRange}</span> <span style="font-size:12px;color:var(--text-muted);font-weight:400">(${records.length} 筆)</span></h3>
    </div>
    ${records.length ? `<div class="table-wrap"><table><thead><tr>${tableHeader}</tr></thead><tbody>${buildRecordRows(records, allRecords)}</tbody></table></div>` : '<div class="empty-state"><div class="icon">📭</div>此班別無出勤記錄</div>'}`;
}

async function filterRecords() { await renderRecordsForDate(today(), 'shiftMorning', 'shiftAfternoon', 'shiftNight'); }

async function renderRecordsForDate(dateStr, mId, aId, nId) {
  const data = await api(`/attendance?date=${dateStr}`);
  if (!data) return;

  cachedUsers = data.users || cachedUsers;
  cachedDepartments = data.departments || cachedDepartments;

  const records = data.records;
  records.sort((a, b) => a.userId - b.userId);

  renderShiftSection(mId, '早班', '09:00 - 18:00', '#60a5fa', records.filter(r => getRecordShift(r) === 'morning'), records);
  renderShiftSection(aId, '中班', '14:00 - 22:00', '#fbbf24', records.filter(r => getRecordShift(r) === 'afternoon'), records);
  renderShiftSection(nId, '晚班', '22:00 - 06:00', '#a78bfa', records.filter(r => getRecordShift(r) === 'night'), records);
}

function getYesterdayWorkday() {
  let d = new Date(); d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

async function toggleYesterday() {
  const section = document.getElementById('yesterdayRecords');
  const btn = document.getElementById('yesterdayBtn');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    btn.textContent = '📋 收起昨日出勤記錄';
    const yd = getYesterdayWorkday();
    document.getElementById('yesterdayTitle').textContent = '📋 昨日出勤 (' + yd + ')';
    await renderRecordsForDate(yd, 'yShiftMorning', 'yShiftAfternoon', 'yShiftNight');
  } else {
    section.style.display = 'none';
    btn.textContent = '📋 查看昨日出勤記錄';
  }
}

async function loadHistoryRecords() {
  const dateStr = document.getElementById('historyDate').value;
  if (!dateStr) { toast('請選擇日期', 'error'); return; }
  document.getElementById('historyRecords').style.display = 'block';
  document.getElementById('historyTitle').textContent = '📆 ' + dateStr + ' 出勤記錄';
  await renderRecordsForDate(dateStr, 'hShiftMorning', 'hShiftAfternoon', 'hShiftNight');
  toast('已載入 ' + dateStr + ' 出勤記錄');
}

// ============================================================
// LEAVE
// ============================================================
async function renderLeave() {
  const [leaveData, balData] = await Promise.all([
    api('/leaves'),
    api('/leave-balances')
  ]);
  if (!leaveData || !balData) return;

  cachedUsers = leaveData.users || cachedUsers;
  const myBalances = balData.balances;
  const showAll = leaveData.isManager;
  const leaves = leaveData.leaves;

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>我的假期餘額</h3><button class="btn btn-primary btn-sm" onclick="showLeaveForm()">＋ 申請請假</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        ${myBalances.map(b => `
          <div style="padding:12px;background:var(--bg-secondary);border-radius:var(--radius);text-align:center">
            <div style="font-size:12px;color:var(--text-muted)">${b.leaveType}</div>
            <div style="font-size:22px;font-weight:700;margin:4px 0">${b.totalDays - b.usedDays}</div>
            <div style="font-size:11px;color:var(--text-muted)">剩餘 / 共${b.totalDays}天</div>
          </div>`).join('')}
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
        <tbody id="leaveTableBody">${leaves.map(l => leaveRow(l, showAll)).join('')}</tbody>
      </table></div>
    </div>`;
}

function leaveRow(l, showAll) {
  return `<tr data-status="${l.status}">
    ${showAll ? `<td>${getUserName(l.userId)}</td>` : ''}
    <td>${l.type}</td><td>${l.startDate}</td><td>${l.endDate}</td><td>${l.reason}</td>
    <td>${approvalBadge(l.status)}</td>
    ${showAll && l.status === 'pending' ? `<td>
      <button class="btn btn-success btn-sm" onclick="handleLeave(${l.id},'approved')">核准</button>
      <button class="btn btn-danger btn-sm" onclick="handleLeave(${l.id},'rejected')">拒絕</button>
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
  `, modalFooter('送出申請', 'submitLeave()'));
}

async function submitLeave() {
  const type = document.getElementById('leaveType').value;
  const startDate = document.getElementById('leaveStart').value;
  const endDate = document.getElementById('leaveEnd').value;
  const reason = document.getElementById('leaveReason').value.trim();
  if (!startDate || !endDate || !reason) { toast('請填寫完整資訊','error'); return; }
  if (endDate < startDate) { toast('結束日期不可早於開始日期','error'); return; }
  try {
    await api('/leaves', { method: 'POST', body: JSON.stringify({ type, startDate, endDate, reason }) });
    closeModal(); toast('請假申請已送出'); renderLeave();
  } catch(e) { toast(e.message, 'error'); }
}

async function handleLeave(id, newStatus) {
  try {
    const data = await api(`/leaves/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    if (!data) return;
    toast(data.message, newStatus === 'approved' ? 'success' : 'error');
    renderLeave(); updateBadges();
  } catch(e) { toast(e.message, 'error'); }
}

// ============================================================
// OVERTIME
// ============================================================
async function renderOvertime() {
  const data = await api('/overtime');
  if (!data) return;

  cachedUsers = data.users || cachedUsers;
  const showAll = data.isManager;
  const ots = data.overtime;

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${showAll ? '加班申請管理' : '我的加班記錄'}</h3><button class="btn btn-primary btn-sm" onclick="showOvertimeForm()">＋ 申請加班</button></div>
      <div class="table-wrap"><table>
        <thead><tr>${showAll?'<th>申請人</th>':''}<th>日期</th><th>時數</th><th>原因</th><th>狀態</th>${showAll?'<th>操作</th>':''}</tr></thead>
        <tbody>${ots.map(o => `<tr>
          ${showAll?`<td>${getUserName(o.userId)}</td>`:''}
          <td>${o.date}</td><td>${o.hours} 小時</td><td>${o.reason}</td>
          <td>${approvalBadge(o.status)}</td>
          ${showAll && o.status==='pending' ? `<td>
            <button class="btn btn-success btn-sm" onclick="handleOT(${o.id},'approved')">核准</button>
            <button class="btn btn-danger btn-sm" onclick="handleOT(${o.id},'rejected')">拒絕</button>
          </td>` : showAll ? '<td>--</td>' : ''}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

function showOvertimeForm() {
  showModal('申請加班', `
    <div class="form-row">
      <div class="form-group"><label>加班日期</label><input type="date" class="form-control" id="otDate" value="${today()}"></div>
      <div class="form-group"><label>加班時數</label><input type="number" class="form-control" id="otHours" min="0.5" max="8" step="0.5" value="1"></div>
    </div>
    <div class="form-group"><label>加班原因</label><textarea class="form-control" id="otReason" placeholder="請輸入加班原因"></textarea></div>
  `, modalFooter('送出申請', 'submitOT()'));
}

async function submitOT() {
  const date = document.getElementById('otDate').value;
  const hours = parseFloat(document.getElementById('otHours').value);
  const reason = document.getElementById('otReason').value.trim();
  if (!date || !hours || !reason) { toast('請填寫完整資訊','error'); return; }
  try {
    await api('/overtime', { method: 'POST', body: JSON.stringify({ date, hours, reason }) });
    closeModal(); toast('加班申請已送出'); renderOvertime();
  } catch(e) { toast(e.message, 'error'); }
}

async function handleOT(id, newStatus) {
  try {
    const data = await api(`/overtime/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    if (!data) return;
    toast(data.message, newStatus === 'approved' ? 'success' : 'error');
    renderOvertime(); updateBadges();
  } catch(e) { toast(e.message, 'error'); }
}

// ============================================================
// SCHEDULE
// ============================================================
async function renderSchedule() {
  const data = await api('/schedules');
  if (!data) return;

  cachedUsers = data.users || cachedUsers;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const weekDays = [];
  for (let i = 0; i < 7; i++) { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); weekDays.push(d); }

  const schedules = data.schedules;
  const activeUsers = data.users;
  const shiftLabels = { morning:'早班<br><small style="opacity:.7">08:00-16:00</small>', afternoon:'中班<br><small style="opacity:.7">14:00-22:00</small>', night:'晚班<br><small style="opacity:.7">22:00-06:00</small>', off:'休假' };
  const shiftCls = { morning:'shift-morning', afternoon:'shift-afternoon', night:'shift-night', off:'shift-off' };

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
            const s = schedules.find(s => s.userId === u.id && s.date === dateStr);
            const shift = s ? s.shiftType : ((d.getDay() === 0 || d.getDay() === 6) ? 'off' : 'morning');
            return `<td><span class="shift ${shiftCls[shift]}">${shiftLabels[shift]}</span></td>`;
          }).join('')}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

async function showScheduleForm() {
  const data = await api('/employees');
  if (!data) return;
  const activeUsers = data.users.filter(u => u.status === 'active');
  showModal('新增排班', `
    <div class="form-group"><label>員工</label><select class="form-control" id="schedUser">${activeUsers.map(u=>`<option value="${u.id}">${u.name}</option>`).join('')}</select></div>
    <div class="form-group"><label>日期</label><input type="date" class="form-control" id="schedDate" value="${today()}"></div>
    <div class="form-group"><label>班別</label><select class="form-control" id="schedShift">
      <option value="morning">早班 (08:00-16:00)</option>
      <option value="afternoon">中班 (14:00-22:00)</option>
      <option value="night">晚班 (22:00-06:00)</option>
      <option value="off">休假</option>
    </select></div>
  `, modalFooter('儲存', 'submitSchedule()'));
}

async function submitSchedule() {
  const userId = parseInt(document.getElementById('schedUser').value);
  const date = document.getElementById('schedDate').value;
  const shiftType = document.getElementById('schedShift').value;
  try {
    await api('/schedules', { method: 'POST', body: JSON.stringify({ userId, date, shiftType }) });
    closeModal(); toast('排班已更新'); renderSchedule();
  } catch(e) { toast(e.message, 'error'); }
}

// ============================================================
// ANNOUNCEMENTS
// ============================================================
async function renderAnnouncements() {
  const data = await api('/announcements');
  if (!data) return;

  cachedUsers = data.users || cachedUsers;
  const prevViewedId = lastViewedAnnId;
  const sorted = data.announcements;

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
        </div>`).join('')}
    </div>`;
  lastViewedAnnId = sorted.reduce((m, a) => Math.max(m, a.id), 0);
  updateBadges();
}

function showAnnouncementForm() {
  showModal('發布公告', `
    <div class="form-group"><label>標題</label><input type="text" class="form-control" id="annTitle" placeholder="公告標題"></div>
    <div class="form-group"><label>內容</label><textarea class="form-control" id="annContent" rows="5" placeholder="公告內容"></textarea></div>
    <div class="form-group"><label><input type="checkbox" id="annPinned"> 置頂公告</label></div>
  `, modalFooter('發布', 'submitAnnouncement()'));
}

async function submitAnnouncement() {
  const title = document.getElementById('annTitle').value.trim();
  const content = document.getElementById('annContent').value.trim();
  const pinned = document.getElementById('annPinned').checked;
  if (!title || !content) { toast('請填寫完整資訊','error'); return; }
  try {
    await api('/announcements', { method: 'POST', body: JSON.stringify({ title, content, pinned }) });
    closeModal(); toast('公告已發布'); renderAnnouncements();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteAnnouncement(id) {
  try {
    await api(`/announcements/${id}`, { method: 'DELETE' });
    toast('公告已刪除'); renderAnnouncements();
  } catch(e) { toast(e.message, 'error'); }
}

// ============================================================
// EMPLOYEES
// ============================================================
async function renderEmployees() {
  const data = await api('/employees');
  if (!data) return;

  cachedUsers = data.users;
  cachedDepartments = data.departments;

  const users = data.users;
  const roleLabel = r => r === 'admin' ? '管理員' : r === 'manager' ? '主管' : '員工';
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
          <td>${roleLabel(u.role)}</td>
          <td>${u.email}</td>
          <td>${u.hireDate}</td>
          <td>${statusBadgeHtml(u.status==='active'?'success':'danger', u.status==='active'?'在職':'停用')}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="editEmployee(${u.id})">編輯</button>
            ${u.role !== 'admin' ? `<button class="btn btn-sm ${u.status==='active'?'btn-danger':'btn-success'}" onclick="toggleEmployee(${u.id})">${u.status==='active'?'停用':'啟用'}</button>` : ''}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

// Store last fetched employees data for modal
var _lastEmployeesData = null;

async function showEmployeeForm(user) {
  if (!_lastEmployeesData) {
    _lastEmployeesData = await api('/employees');
  }
  const data = _lastEmployeesData;
  if (!data) return;

  const isEdit = !!user;
  const depts = data.departments;
  const nextId = data.nextId;
  const sel = (val, match) => isEdit && val === match ? 'selected' : '';
  showModal(isEdit ? '編輯員工' : '新增員工', `
    <div class="form-row">
      <div class="form-group"><label>員工編號</label><input type="text" class="form-control" id="empId" value="${isEdit?user.employeeId:('A'+String(nextId).padStart(3,'0'))}" ${isEdit?'readonly':''}></div>
      <div class="form-group"><label>姓名</label><input type="text" class="form-control" id="empName" value="${isEdit?user.name:''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" class="form-control" id="empEmail" value="${isEdit?user.email:''}"></div>
      <div class="form-group"><label>密碼</label><input type="text" class="form-control" id="empPass" value="${isEdit?'':'123456'}" placeholder="預設 123456"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>部門</label><select class="form-control" id="empDept">${depts.map(d=>`<option value="${d.id}" ${sel(user&&user.departmentId,d.id)}>${d.name}</option>`).join('')}</select></div>
      <div class="form-group"><label>角色</label><select class="form-control" id="empRole">
        <option value="employee" ${sel(user&&user.role,'employee')}>一般員工</option>
        <option value="manager" ${sel(user&&user.role,'manager')}>部門主管</option>
        <option value="admin" ${sel(user&&user.role,'admin')}>系統管理員</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>月薪</label><input type="number" class="form-control" id="empSalary" value="${isEdit?user.salary:40000}"></div>
      <div class="form-group"><label>到職日</label><input type="date" class="form-control" id="empHire" value="${isEdit?user.hireDate:today()}"></div>
    </div>
  `, modalFooter(isEdit?'更新':'新增', `submitEmployee(${isEdit?user.id:'null'})`));
}

async function submitEmployee(editId) {
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

  try {
    if (editId) {
      await api(`/employees/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
      toast('員工資料已更新');
    } else {
      await api('/employees', { method: 'POST', body: JSON.stringify(data) });
      toast('員工已新增');
    }
    _lastEmployeesData = null;
    closeModal(); renderEmployees();
  } catch(e) { toast(e.message, 'error'); }
}

async function editEmployee(id) {
  const data = await api('/employees');
  if (!data) return;
  _lastEmployeesData = data;
  const user = data.users.find(u => u.id === id);
  if (user) showEmployeeForm(user);
}

async function toggleEmployee(id) {
  const data = await api('/employees');
  if (!data) return;
  const user = data.users.find(u => u.id === id);
  if (!user) return;
  const newStatus = user.status === 'active' ? 'inactive' : 'active';
  try {
    const result = await api(`/employees/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    toast(result.message);
    _lastEmployeesData = null;
    renderEmployees();
  } catch(e) { toast(e.message, 'error'); }
}

// ============================================================
// DEPARTMENTS
// ============================================================
async function renderDepartments() {
  const data = await api('/departments');
  if (!data) return;

  cachedUsers = data.users || cachedUsers;
  cachedDepartments = data.departments;

  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>部門管理</h3><button class="btn btn-primary btn-sm" onclick="showDeptForm()">＋ 新增部門</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>部門名稱</th><th>主管</th><th>人數</th><th>操作</th></tr></thead>
        <tbody>${data.departments.map(d => `<tr>
          <td style="font-weight:600">${d.name}</td>
          <td>${getUserName(d.managerId)}</td>
          <td>${d.memberCount} 人</td>
          <td><button class="btn btn-ghost btn-sm" onclick="editDept(${d.id})">編輯</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

var _lastDeptData = null;

async function showDeptForm(dept) {
  if (!_lastDeptData) {
    _lastDeptData = await api('/departments');
  }
  const data = _lastDeptData;
  if (!data) return;

  const isEdit = !!dept;
  const managers = data.users;
  showModal(isEdit ? '編輯部門' : '新增部門', `
    <div class="form-group"><label>部門名稱</label><input type="text" class="form-control" id="deptName" value="${isEdit?dept.name:''}"></div>
    <div class="form-group"><label>部門主管</label><select class="form-control" id="deptMgr">
      <option value="">-- 選擇主管 --</option>
      ${managers.map(m=>`<option value="${m.id}" ${isEdit&&dept.managerId===m.id?'selected':''}>${m.name} (${m.employeeId})</option>`).join('')}
    </select></div>
  `, modalFooter(isEdit?'更新':'新增', `submitDept(${isEdit?dept.id:'null'})`));
}

async function submitDept(editId) {
  const name = document.getElementById('deptName').value.trim();
  const managerId = parseInt(document.getElementById('deptMgr').value) || null;
  if (!name) { toast('請輸入部門名稱','error'); return; }
  try {
    if (editId) {
      await api(`/departments/${editId}`, { method: 'PUT', body: JSON.stringify({ name, managerId }) });
    } else {
      await api('/departments', { method: 'POST', body: JSON.stringify({ name, managerId }) });
    }
    _lastDeptData = null;
    closeModal(); toast('部門已更新'); renderDepartments();
  } catch(e) { toast(e.message, 'error'); }
}

async function editDept(id) {
  const data = await api('/departments');
  if (!data) return;
  _lastDeptData = data;
  const dept = data.departments.find(d => d.id === id);
  if (dept) showDeptForm(dept);
}

// ============================================================
// SALARY
// ============================================================
async function renderSalary() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;
  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>薪資報表</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="month" class="form-control" id="salaryMonth" value="${monthStr}" onchange="calcSalary()">
          <button class="btn btn-primary btn-sm" onclick="calcSalary()">計算</button>
        </div>
      </div>
      <div id="salaryTable"><div class="empty-state">載入中...</div></div>
    </div>`;
  await calcSalary();
}

async function calcSalary() {
  const monthStr = document.getElementById('salaryMonth').value;
  const data = await api(`/salary?month=${monthStr}`);
  if (!data) return;

  const rows = data.rows;
  const overtimeRate = data.overtimeRate;

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
    <p style="margin-top:12px;font-size:11px;color:var(--text-muted)">* 遲到/早退每滿30分鐘扣時薪50%，曠職扣全日薪，加班費率 ${overtimeRate}x</p>`;
}

// ============================================================
// REPORTS
// ============================================================
async function renderReports() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;
  document.getElementById('pageContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3>統計報表</h3>
        <input type="month" class="form-control" id="reportMonth" value="${monthStr}" onchange="updateReports()">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card" id="deptReport"><div class="empty-state">載入中...</div></div>
      <div class="card" id="statusReport"><div class="empty-state">載入中...</div></div>
    </div>
    <div class="card" id="rankReport" style="margin-top:16px"><div class="empty-state">載入中...</div></div>`;
  await updateReports();
}

function progressBar(label, count, total, color) {
  const pct = Math.round(count / total * 100);
  return `<div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${label}</span><span>${count} 次 (${pct}%)</span></div>
    <div style="height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden"><div style="height:100%;width:${count/total*100}%;background:var(--${color});border-radius:4px"></div></div>
  </div>`;
}

async function updateReports() {
  const monthStr = document.getElementById('reportMonth').value;
  const data = await api(`/reports?month=${monthStr}`);
  if (!data) return;

  // Dept stats
  document.getElementById('deptReport').innerHTML = `
    <div class="card-header"><h3>部門出勤統計</h3></div>
    <table>
      <thead><tr><th>部門</th><th>人數</th><th>打卡次數</th><th>遲到次數</th><th>出勤率</th></tr></thead>
      <tbody>${data.deptStats.map(d => {
        const rate = d.total > 0 ? Math.round((d.records / (d.total * 22)) * 100) : 0;
        return `<tr><td style="font-weight:600">${d.name}</td><td>${d.total}</td><td>${d.records}</td><td style="color:var(--danger)">${d.late}</td><td>${statusBadgeHtml(rate>=90?'success':rate>=70?'warning':'danger', rate+'%')}</td></tr>`;
      }).join('')}</tbody>
    </table>`;

  // Status distribution
  const sd = data.statusDist;
  document.getElementById('statusReport').innerHTML = `
    <div class="card-header"><h3>出勤狀態分佈</h3></div>
    <div style="padding:20px">
      ${progressBar('正常', sd.normal, sd.total, 'success')}
      ${progressBar('遲到', sd.late, sd.total, 'danger')}
      ${progressBar('早退', sd.early, sd.total, 'warning')}
    </div>`;

  // Employee ranking
  document.getElementById('rankReport').innerHTML = `
    <div class="card-header"><h3>員工出勤排名</h3></div>
    <table>
      <thead><tr><th>排名</th><th>員工</th><th>部門</th><th>出勤天數</th><th>準時天數</th><th>遲到天數</th></tr></thead>
      <tbody>${data.userStats.map((u,i) => `<tr>
        <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
        <td style="font-weight:600">${u.name}</td>
        <td>${u.dept}</td>
        <td>${u.total}</td>
        <td style="color:var(--success)">${u.onTime}</td>
        <td style="color:var(--danger)">${u.late}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

// ============================================================
// INIT
// ============================================================
document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
autoLogin();
