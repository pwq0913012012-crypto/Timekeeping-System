# DUCK 企業打卡系統

Node.js + Express + SQLite 前後端分離的人力資源管理系統

## 檔案結構

| 檔案 / 資料夾 | 說明 |
|---|---|
| `public/` | 前端頁面（瀏覽器端） |
| `public/index.html` | 網頁 HTML 結構 |
| `public/style.css` | 網頁樣式（深色企業風格） |
| `public/app.js` | 前端邏輯（打卡、請假、報表等操作） |
| `server.js` | 後端伺服器（API 路由 + 資料庫 + 認證） |
| `package.json` | Node.js 專案設定與依賴套件 |
| `.gitignore` | Git 忽略清單（node_modules、資料庫檔案） |

## 功能

- 員工打卡（上班 / 下班 / 遲到 / 早退自動判斷）
- 三班制排班（早班 09-18 / 中班 14-22 / 晚班 22-06）
- 請假管理（申請 / 主管審核）
- 加班管理（申請 / 主管審核）
- 員工與部門管理
- 薪資報表（自動計算扣款與加班費）
- 統計報表與儀表板
- 公告系統
- 紅點通知提醒
- 週循環出勤模擬（每週自動產生不同的出勤資料）

## 啟動方式

```bash
npm install
node server.js
```

開啟瀏覽器到 `http://localhost:3000`

預設帳號：`admin` / `admin123`

## 技術

- **前端**：原生 HTML + CSS + JavaScript
- **後端**：Node.js + Express
- **資料庫**：SQLite（sql.js）
- **認證**：JWT Token + bcrypt 密碼加密
