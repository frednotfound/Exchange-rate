#!/usr/bin/env node
/**
 * 由 GitHub Actions 定時執行：
 *   1. 臺灣銀行今日牌告     → data/bot.json
 *   2. 臺灣銀行近 3 個月牌告 → data/bot-history.json（牌告有變動時才重抓）
 *   3. 國際市場中間價       → data/mid.json
 *   4. 中間價每日歷史       → data/mid-history.json（保留約 120 天）
 * 內容沒有變動時不會改寫檔案，因此不會產生多餘的 commit。
 * 需求：Node.js 18+（內建 fetch）
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DATA_DIR = new URL('../data/', import.meta.url);
const CODES = ['usd','twd','jpy','eur','cny','hkd','krw','gbp','aud','cad','sgd','chf','nzd','thb','php','idr','vnd','myr','zar','sek','nok','dkk','mop','inr','try','aed','sar','qar','kwd','ils','egp','rub','pln','czk','huf','ron','isk','uah','brl','mxn','ars','clp','cop','pen','khr','lak','mmk','bnd','pkr','lkr','npr','bdt','mnt','kzt','mvr','fjd'];
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; fx-rates-updater/1.0; +https://github.com)', 'Accept': 'text/csv,application/json;q=0.9,*/*;q=0.8' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[rates]', ...a);

async function get(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return r;
    } catch (e) { err = e; if (i < tries - 1) await sleep(1500 * (i + 1)); }
  }
  throw err;
}
const num = x => { const v = parseFloat(x); return v > 0 ? v : null; };
const round = v => Number(Number(v).toPrecision(8));
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function trim(rates) {
  const o = {};
  for (const c of CODES) { const v = +rates[c]; if (v > 0) o[c] = round(v); }
  o.usd = 1;
  return o;
}

async function readJSON(name) {
  try { return JSON.parse(await readFile(new URL(name, DATA_DIR), 'utf8')); } catch { return null; }
}
async function writeIfChanged(name, data) {
  const old = await readJSON(name);
  const strip = o => { if (!o) return ''; const { generatedAt, ...rest } = o; return JSON.stringify(rest); };
  if (strip(old) === strip(data)) { log(name, '無變動'); return false; }
  await writeFile(new URL(name, DATA_DIR), JSON.stringify({ generatedAt: new Date().toISOString(), ...data }) + '\n');
  log(name, '已更新');
  return true;
}

