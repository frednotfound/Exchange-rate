# 匯率換算｜極簡多幣別即時換算

純前端、單一 `index.html`，可直接架在 GitHub Pages。支援深色／淺色模式、國際中間價與臺灣銀行牌告切換、內建計算機、滑動手勢與匯率走勢圖。

## 部署步驟

1. 在 GitHub 建一個新的 repo（例如 `fx`），把整個資料夾的檔案上傳（含隱藏資料夾 `.github/`）。
2. **Settings → Pages**：Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾 `/ (root)`，按 Save。
3. **Settings → Actions → General → Workflow permissions**：選 `Read and write permissions`，按 Save。
4. **Actions** 分頁 → 左側「更新匯率資料」→ `Run workflow` 手動跑第一次。完成後 `data/` 會出現 4 個 JSON 檔。
5. 打開 `https://<你的帳號>.github.io/fx/` 即可使用。手機可用「加入主畫面」當成 App 使用。

> 第 3、4 步沒做也能用：網站會改用公開 CORS 代理直接讀取臺銀官網，只是比較不穩定。

## 資料來源與備援順序

| 項目 | 優先順序 |
|---|---|
| 國際中間價 | 同時向 MoneyConvert（約 5 分鐘更新）、fawazahmed0/currency-api（每日）、open.er-api.com（每日）取價，排除異常值後採用報價時間最新者 → 本站 `data/mid.json` → 上次快取 → 內建參考值 |
| 臺灣銀行牌告 | 本站 `data/bot.json`（GitHub Actions 每 30 分鐘同步）與 CORS 代理即時讀取並行，取較新者 → 上次快取 → 該列暫以中間價計算並標示「中間價」 |
| 走勢圖 | 本站 `data/mid-history.json` / `data/bot-history.json` → 線上逐日抓取 → 本機快取 |

- 狀態列會顯示「報價時間」與「同步時間」。網頁開著時每 5 分鐘自動檢查一次；臺銀牌告以臺銀官網的「掛牌時間」為準。
- 任何來源失敗時，計算機與介面都照常運作，狀態列會用綠／黃／紅點標示資料是否為最新。
- `data/*.json` 同時會從 `raw.githubusercontent.com` 讀取，避免 Pages 尚未重新部署時拿到舊資料。若預設分支不是 `main`，請修改 `index.html` 最上方 `CONFIG.repoBranch`。

## 操作方式

| 動作 | 手機 | 電腦 |
|---|---|---|
| 選擇輸入幣別 | 點一下該列 | 點擊，或 ↑ ↓ / Tab |
| 輸入、四則運算 | 下方鍵盤 | 數字鍵、`+ - * /`（`x` 也可當乘號） |
| 結算算式 | 點狀態列的「= 結果」 | `Enter` 或 `=` |
| 退格／清除 | ⌫／長按 ⌫ | `Backspace`／`Esc` 或 `Delete` |
| 更換幣別 | 該列向右滑 | 滑鼠向右拖曳、列上的 ⇄ 按鈕或 → |
| 匯率詳情與走勢 | 該列向左滑 | 滑鼠向左拖曳、列上的 📈 按鈕、右鍵或 ← |

## 加入主畫面（iPhone／Android）

- Safari 分享選單 →「加入主畫面」，就會以全螢幕的網頁 App 開啟，使用 `icons/` 裡的 App 圖示。
- `sw.js` 讓 App 在離線時也能打開（使用上次的匯率），`manifest.webmanifest` 定義 App 名稱、圖示與顏色。
- **更新網站後若主畫面 App 的圖示或版面沒變**：iPhone 會在加入主畫面時記住部分設定，請把主畫面上的圖示刪除後重新加入一次。

## 自訂

`index.html` 最上方的 `CONFIG` 可修改：預設 7 個幣別、銀行連結清單、GitHub repo 資訊。

## 注意

- GitHub 對公開 repo 若 60 天沒有任何活動，會自動停用排程。若發現資料停止更新，到 Actions 頁面重新啟用即可。
- 匯率僅供參考，實際交易以各銀行公告為準。 
