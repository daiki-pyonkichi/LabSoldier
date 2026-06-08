import { randomUUID } from "node:crypto";
import { db } from "./database.js";
import type { AuthUserRecord, Presence, PresenceLog, Todo, User } from "../types.js";

const userByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");
const userByNameStmt = db.prepare(
  "SELECT * FROM users WHERE LOWER(name) = LOWER(?)",
);
const allUsersStmt = db.prepare("SELECT * FROM users ORDER BY created_at");
const userCountStmt = db.prepare("SELECT COUNT(*) AS n FROM users");
const insertUserStmt = db.prepare(`
  INSERT INTO users (id, name, password_hash, avatar_id, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const updateAvatarStmt = db.prepare(`UPDATE users SET avatar_id = ? WHERE id = ?`);
const updatePasswordStmt = db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`);
const deleteUserStmt = db.prepare(`DELETE FROM users WHERE id = ?`);
const deletePresenceByUserStmt = db.prepare(`DELETE FROM presence WHERE user_id = ?`);
const deleteLogsByUserStmt = db.prepare(`DELETE FROM presence_logs WHERE user_id = ?`);
const deleteLogByIdStmt = db.prepare(`DELETE FROM presence_logs WHERE id = ?`);
const presenceByIdStmt = db.prepare("SELECT * FROM presence WHERE user_id = ?");
const allPresencesStmt = db.prepare("SELECT * FROM presence");
const upsertPresenceStmt = db.prepare(`
  INSERT INTO presence (user_id, is_present, source, entered_at, last_seen_at, manual_off)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    is_present = excluded.is_present,
    source = excluded.source,
    entered_at = excluded.entered_at,
    last_seen_at = excluded.last_seen_at,
    manual_off = excluded.manual_off
`);
const insertBlankPresenceStmt = db.prepare(`
  INSERT OR IGNORE INTO presence (user_id, is_present, source, entered_at, last_seen_at, manual_off)
  VALUES (?, 0, 'wifi', NULL, NULL, 0)
`);
const setManualOffStmt = db.prepare(
  `UPDATE presence SET manual_off = ? WHERE user_id = ?`,
);
const insertLogStmt = db.prepare(`
  INSERT INTO presence_logs (id, user_id, entered_at, left_at, duration_sec)
  VALUES (?, ?, ?, ?, ?)
`);
const logsByUserStmt = db.prepare(`
  SELECT * FROM presence_logs WHERE user_id = ? ORDER BY left_at DESC
`);
// 管理者の在室ログは利用者から見えないようにすべての一覧クエリで除外する
const logsAllStmt = db.prepare(`
  SELECT
    l.id, l.user_id, l.entered_at, l.left_at, l.duration_sec,
    u.name, u.avatar_id
  FROM presence_logs l
  JOIN users u ON u.id = l.user_id
  WHERE u.is_admin = 0
  ORDER BY l.left_at DESC
`);
const logsByUserIdStmt = db.prepare(`
  SELECT
    l.id, l.user_id, l.entered_at, l.left_at, l.duration_sec,
    u.name, u.avatar_id
  FROM presence_logs l
  JOIN users u ON u.id = l.user_id
  WHERE l.user_id = ? AND u.is_admin = 0
  ORDER BY l.left_at DESC
`);
const logsByDateStmt = db.prepare(`
  SELECT
    l.id, l.user_id, l.entered_at, l.left_at, l.duration_sec,
    u.name, u.avatar_id
  FROM presence_logs l
  JOIN users u ON u.id = l.user_id
  WHERE l.entered_at < ? AND l.left_at > ? AND u.is_admin = 0
  ORDER BY l.left_at DESC
`);
const logsByUserAndDateStmt = db.prepare(`
  SELECT
    l.id, l.user_id, l.entered_at, l.left_at, l.duration_sec,
    u.name, u.avatar_id
  FROM presence_logs l
  JOIN users u ON u.id = l.user_id
  WHERE l.user_id = ? AND l.entered_at < ? AND l.left_at > ? AND u.is_admin = 0
  ORDER BY l.left_at DESC
`);
const dailyStatsByUserStmt = db.prepare(`
  SELECT entered_at, left_at, duration_sec
  FROM presence_logs
  WHERE user_id = ? AND left_at >= ? AND entered_at < ?
  ORDER BY entered_at ASC
`);
const rankingStmt = db.prepare(`
  SELECT
    u.id          AS user_id,
    u.name        AS name,
    u.avatar_id   AS avatar_id,
    COALESCE(SUM(l.duration_sec), 0) AS total_sec
  FROM users u
  LEFT JOIN presence_logs l
    ON u.id = l.user_id AND l.left_at >= ?
  WHERE u.is_admin = 0
  GROUP BY u.id
  ORDER BY total_sec DESC
`);

