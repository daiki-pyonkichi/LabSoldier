import { Router } from "express";
import { store } from "../db/store.js";
import { getAuthenticatedUser } from "../middleware/auth.js";

/**
 * やることリスト（To-Do）ルート。
 * 研究室の「やらなければいけないこと」を共有する。
 * - 担当者(assigneeIds): ユーザーIDの配列 / ["all"]=全員 / []=未設定（空欄可・複数可）
 * - 期限(dueDate): YYYY-MM-DD / null（空欄可）
 * - 完了(done): チェックすると完了済みへ移動
 */
export const todosRouter = Router();

// 期限は日付のみ "YYYY-MM-DD" か、時刻付き "YYYY-MM-DDTHH:MM" を許可
const ymd = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

// 入力から担当者配列を正規化。
// "all" が含まれれば全員扱い ["all"]。それ以外は実在するユーザーIDのみ残す（重複排除）
function normalizeAssignees(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((x): x is string => typeof x === "string");
  if (ids.includes("all")) return ["all"];
  const valid = ids.filter((id) => store.getUser(id));
  return Array.from(new Set(valid));
}

function normalizeDue(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  return ymd.test(raw) ? raw : null;
}

// GET /api/todos : やること一覧（全員で共有）
todosRouter.get("/", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  return res.json({ todos: store.listTodos() });
});

// POST /api/todos : やることを登録（すべて空欄でも可）
todosRouter.post("/", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const todo = store.createTodo({
    title,
    assigneeIds: normalizeAssignees(req.body?.assigneeIds),
    dueDate: normalizeDue(req.body?.dueDate),
    createdBy: user.id,
  });
  return res.status(201).json({ todo });
});

// PATCH /api/todos/:id : 編集 または 完了状態の切り替え
todosRouter.patch("/:id", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const id = req.params.id;

  // done のみが渡された場合は完了状態の切り替え
  if (typeof req.body?.done === "boolean" && req.body.title === undefined) {
    const updated = store.setTodoDone(id, req.body.done);
    if (!updated) return res.status(404).json({ error: "not found" });
    return res.json({ todo: updated });
  }

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const updated = store.updateTodo(id, {
    title,
    assigneeIds: normalizeAssignees(req.body?.assigneeIds),
    dueDate: normalizeDue(req.body?.dueDate),
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  return res.json({ todo: updated });
});

// DELETE /api/todos/:id : やることを削除
todosRouter.delete("/:id", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const ok = store.deleteTodo(req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true });
});
