// 展示資料產生器 - 供 server.js 路由和 scripts/reseed-turso.js 共用
// 傳入一個具有 execute(sql, args) 或相容介面的 client 就能執行

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

const UID_SHIFT_MAP = { 9:'afternoon', 10:'afternoon', 11:'night', 12:'night' };

const DEFAULT_PUNCH = {
  morning:   { clockIn: '08:55', clockOut: '18:05', startH: 9,  endH: 18 },
  afternoon: { clockIn: '13:55', clockOut: '22:05', startH: 14, endH: 22 },
  night:     { clockIn: '21:55', clockOut: '06:05', startH: 22, endH: 6  },
};

// 歷史異常：刻意放遲到/早退讓統計圖表有變化
const HISTORICAL_ANOMALIES = [
  { d:  1, uid: 3,  kind: 'late',       lateMins: 15, earlyMins: 0  },
  { d:  1, uid: 7,  kind: 'early',      lateMins: 0,  earlyMins: 25 },
  { d:  2, uid: 5,  kind: 'late',       lateMins: 20, earlyMins: 0  },
  { d:  3, uid: 10, kind: 'early',      lateMins: 0,  earlyMins: 18 },
  { d:  4, uid: 4,  kind: 'late+early', lateMins: 10, earlyMins: 15 },
  { d:  5, uid: 8,  kind: 'late',       lateMins: 8,  earlyMins: 0  },
  { d:  7, uid: 6,  kind: 'early',      lateMins: 0,  earlyMins: 22 },
  { d:  8, uid: 12, kind: 'late',       lateMins: 12, earlyMins: 0  },
  { d: 10, uid: 3,  kind: 'early',      lateMins: 0,  earlyMins: 30 },
  { d: 12, uid: 9,  kind: 'late',       lateMins: 18, earlyMins: 0  },
  { d: 14, uid: 11, kind: 'late+early', lateMins: 15, earlyMins: 20 },
  { d: 17, uid: 5,  kind: 'late',       lateMins: 7,  earlyMins: 0  },
  { d: 20, uid: 2,  kind: 'early',      lateMins: 0,  earlyMins: 25 },
];

function makeHistoricalRecord(uid, dateStr, anomaly) {
  const shift = UID_SHIFT_MAP[uid] || 'morning';
  const cfg = DEFAULT_PUNCH[shift];
  let clockIn = cfg.clockIn, clockOut = cfg.clockOut;
  let status = 'normal';
  let lateMins = 0, earlyMins = 0;

  if (anomaly) {
    if (anomaly.kind === 'late' || anomaly.kind === 'late+early') {
      const [h, m] = cfg.clockIn.split(':').map(Number);
      const t = h * 60 + m + anomaly.lateMins;
      clockIn = `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
      lateMins = anomaly.lateMins;
    }
    if (anomaly.kind === 'early' || anomaly.kind === 'late+early') {
      const [h, m] = cfg.clockOut.split(':').map(Number);
      const t = h * 60 + m - anomaly.earlyMins;
      clockOut = `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
      earlyMins = anomaly.earlyMins;
    }
    status = anomaly.kind;
  }

  return { uid, dateStr, shift, clockIn, clockOut, status, lateMins, earlyMins };
}

// 根據「現在時間」決定今日的 attendance 長什麼樣
// 考慮 now 避免部署時間不一致:
//   - 早班 (09-18): now < 08:55 → 還沒上班 (不寫); 08:55~18:05 → 上班中 (clockOut=null); > 18:05 → 完整打卡
//   - 類似中班、夜班
function buildTodayRecords(now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 基礎樣板 (後面會依現在時間決定是否 clockOut)
  const templates = [
    // morning (uid 2-8)
    { uid: 2,  shift: 'morning',   status: 'normal',     lateMins: 0,  earlyMins: 0  },
    { uid: 3,  shift: 'morning',   status: 'late',       lateMins: 12, earlyMins: 0  },
    { uid: 4,  shift: 'morning',   status: 'early',      lateMins: 0,  earlyMins: 35 },
    { uid: 5,  shift: 'morning',   status: 'normal',     lateMins: 0,  earlyMins: 0, forceNoClockOut: true },
    { uid: 6,  shift: 'morning',   status: 'late+early', lateMins: 8,  earlyMins: 20 },
    { uid: 7,  shift: 'morning',   status: 'normal',     lateMins: 0,  earlyMins: 0  },
    { uid: 8,  shift: 'morning',   status: 'normal',     lateMins: 0,  earlyMins: 0, forceNoClockOut: true },
    // afternoon (uid 9-10)
    { uid: 9,  shift: 'afternoon', status: 'normal',     lateMins: 0,  earlyMins: 0  },
    { uid: 10, shift: 'afternoon', status: 'late',       lateMins: 12, earlyMins: 0  },
    // night (uid 11-12)
    { uid: 11, shift: 'night',     status: 'normal',     lateMins: 0,  earlyMins: 0  },
    { uid: 12, shift: 'night',     status: 'late',       lateMins: 8,  earlyMins: 0  },
  ];

  const records = [];
  for (const t of templates) {
    const cfg = DEFAULT_PUNCH[t.shift];
    const [ciH, ciM] = cfg.clockIn.split(':').map(Number);
    const baseIn = ciH * 60 + ciM;
    const actualIn = baseIn + t.lateMins; // 遲到的實際上班時間

    // 如果現在還沒到該員工的上班時間 → 不寫 record (UI 顯示「待上班」)
    if (t.shift !== 'night') {
      // 日/中班: nowMin 必須 >= actualIn
      if (nowMin < actualIn) continue;
    } else {
      // 夜班: actualIn 是 21:55 或 22:03 之類, 凌晨 < endH(6) 就當已過期 → 今天不寫
      if (nowMin < actualIn && nowMin > cfg.endH * 60 + 5) continue;
    }

    // 決定 clockIn 字串
    const clockIn = `${pad2(Math.floor(actualIn / 60))}:${pad2(actualIn % 60)}`;

    // 決定 clockOut
    let clockOut = null;
    const [coH, coM] = cfg.clockOut.split(':').map(Number);
    const baseOut = coH * 60 + coM;
    const actualOut = baseOut - t.earlyMins;

    if (t.forceNoClockOut) {
      // 刻意製造「加班中」(shift 已結束但還沒 clockOut)
      clockOut = null;
    } else if (t.shift !== 'night') {
      // 只有 nowMin 超過 actualOut 才寫 clockOut
      if (nowMin >= actualOut) {
        clockOut = `${pad2(Math.floor(actualOut / 60))}:${pad2(actualOut % 60)}`;
      }
    } else {
      // 夜班永遠不寫 clockOut (跨到明天)
      clockOut = null;
    }

    records.push({
      uid: t.uid,
      shift: t.shift,
      clockIn,
      clockOut,
      status: t.status,
      lateMins: t.lateMins,
      earlyMins: t.earlyMins,
    });
  }

  return records;
}