/* ---------- 臺灣銀行 ---------- */
// CSV 欄位：幣別,本行買入,現金,即期,遠期×7,本行賣出,現金,即期,遠期×7
function parseBotCSV(t) {
  const rates = {};
  for (const line of t.replace(/^﻿/, '').split(/\r?\n/)) {
    const c = line.split(','), code = (c[0] || '').trim();
    if (!/^[A-Z]{3}$/.test(code)) continue;
    let si = c.findIndex((x, i) => i > 1 && /賣/.test(x)); if (si < 0) si = 11;
    rates[code] = { cashBuy: num(c[2]), spotBuy: num(c[3]), cashSell: num(c[si + 1]), spotSell: num(c[si + 2]) };
  }
  return rates;
}
// 歷史 CSV 欄位：資料日期,幣別,本行買入,現金,即期,...,本行賣出,現金,即期,...
// 輸出：[日期, 現金買入, 現金賣出, 即期買入, 即期賣出]
function parseBotHistCSV(t) {
  const out = [];
  for (const line of t.replace(/^﻿/, '').split(/\r?\n/)) {
    const c = line.split(','), d = (c[0] || '').trim();
    if (!/^\d{8}$/.test(d)) continue;
    let si = c.findIndex((x, i) => i > 2 && /賣/.test(x)); if (si < 0) si = 12;
    out.push([`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, num(c[3]), num(c[si + 1]), num(c[4]), num(c[si + 2])]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
// 下載檔名形如 ExchangeRate@202611261601.csv，即掛牌時間（臺北時間）
function listedTime(cd) {
  const m = /@(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(cd || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00` : null;
}

async function updateBot() {
  const res = await get('https://rate.bot.com.tw/xrt/flcsv/0/day');
  const listed = listedTime(res.headers.get('content-disposition'));
  const rates = parseBotCSV(await res.text());
  if (!rates.USD || Object.keys(rates).length < 8) throw new Error('臺銀 CSV 解析失敗');
  const old = await readJSON('bot.json');
  const same = old && JSON.stringify(old.rates) === JSON.stringify(rates);
  const updated = listed || (same && old.updated) || new Date().toISOString();
  const changed = await writeIfChanged('bot.json', { source: '臺灣銀行牌告匯率 https://rate.bot.com.tw/xrt', updated, rates });
  return { changed, codes: Object.keys(rates) };
}

async function updateBotHistory(codes, force) {
  const old = await readJSON('bot-history.json');
  const complete = old && codes.every(c => old.series?.[c]?.length);
  if (!force && complete) { log('bot-history.json 略過（牌告無變動）'); return; }
  const series = { ...(old?.series || {}) };
  for (const c of codes) {
    try {
      const s = parseBotHistCSV(await (await get(`https://rate.bot.com.tw/xrt/flcsv/0/L3M/${c}`, 2)).text());
      if (s.length) series[c] = s;
    } catch (e) { log('歷史牌告失敗', c, e.message); }
    await sleep(350);
  }
  await writeIfChanged('bot-history.json', { source: '臺灣銀行歷史牌告（近 3 個月）', series });
}

/* ---------- 國際中間價 ---------- */
const fawazURL = (tag) => [
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.min.json`,
  `https://${tag}.currency-api.pages.dev/v1/currencies/usd.min.json`,
];
async function fetchFawaz(tag, tries = 2) {
  for (const u of fawazURL(tag)) {
    try { const j = await (await get(u, tries)).json(); if (j?.usd?.twd) return j; } catch {}
  }
  return null;
}

async function updateMid() {
  let date, rates, source;
  const j = await fetchFawaz('latest', 3);
  if (j) { date = j.date; rates = trim(j.usd); source = 'fawazahmed0/currency-api'; }
  else {
    const e = await (await get('https://open.er-api.com/v6/latest/USD')).json();
    if (e.result !== 'success') throw new Error('中間價來源皆失敗');
    const r = {}; for (const k in e.rates) r[k.toLowerCase()] = e.rates[k];
    date = new Date(e.time_last_update_unix * 1000).toISOString().slice(0, 10);
    rates = trim(r); source = 'open.er-api.com';
  }
  await writeIfChanged('mid.json', { source, date, updatedAt: null, rates });
  await updateMidHistory(date, rates);
}

async function updateMidHistory(latest, latestRates) {
  const old = await readJSON('mid-history.json');
  const days = {};
  if (old?.codes && old.days) {
    for (const [d, arr] of Object.entries(old.days)) {
      const o = {}; old.codes.forEach((c, i) => { if (arr[i] != null) o[c] = arr[i]; }); days[d] = o;
    }
  }
  days[latest] = latestRates;
  const missing = [];
  for (let k = 1; k <= 100; k++) { const d = addDays(latest, -k); if (!days[d]) missing.push(d); }
  if (missing.length) log(`補齊中間價歷史 ${missing.length} 天`);
  // 6 個並行
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < missing.length) {
      const d = missing[i++];
      const j = await fetchFawaz(d, 1);
      if (j) days[d] = trim(j.usd);
    }
  }));
  const cutoff = addDays(latest, -120);
  const out = {};
  for (const d of Object.keys(days).sort()) if (d >= cutoff) out[d] = CODES.map(c => days[d][c] ?? null);
  await writeIfChanged('mid-history.json', { source: 'fawazahmed0/currency-api（每日，每 1 USD）', codes: CODES, days: out });
}

/* ---------- main ---------- */
await mkdir(DATA_DIR, { recursive: true });
let ok = 0;
try {
  const b = await updateBot(); ok++;
  await updateBotHistory(b.codes, b.changed);
} catch (e) { console.error('[rates] 臺灣銀行失敗：', e.message); }
try { await updateMid(); ok++; } catch (e) { console.error('[rates] 中間價失敗：', e.message); }
if (!ok) process.exitCode = 1;