// --- todos (やることリスト) 用の SQL ---
const allTodosStmt = db.prepare(`SELECT * FROM todos ORDER BY created_at DESC`);
const insertTodoStmt = db.prepare(`
  INSERT INTO todos (id, title, assignee_ids, due_date, done, created_at, created_by)
  VALUES (?, ?, ?, ?, 0, ?, ?)
`);
const updateTodoStmt = db.prepare(`
  UPDATE todos SET title = ?, assignee_ids = ?, due_date = ? WHERE id = ?
`);
const setTodoDoneStmt = db.prepare(`UPDATE todos SET done = ? WHERE id = ?`);
const deleteTodoStmt = db.prepare(`DELETE FROM todos WHERE id = ?`);

export const avatarIds = ["soldier-armor", "soldier-spear", "soldier-naginata2", "soldier-red", "soldier-boxer", "soldier-ninja"];

type UserRow = {
  id: string;
  name: string;
  avatar_id: string;
  password_hash: string;
  created_at: string;
  is_admin: number;
};

type PresenceRow = {
  user_id: string;
  is_present: number;
  source: string;
  entered_at: string | null;
  last_seen_at: string | null;
  manual_off: number;
};

type PresenceLogRow = {
  id: string;
  user_id: string;
  entered_at: string;
  left_at: string;
  duration_sec: number;
};

type TodoRow = {
  id: string;
  title: string;
  assignee_ids: string; // JSON 配列の文字列
  due_date: string | null;
  done: number;
  created_at: string;
  created_by: string | null;
};