/**
 * 清空並重灌展示資料
 * @param {object} db - 具有 execute({sql,args}) 的 libsql client
 *                      或具有 dbRun(sql, args) 的 server.js helper 包裝
 */
async function reseedDemoData(db) {
  // 支援兩種呼叫介面：libsql client 的 execute / 或 {dbRun} 物件
  const run = db.execute
    ? (sql, args) => db.execute({ sql, args })
    : (sql, args) => db.dbRun(sql, args);

  // ========== 清空 ==========
  await run('DELETE FROM attendance', []);
  await run('DELETE FROM leaves', []);
  await run('DELETE FROM overtime', []);
  await run('DELETE FROM announcements', []);
  try { await run("DELETE FROM meta WHERE key = 'lastAttendanceDate'", []); } catch(e) {}

  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const today = fmtDate(now);

  // ========== attendance: 過去 29 天 ==========
  for (let d = 29; d >= 1; d--) {
    const date = new Date(year, month, now.getDate() - d);
    const dateStr = fmtDate(date);

    for (let uid = 2; uid <= 12; uid++) {
      const anomaly = HISTORICAL_ANOMALIES.find(a => a.d === d && a.uid === uid);
      const r = makeHistoricalRecord(uid, dateStr, anomaly);
      await run(
        'INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [r.uid, r.dateStr, r.clockIn, r.clockOut, r.status, r.lateMins, r.earlyMins, r.shift]
      );
    }
  }

  // ========== attendance: 今天 ==========
  for (const r of buildTodayRecords(now)) {
    await run(
      'INSERT INTO attendance (user_id, date, clock_in, clock_out, status, late_minutes, early_leave_minutes, shift) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [r.uid, today, r.clockIn, r.clockOut, r.status, r.lateMins, r.earlyMins, r.shift]
    );
  }

  // ========== leaves ==========
  const leaves = [
    [3, '特休', `${year}-03-25`, `${year}-03-26`, '家庭旅遊', 'approved', 2,    `${year}-03-20`],
    [5, '病假', `${year}-03-28`, `${year}-03-28`, '感冒發燒', 'approved', 4,    `${year}-03-27`],
    [8, '事假', `${year}-04-05`, `${year}-04-05`, '個人事務', 'rejected', 1,    `${year}-04-01`],
    [6, '特休', `${year}-04-12`, `${year}-04-14`, '家庭旅遊', 'pending',  null, `${year}-04-04`],
    [4, '病假', `${year}-04-10`, `${year}-04-10`, '身體不適', 'pending',  null, `${year}-04-05`],
  ];
  for (const l of leaves) {
    await run(
      'INSERT INTO leaves (user_id, type, start_date, end_date, reason, status, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      l
    );
  }

  // ========== overtime ==========
  const overtimes = [
    [3, `${year}-03-20`, 2,   '專案趕工',     'approved', 2],
    [5, `${year}-03-22`, 3,   '客戶需求緊急', 'approved', 4],
    [6, `${year}-04-01`, 1.5, '月報整理',     'pending',  null],
    [2, `${year}-04-03`, 2,   '緊急會議',     'pending',  null],
  ];
  for (const o of overtimes) {
    await run(
      'INSERT INTO overtime (user_id, date, hours, reason, status, approved_by) VALUES (?, ?, ?, ?, ?, ?)',
      o
    );
  }

  // ========== announcements ==========
  const anns = [
    ['四月份員工旅遊通知', '本月 25 日（星期六）將舉辦公司員工旅遊，地點為日月潭。請各部門於 4/10 前回報參加人數。交通統一安排遊覽車，費用由公司全額補助。', 1, `${year}-04-01T09:00:00`, 1],
    ['系統維護公告',      '本週六晚間 22:00 至隔日 06:00 將進行系統維護，期間打卡系統暫停服務。請同仁提前完成打卡作業。',               1, `${year}-03-28T14:30:00`, 0],
    ['新進員工歡迎會',    '歡迎三月份加入的新同仁！本週五下午 3 點將於 B1 會議室舉辦歡迎茶會，邀請各位同仁踴躍參加。',                 6, `${year}-03-26T10:00:00`, 0],
  ];
  for (const a of anns) {
    await run(
      'INSERT INTO announcements (title, content, author_id, created_at, pinned) VALUES (?, ?, ?, ?, ?)',
      a
    );
  }
}

module.exports = { reseedDemoData };
