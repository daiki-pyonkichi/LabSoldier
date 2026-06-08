import type { Request, Response } from "express";
import { Router } from "express";
import { store } from "../db/store.js";
import { getAuthenticatedAdmin } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import type { User } from "../types.js";

/**
 * 管理者用ルート。is_admin=1 のユーザーだけが叩ける。
 * 破壊的操作（削除 / パスワード変更）は必ず管理者本人のパスワード再確認を要求する。
 */
export const adminRouter = Router();

// req.body.adminPassword が「呼び出し中の admin の現在パスワード」と一致するか検証する。
// 一致しない / 未入力なら、即レスポンスを返してハンドラ側で return できるよう false を返す。
function ensureAdminPassword(req: Request, res: Response, admin: User): boolean {
  const adminPassword = String((req.body as { adminPassword?: unknown })?.adminPassword ?? "");
  if (!adminPassword) {
    res.status(400).json({ error: "adminPassword is required" });
    return false;
  }
  const authUser = store.getAuthUserById(admin.id);
  if (!authUser || !verifyPassword(adminPassword, authUser.passwordHash)) {
    res.status(401).json({ error: "admin password is incorrect" });
    return false;
  }
  return true;
}

// GET /api/admin/users : 全ユーザー一覧（参照のみなのでパスワード再確認は不要）
adminRouter.get("/users", (req, res) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) return res.status(403).json({ error: "admin required" });

  const users = store.listUsers();
  return res.json({ users });
});

// PATCH /api/admin/users/:id : { newPassword, adminPassword } で対象ユーザーのパスワードを再設定
adminRouter.patch("/users/:id", (req, res) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) return res.status(403).json({ error: "admin required" });
  if (!ensureAdminPassword(req, res, admin)) return;

  const target = store.getUser(req.params.id);
  if (!target) return res.status(404).json({ error: "user not found" });

  const newPassword = String((req.body as { newPassword?: unknown })?.newPassword ?? "");
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "newPassword must be at least 8 characters" });
  }

  store.updatePassword(target.id, hashPassword(newPassword));
  return res.json({ user: target });
});

// DELETE /api/admin/users/:id : 対象ユーザーを完全削除。{ adminPassword } 必須
adminRouter.delete("/users/:id", (req, res) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) return res.status(403).json({ error: "admin required" });
  if (!ensureAdminPassword(req, res, admin)) return;

  // 自分自身は管理画面から消せないようにする（admin が消えるとロックアウトする）
  if (req.params.id === admin.id) {
    return res.status(400).json({ error: "cannot delete yourself from admin panel" });
  }

  const ok = store.deleteUser(req.params.id);
  if (!ok) return res.status(404).json({ error: "user not found" });
  return res.json({ ok: true });
});

// POST /api/admin/logs : { userId, enteredAt, leftAt } で在室ログを手動追加
//   ※「追加」は削除/パスワード変更ではないのでパスワード再確認は要求しない
adminRouter.post("/logs", (req, res) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) return res.status(403).json({ error: "admin required" });

  const body = req.body as { userId?: unknown; enteredAt?: unknown; leftAt?: unknown };
  const userId = String(body?.userId ?? "");
  const enteredAt = String(body?.enteredAt ?? "");
  const leftAt = String(body?.leftAt ?? "");

  if (!userId || !enteredAt || !leftAt) {
    return res.status(400).json({ error: "userId, enteredAt, leftAt are required" });
  }

  const target = store.getUser(userId);
  if (!target) return res.status(404).json({ error: "user not found" });
  if (target.isAdmin) {
    return res.status(400).json({ error: "cannot create logs for admin user" });
  }

  const enteredMs = new Date(enteredAt).getTime();
  const leftMs = new Date(leftAt).getTime();
  if (!Number.isFinite(enteredMs) || !Number.isFinite(leftMs)) {
    return res.status(400).json({ error: "invalid datetime format" });
  }
  if (enteredMs >= leftMs) {
    return res.status(400).json({ error: "enteredAt must be before leftAt" });
  }

  const log = store.insertPresenceLog({
    userId,
    enteredAt: new Date(enteredMs).toISOString(),
    leftAt: new Date(leftMs).toISOString(),
  });
  return res.status(201).json({ log });
});

// DELETE /api/admin/logs/:id : 在室ログを1件削除。{ adminPassword } 必須
adminRouter.delete("/logs/:id", (req, res) => {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) return res.status(403).json({ error: "admin required" });
  if (!ensureAdminPassword(req, res, admin)) return;

  const ok = store.deleteLogById(req.params.id);
  if (!ok) return res.status(404).json({ error: "log not found" });
  return res.json({ ok: true });
});