//ここからデータベースの命名規則をアプリケーションの命名規則に変換する関数
function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    avatarId: r.avatar_id,
    createdAt: r.created_at,
    isAdmin: r.is_admin === 1,
  };
}
function rowToAuthUser(r: UserRow): AuthUserRecord {
  return { ...rowToUser(r), passwordHash: r.password_hash };
}
function rowToPresence(r: PresenceRow): Presence {
  return {
    userId: r.user_id,
    isPresent: r.is_present === 1,
    source: r.source as "wifi" | "manual",
    enteredAt: r.entered_at,
    lastSeenAt: r.last_seen_at,
    manualOff: r.manual_off === 1,
  };
}
function rowToTodo(r: TodoRow): Todo {
  let assigneeIds: string[] = [];
  try {
    const parsed = JSON.parse(r.assignee_ids);
    if (Array.isArray(parsed)) assigneeIds = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    assigneeIds = [];
  }
  return {
    id: r.id,
    title: r.title,
    assigneeIds,
    dueDate: r.due_date,
    done: r.done === 1,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

//データベースを操作する関数群をまとめたオブジェクト
export const store = {
  listUsers(): User[] {
    return (allUsersStmt.all() as UserRow[]).map(rowToUser);
  },//ユーザーをすべて取る関数
  getUser(id: string): User | undefined {
    const row = userByIdStmt.get(id) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  },//ユーザーIDからユーザー情報（公開用）を取得する関数
  getAuthUserByName(name: string): AuthUserRecord | undefined {
    const row = userByNameStmt.get(name) as UserRow | undefined;
    return row ? rowToAuthUser(row) : undefined;
  },//ユーザー名から認証用ユーザー（passwordHash 付き）を取得する関数
  getAuthUserById(id: string): AuthUserRecord | undefined {
    const row = userByIdStmt.get(id) as UserRow | undefined;
    return row ? rowToAuthUser(row) : undefined;
  },//ユーザーIDから認証用ユーザー（passwordHash 付き）を取得する関数
  createUser(input: { name: string; passwordHash: string; avatarId?: string }): User {
    const count = (userCountStmt.get() as { n: number }).n;
    const id = randomUUID();
    const avatarId = input.avatarId ?? avatarIds[count % avatarIds.length];
    const createdAt = new Date().toISOString();
    insertUserStmt.run(id, input.name, input.passwordHash, avatarId, createdAt);
    insertBlankPresenceStmt.run(id);
    return { id, name: input.name, avatarId, createdAt, isAdmin: false };
  },//新規ユーザーを作る関数（auth.ts の signup から呼ばれる）
  updateAvatar(userId: string, avatarId: string): User | undefined {
    updateAvatarStmt.run(avatarId, userId);
    return this.getUser(userId);
  },//ユーザーのアバターを変更する関数
  updatePassword(userId: string, passwordHash: string): boolean {
    const info = updatePasswordStmt.run(passwordHash, userId);
    return info.changes > 0;
  },//パスワードを変更する関数（自分の変更 or 管理者からの強制変更）
  deleteUser(userId: string): boolean {
    // 外部キーで参照されている子テーブルから先に消す
    deleteLogsByUserStmt.run(userId);
    deletePresenceByUserStmt.run(userId);
    const info = deleteUserStmt.run(userId);
    return info.changes > 0;
  },//ユーザーと関連レコードを完全削除する関数
  deleteLogById(logId: string): boolean {
    const info = deleteLogByIdStmt.run(logId);
    return info.changes > 0;
  },//在室ログ1件を削除する関数（管理者操作）
  listPresences(): Presence[] {
    return (allPresencesStmt.all() as PresenceRow[]).map(rowToPresence);
  },//すべての在室情報を取得する関数
  getPresence(userId: string): Presence | undefined {
    const row = presenceByIdStmt.get(userId) as PresenceRow | undefined;
    return row ? rowToPresence(row) : undefined;
  },//ユーザーIDから在室情報を取得する関数
  upsertPresence(p: Presence): Presence {
    upsertPresenceStmt.run(
      p.userId,
      p.isPresent ? 1 : 0,
      p.source,
      p.enteredAt,
      p.lastSeenAt,
      p.manualOff ? 1 : 0,
    );
    return p;
  },//在室情報を書き換える関数
  setManualOff(userId: string, value: boolean): void {
    setManualOffStmt.run(value ? 1 : 0, userId);
  },//退室フラグを切り替える関数
  insertPresenceLog(args: {
    userId: string;
    enteredAt: string;
    leftAt: string;
  }): PresenceLog {
    const durationSec = Math.max(
      0,
      Math.floor(
        (new Date(args.leftAt).getTime() - new Date(args.enteredAt).getTime()) /
          1000,
      ),
    );
    const id = randomUUID();
    insertLogStmt.run(
      id,
      args.userId,
      args.enteredAt,
      args.leftAt,
      durationSec,
    );
    return {
      id,
      userId: args.userId,
      enteredAt: args.enteredAt,
      leftAt: args.leftAt,
      durationSec,
    };
  },//UserID,入室時間、退室時間をもとに在室履歴を追加する関数
  listPresenceLogsByUser(userId: string): PresenceLog[] {
    return (logsByUserStmt.all(userId) as PresenceLogRow[]).map((r) => ({
      id: r.id,
      userId: r.user_id,
      enteredAt: r.entered_at,
      leftAt: r.left_at,
      durationSec: r.duration_sec,
    }));
  },//ユーザーIDから在室履歴を取得する関数

  listLogs(args: { userId?: string; dateUtcStart?: string; dateUtcEnd?: string }) {
    type Row = {
      id: string; user_id: string; entered_at: string; left_at: string;
      duration_sec: number; name: string; avatar_id: string;
    };
    const toLog = (r: Row) => ({
      id: r.id, userId: r.user_id, enteredAt: r.entered_at,
      leftAt: r.left_at, durationSec: r.duration_sec,
      name: r.name, avatarId: r.avatar_id,
    });
    const { userId, dateUtcStart, dateUtcEnd } = args;
    if (userId && dateUtcStart && dateUtcEnd) {
      return (logsByUserAndDateStmt.all(userId, dateUtcEnd, dateUtcStart) as Row[]).map(toLog);
    }
    if (dateUtcStart && dateUtcEnd) {
      return (logsByDateStmt.all(dateUtcEnd, dateUtcStart) as Row[]).map(toLog);
    }
    if (userId) {
      return (logsByUserIdStmt.all(userId) as Row[]).map(toLog);
    }
    return (logsAllStmt.all() as Row[]).map(toLog);
  },//フィルタ条件に応じた在室ログ一覧を返す

  getDailyStats(userId: string, fromUtc: string, toUtc: string) {
    type Row = { entered_at: string; left_at: string; duration_sec: number };
    return (dailyStatsByUserStmt.all(userId, fromUtc, toUtc) as Row[]).map((r) => ({
      enteredAt: r.entered_at, leftAt: r.left_at, durationSec: r.duration_sec,
    }));
  },//ユーザーの日別在室合計を計算するための生セッションを返す

  getRanking(periodStartIso: string): { userId: string; name: string; avatarId: string; totalSec: number }[] {
    type Row = { user_id: string; name: string; avatar_id: string; total_sec: number };
    return (rankingStmt.all(periodStartIso) as Row[]).map((r) => ({
      userId: r.user_id,
      name: r.name,
      avatarId: r.avatar_id,
      totalSec: r.total_sec,
    }));
  },//期間内の在室合計秒数ランキングを返す

  listTodos(): Todo[] {
    return (allTodosStmt.all() as TodoRow[]).map(rowToTodo);
  },//やることリストを全件取得する関数
  createTodo(input: {
    title: string;
    assigneeIds: string[];
    dueDate: string | null;
    createdBy: string | null;
  }): Todo {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    insertTodoStmt.run(
      id,
      input.title,
      JSON.stringify(input.assigneeIds),
      input.dueDate,
      createdAt,
      input.createdBy,
    );
    return {
      id,
      title: input.title,
      assigneeIds: input.assigneeIds,
      dueDate: input.dueDate,
      done: false,
      createdAt,
      createdBy: input.createdBy,
    };
  },//やることを1件追加する関数
  updateTodo(id: string, input: {
    title: string;
    assigneeIds: string[];
    dueDate: string | null;
  }): Todo | undefined {
    updateTodoStmt.run(input.title, JSON.stringify(input.assigneeIds), input.dueDate, id);
    const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRow | undefined;
    return row ? rowToTodo(row) : undefined;
  },//やることの内容を編集する関数
  setTodoDone(id: string, done: boolean): Todo | undefined {
    setTodoDoneStmt.run(done ? 1 : 0, id);
    const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRow | undefined;
    return row ? rowToTodo(row) : undefined;
  },//完了/未完了を切り替える関数
  deleteTodo(id: string): boolean {
    const info = deleteTodoStmt.run(id);
    return info.changes > 0;
  },//やることを削除する関数
};
