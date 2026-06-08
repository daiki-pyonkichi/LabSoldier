/**
 * ダミーデータ投入スクリプト（ワンオフ実行用）
 *   実行: cd backend && npx tsx src/scripts/seedDummy.ts
 *
 * - 新規ユーザーを4人追加（パスワードはすべて password123）
 * - 過去 365 日ぶんの在室ログ(presence_logs)を生成
 * - うち 1 人(yamada)は曜日依存の強い「週周期」パターン
 *   → Logs 画面の「周期解析(DFT)」で 7 日周期のピークがくっきり出る
 *
 * 決定論的ID + シード付き乱数なので、再実行しても同じデータに上書きされる（重複しない）。
 */
import { randomUUID } from "node:crypto";
import { db } from "../db/database.js";
import { hashPassword } from "../services/password.js";

// ===== シード付き乱数（mulberry32）: 再現性のため =====
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260602);
// 平均0・標準偏差1 の正規乱数（Box-Muller）
function gauss() {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ===== 投入する新規ユーザー =====
type Persona = {
  id: string;
  name: string;
  avatarId: string;
  // 指定曜日(0=月..6=日)の在室時間(時間)を返す。0以下ならその日は不在
  hoursForDay: (dow: number) => number;
};

const PASSWORD_HASH = hashPassword("password123");
const seedCreatedAt = new Date("2025-06-02T00:00:00.000Z").toISOString();

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const personas: Persona[] = [
  {
    // ★ 週周期ユーザー: 在室時間を「週に1つの滑らかな山」(水曜ピーク→週末ゼロ)にする。
    //   1周期=1山 の単一正弦波に近い形なので、DFT のエネルギーが 7 日周期(基本波)に集中し、
    //   7 日のピークが最大になる。ギザギザにすると高調波(2〜3.5日)が立ってしまうので避ける。
    id: "u-yamada",
    name: "yamada",
    avatarId: "soldier-ninja",
    hoursForDay: (dow) => {
      // 水曜(dow=2)を頂点とした余弦の山: 月3.5→火7.3→水9→木7.3→金3.5→土日ほぼ0
      const h = 4.5 + 4.5 * Math.cos((2 * Math.PI * (dow - 2)) / 7);
      const noisy = h + gauss() * 0.3;
      if (noisy < 0.8) return 0; // 週末などはゼロ(在室なし)にして山をくっきりさせる
      return clamp(noisy, 0.8, 11);
    },
  },
  {
    // 平日勤務型（ゆるい週周期 + ノイズ）: 平日6〜9h、たまに休む、週末はまれ
    id: "u-suzuki",
    name: "suzuki",
    avatarId: "soldier-boxer",
    hoursForDay: (dow) => {
      if (dow <= 4) {
        if (rand() < 0.12) return 0; // 12%で休み
        return clamp(7 + gauss() * 1.8, 1, 11);
      }
      return rand() < 0.15 ? clamp(3 + gauss() * 1.5, 0.5, 6) : 0; // 週末はまれ
    },
  },
  {
    // 完全ランダム型: 曜日に関係なく約50%出席・在室時間バラバラ（周期性ほぼ無し）
    id: "u-kobayashi",
    name: "kobayashi",
    avatarId: "soldier-heitai",
    hoursForDay: () => (rand() < 0.5 ? clamp(1 + rand() * 9, 0.5, 10) : 0),
  },
  {
    // 散発型: 週に2〜3回・短め（2〜5h）
    id: "u-watanabe",
    name: "watanabe",
    avatarId: "soldier-naginata2",
    hoursForDay: () => (rand() < 0.4 ? clamp(2 + rand() * 3, 0.5, 6) : 0),
  },
];

// ===== ステートメント =====
const upsertUser = db.prepare(`
  INSERT INTO users (id, name, password_hash, avatar_id, created_at, is_admin)
  VALUES (@id, @name, @hash, @avatarId, @createdAt, 0)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    password_hash = excluded.password_hash,
    avatar_id = excluded.avatar_id
`);
const insertBlankPresence = db.prepare(`
  INSERT OR IGNORE INTO presence (user_id, is_present, source, entered_at, last_seen_at, manual_off)
  VALUES (?, 0, 'wifi', NULL, NULL, 0)
`);
const deleteLogsByUser = db.prepare(`DELETE FROM presence_logs WHERE user_id = ?`);
const insertLog = db.prepare(`
  INSERT INTO presence_logs (id, user_id, entered_at, left_at, duration_sec)
  VALUES (?, ?, ?, ?, ?)
`);

const DAYS = 365;

function ymdJst(d: Date): string {
  // JST(+9)基準の YYYY-MM-DD
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

const run = db.transaction(() => {
  const today = new Date();
  let totalLogs = 0;

  for (const p of personas) {
    upsertUser.run({
      id: p.id,
      name: p.name,
      hash: PASSWORD_HASH,
      avatarId: p.avatarId,
      createdAt: seedCreatedAt,
    });
    insertBlankPresence.run(p.id);
    deleteLogsByUser.run(p.id); // 再実行時の重複防止

    let count = 0;
    for (let back = DAYS; back >= 1; back--) {
      const day = new Date(today);
      day.setDate(day.getDate() - back);
      const ymd = ymdJst(day);
      // 曜日(0=月..6=日)
      const jsDow = new Date(`${ymd}T00:00:00+09:00`).getDay(); // 0=日
      const dow = jsDow === 0 ? 6 : jsDow - 1;

      const hours = p.hoursForDay(dow);
      if (hours <= 0.1) continue;

      // 入室は 9:00〜10:00 のあいだで少し揺らす
      const startMin = 9 * 60 + Math.floor(rand() * 60);
      const sh = String(Math.floor(startMin / 60)).padStart(2, "0");
      const sm = String(startMin % 60).padStart(2, "0");
      const entered = new Date(`${ymd}T${sh}:${sm}:00+09:00`);
      const left = new Date(entered.getTime() + hours * 3600 * 1000);
      const durationSec = Math.floor((left.getTime() - entered.getTime()) / 1000);

      insertLog.run(randomUUID(), p.id, entered.toISOString(), left.toISOString(), durationSec);
      count++;
    }
    totalLogs += count;
    console.log(`[seedDummy] ${p.name} (${p.avatarId}): ${count} 日ぶんのログを生成`);
  }
  console.log(`[seedDummy] 合計 ${totalLogs} 件の在室ログを投入しました`);
});

run();
console.log("[seedDummy] 完了 ✅  パスワードは全員 password123 です");
