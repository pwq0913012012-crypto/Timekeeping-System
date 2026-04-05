// 一次性：清空並重新填入展示資料
// 執行：TURSO_DATABASE_URL=xxx TURSO_AUTH_TOKEN=xxx node scripts/reseed-turso.js
const { createClient } = require('@libsql/client');
const { reseedDemoData } = require('../lib/demo-data');

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error('請先設好 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN 環境變數');
  process.exit(1);
}

(async () => {
  const client = createClient({ url, authToken: token });
  console.log('=== 清空 + 重新填入展示資料 ===');
  await reseedDemoData(client);
  console.log('✅ Done.');
})().catch(e => { console.error(e); process.exit(1); });
