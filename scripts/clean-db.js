// 一次性：清洗本機 hr_system.db，把 admin 的打卡紀錄、所有請假
// 所有加班資料清掉，讓部署上去的 DB 初始狀態是乾淨的。
// 執行：node scripts/clean-db.js
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

(async () => {
  const DB_PATH = path.join(__dirname, '..', 'hr_system.db');
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  function count(sql) {
    const stmt = db.prepare(sql);
    stmt.step();
    const n = stmt.getAsObject().c;
    stmt.free();
    return n;
  }

  console.log('Before:');
  console.log('  admin attendance :', count('SELECT COUNT(*) as c FROM attendance WHERE user_id = 1'));
  console.log('  leaves           :', count('SELECT COUNT(*) as c FROM leaves'));
  console.log('  overtime         :', count('SELECT COUNT(*) as c FROM overtime'));

  db.run('DELETE FROM attendance WHERE user_id = 1');
  db.run('DELETE FROM leaves');
  db.run('DELETE FROM overtime');

  console.log('After:');
  console.log('  admin attendance :', count('SELECT COUNT(*) as c FROM attendance WHERE user_id = 1'));
  console.log('  leaves           :', count('SELECT COUNT(*) as c FROM leaves'));
  console.log('  overtime         :', count('SELECT COUNT(*) as c FROM overtime'));

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('hr_system.db cleaned.');
})();
