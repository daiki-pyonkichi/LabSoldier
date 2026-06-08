/**
 * ダミーの在室ログをDBに投入するスクリプト。
 * 実行: cd backend && npx tsx scripts/seed-logs.ts
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const db = new Database("data/labsoldier.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const USERS = [
  { id: "u-user1",     name: "user1" },
  { id: "u-user2",     name: "user2" },
  { id: "u-user3",  name: "user3" },
];

// 過去28日ぶんのデータを生成する
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function jstDate(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date(TODAY.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  d.setHours(hour, minute, 0, 0);
  // ローカルがJSTでない環境でもJSTとして扱う（ローカル開発用なのでシンプルに）
  return d;
}

type Session = { userId: string; enteredAt: Date; leftAt: Date };

function makeSession(userId: string, daysAgo: number, startHour: number, durationHour: number): Session {
  const enteredAt = jstDate(daysAgo, startHour);
  const leftAt = new Date(enteredAt.getTime() + durationHour * 60 * 60 * 1000);
  return { userId, enteredAt, leftAt };
}

// ユーザーごとに異なるパターンで28日ぶんのセッションを作成
const sessions: Session[] = [];

for (let day = 1; day <= 28; day++) {
  const dow = new Date(TODAY.getTime() - day * 24 * 60 * 60 * 1000).getDay();
  const isWeekend = dow === 0 || dow === 6;

  // user1: 毎日コツコツ型（週末も少し来る）
  if (!isWeekend || Math.random() < 0.3) {
    const start = 10 + Math.floor(Math.random() * 2);   // 10〜11時入室
    const dur = 5 + Math.random() * 3;                  // 5〜8時間
    sessions.push(makeSession("u-user1", day, start, dur));
  }

  // user2: 夜型（平日のみ）
  if (!isWeekend) {
    const start = 13 + Math.floor(Math.random() * 3);   // 13〜15時入室
    const dur = 4 + Math.random() * 5;                  // 4〜9時間
    sessions.push(makeSession("u-user2", day, start, dur));
  }

  // user3: 不定期（週3〜4日）
  if (!isWeekend && Math.random() < 0.7) {
    const start = 9 + Math.floor(Math.random() * 4);    // 9〜12時入室
    const dur = 3 + Math.random() * 6;                  // 3〜9時間
    sessions.push(makeSession("u-user3", day, start, dur));
  }
}

// presence_logs にすでにデータがある場合は安全のため何もせず終了する。
// 強制的に再投入したい時は --force フラグを付ける:
//   npx tsx scripts/seed-logs.ts --force
const force = process.argv.includes("--force");
const existing = (db.prepare("SELECT COUNT(*) AS n FROM presence_logs").get() as { n: number }).n;

if (existing > 0 && !force) {
  console.warn(`⚠️  presence_logs にすでに ${existing} 件のデータがあります。`);
  console.warn(`   ダミーデータを上書き投入したい場合は --force を付けて再実行してください:`);
  console.warn(`   npx tsx scripts/seed-logs.ts --force`);
  db.close();
  process.exit(0);
}

if (force && existing > 0) {
  console.warn(`⚠️  --force 指定: 既存の ${existing} 件を削除して再投入します。`);
  db.exec(`DELETE FROM presence_logs`);
}

const insert = db.prepare(`
  INSERT INTO presence_logs (id, user_id, entered_at, left_at, duration_sec)
  VALUES (?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((rows: Session[]) => {
  for (const s of rows) {
    const durationSec = Math.floor((s.leftAt.getTime() - s.enteredAt.getTime()) / 1000);
    insert.run(
      randomUUID(),
      s.userId,
      s.enteredAt.toISOString(),
      s.leftAt.toISOString(),
      durationSec,
    );
  }
});

insertMany(sessions);

console.log(`Inserted ${sessions.length} logs.`);
console.log("内訳:");
for (const u of USERS) {
  const count = sessions.filter(s => s.userId === u.id).length;
  console.log(`  ${u.name}: ${count} セッション`);
}

db.close();
