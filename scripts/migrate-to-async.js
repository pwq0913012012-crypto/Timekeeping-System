// 一次性遷移腳本：把 server.js 從 sql.js (同步) 改成 libsql (非同步)
// 1. 所有 dbRun / dbGet / dbAll 呼叫加上 await
// 2. 所有 Express 路由 handler 加上 async
// 3. 特定 helper function 加上 async
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'server.js');
let src = fs.readFileSync(file, 'utf8');

// ---- 1. 替換 db 呼叫加 await (但已經有 await 的不要重複加) ----
// 排除已經是 `await dbXxx(` 的情況
src = src.replace(/(?<!await\s)(?<![A-Za-z_$])db(Run|Get|All)\(/g, 'await db$1(');

// ---- 2. Express 路由加 async ----
// app.METHOD('path', (req, res) => { ... }
src = src.replace(/app\.(get|post|put|delete|use)\(('[^']+',\s*)\(req, res(, next)?\)\s*=>/g,
  "app.$1($2async (req, res$3) =>");

// 單參數 app.use((req, res, next) => ...)
src = src.replace(/app\.use\(\(req, res, next\)\s*=>/g, "app.use(async (req, res, next) =>");

// ---- 3. 把含 db 呼叫的 helper function 改成 async ----
const helpersToAsync = [
  'getUserShift',
  'createTables',
  'seedDatabase',
  'generateSampleAttendance',
  'generateDefaultSchedules',
  'generateLeaveBalances',
  'ensureTodayAttendance',
  'resetDemoState',
];
for (const fn of helpersToAsync) {
  const re = new RegExp(`(^|\\n)function ${fn}\\(`, 'g');
  src = src.replace(re, `$1async function ${fn}(`);
}

// 對應呼叫加 await
for (const fn of helpersToAsync) {
  // 注意：不能加到 function 定義的 `function fn(` 上
  // 只針對呼叫點 `fn(`，且前面不是 'function '
  const re = new RegExp(`(?<!function )(?<!async function )(?<![A-Za-z_$])${fn}\\(`, 'g');
  src = src.replace(re, `await ${fn}(`);
}

// resetDemoState 在 login 路由裡有條件呼叫，已在上面加 await
// ensureTodayAttendance(user.id) 也應該有 await

fs.writeFileSync(file, src);
console.log('Migration applied.');
console.log('dbAll/dbGet/dbRun call sites:',
  (src.match(/await db(Run|Get|All)\(/g) || []).length);
console.log('async routes:',
  (src.match(/app\.\w+\([^)]*async \(req, res/g) || []).length);
