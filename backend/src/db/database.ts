import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { hashPassword } from "../services/password.js";
// データベースの初期化とテーブル作成
// 本番では DB_PATH に永続ディスク上のパスを指定する（例: /opt/labsoldier/data/labsoldier.db）
const DB_PATH = process.env.DB_PATH ?? "data/labsoldier.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");//高速モードを有効化
db.pragma("foreign_keys = ON");//外部キー制約を有効化

//データベースの構成
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    avatar_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS presence (
    user_id TEXT PRIMARY KEY,
    is_present INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'wifi',
    entered_at TEXT,
    last_seen_at TEXT,
    manual_off INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS presence_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    entered_at TEXT NOT NULL,
    left_at TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_logs_user_left
    ON presence_logs(user_id, left_at);

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    assignee_ids TEXT NOT NULL DEFAULT '[]',
    due_date TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by TEXT
  );
`);
//todos やることリスト
  //title するべきこと（空欄可）
  //assignee_ids 担当者のユーザーIDをJSON配列で保持。["all"]=全員 / []=未設定
  //due_date 期限（YYYY-MM-DD、空欄可）
  //done 完了したか（0/1）

// 旧スキーマ（単一の assignee_id）から複数担当者(assignee_ids)へ in-place マイグレーション
const todoCols = db.pragma("table_info(todos)") as Array<{ name: string }>;
if (!todoCols.some((c) => c.name === "assignee_ids")) {
  db.exec(`ALTER TABLE todos ADD COLUMN assignee_ids TEXT NOT NULL DEFAULT '[]'`);
  if (todoCols.some((c) => c.name === "assignee_id")) {
    // 既存の単一担当者を1要素の配列へ変換（NULL/空は [] のまま）
    db.exec(`
      UPDATE todos
      SET assignee_ids = json_array(assignee_id)
      WHERE assignee_id IS NOT NULL AND assignee_id != ''
    `);
  }
}
//created_at 作成日時
  //last_seen_at 最終確認時間
  //初期データの投入（必要に応じて）
  //entered_at 入室時間
  //last_seen_at 最終確認時間
  //left_at 退室時間
  //duration_sec 在室時間（秒）


// 既存DBに manual_off カラムが無ければ追加（in-place マイグレーション）
const presenceCols = db.pragma("table_info(presence)") as Array<{ name: string }>;
if (!presenceCols.some((c) => c.name === "manual_off")) {
  db.exec(`ALTER TABLE presence ADD COLUMN manual_off INTEGER NOT NULL DEFAULT 0`);
}

// 既存DBに is_admin カラムが無ければ追加（in-place マイグレーション）
const userCols = db.pragma("table_info(users)") as Array<{ name: string }>;
if (!userCols.some((c) => c.name === "is_admin")) {
  db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
}

// 開発用初期パスワードは password123（固定 salt でハッシュ化、毎起動で同じ値になる）
const seedCreatedAt = new Date("2026-05-22T00:00:00.000Z").toISOString();
const seedPasswordHash = hashPassword("password123", "labsoldier-dev-seed");

const seedUsers = [
  { id: "u-user1", name: "user1", avatarId: "soldier-armor" },
  { id: "u-user2", name: "user2", avatarId: "soldier-red" },
  { id: "u-user3", name: "user3", avatarId: "soldier-ninja" },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, name, password_hash, avatar_id, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const insertPresence = db.prepare(`
  INSERT OR IGNORE INTO presence (user_id, is_present, source, entered_at, last_seen_at)
  VALUES (?, 0, 'wifi', NULL, NULL)
`);
const userExistsStmt = db.prepare("SELECT 1 FROM users WHERE id = ?");

// seed ユーザーの presence を入れる。
// ただし、同じ name が別 id で既に存在する（= 削除→再登録などで UUID id になった）場合、
// insertUser は UNIQUE(name) で無視され seed id のユーザーは作られない。
// その状態で presence を入れると FK 違反でクラッシュするため、実在する時だけ入れる。
function seedPresence(userId: string) {
  if (userExistsStmt.get(userId)) insertPresence.run(userId);
}

for (const u of seedUsers) {
  insertUser.run(u.id, u.name, seedPasswordHash, u.avatarId, seedCreatedAt);
  seedPresence(u.id);
}

// 管理者シードユーザー: name=admin / password=admin1234
const seedAdminPasswordHash = hashPassword("admin1234", "labsoldier-admin-seed");
const insertAdmin = db.prepare(`
  INSERT OR IGNORE INTO users (id, name, password_hash, avatar_id, created_at, is_admin)
  VALUES (?, ?, ?, ?, ?, 1)
`);
insertAdmin.run("u-admin", "admin", seedAdminPasswordHash, "soldier-armor", seedCreatedAt);
// 既存DBで admin ユーザーが居る場合、is_admin フラグを必ず立て直す
db.prepare(`UPDATE users SET is_admin = 1 WHERE id = 'u-admin'`).run();
seedPresence("u-admin");

console.log("[db] ready:", DB_PATH);
