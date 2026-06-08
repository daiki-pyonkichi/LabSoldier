import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { PasswordConfirmModal } from "../components/PasswordConfirmModal";
import type { User } from "../types";

/**
 * 管理者専用ページ。
 * - 全ユーザー一覧
 * - パスワード再設定（admin 本人のパスワード再確認必須）
 * - アカウント削除（admin 本人のパスワード再確認必須）
 */
export function Admin({ meId }: { meId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  // パスワード再設定は 2 ステップ: 新パスワード入力 → admin 本人パスワード確認
  const [resetStep, setResetStep] = useState<"new" | "confirm">("new");
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.adminListUsers();
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // パスワード再設定: 新パスワードを先に決めた後、admin 本人パスワード入力モーダルへ
  const onResetConfirm = async (adminPassword: string) => {
    if (!pendingReset) return;
    setActionBusy(pendingReset.id);
    try {
      await api.adminResetPassword(pendingReset.id, newPassword, adminPassword);
      setNotice(`${pendingReset.name} のパスワードを変更しました`);
      setPendingReset(null);
      setNewPassword("");
      setResetStep("new");
    } finally {
      setActionBusy(null);
    }
  };

  // 削除: admin 本人パスワード入力モーダルへ
  const onDeleteConfirm = async (adminPassword: string) => {
    if (!pendingDelete) return;
    setActionBusy(pendingDelete.id);
    try {
      await api.adminDeleteUser(pendingDelete.id, adminPassword);
      setNotice(`${pendingDelete.name} を削除しました`);
      setPendingDelete(null);
      await load();
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <section className="card">
      <div className="card__head">
        <h2>Admin Console</h2>
        <span className="spacer" />
        <span className="count">
          <strong>{users.length}</strong>USERS
        </span>
      </div>

      {notice && (
        <p
          className="muted"
          style={{
            borderLeft: "2px solid var(--olive)",
            paddingLeft: 10,
            color: "var(--olive)",
            marginTop: 0,
          }}
        >
          {notice}
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}

      {loading ? (
        <p className="muted">▸ Loading…</p>
      ) : (
        <ul className="admin-list">
          {users.map((u) => (
            <li key={u.id} className="admin-row">
              <div className="admin-row__info">
                <span className="admin-row__name">{u.name}</span>
                {u.isAdmin && <span className="admin-row__badge">ADMIN</span>}
                {u.id === meId && <span className="admin-row__badge admin-row__badge--me">YOU</span>}
                <span className="admin-row__sub">{u.id}</span>
              </div>
              <div className="admin-row__actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={actionBusy === u.id}
                  onClick={() => {
                    setPendingReset(u);
                    setNewPassword("");
                    setResetStep("new");
                  }}
                >
                  パスワード変更
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={actionBusy === u.id || u.id === meId}
                  onClick={() => setPendingDelete(u)}
                  title={u.id === meId ? "自分は削除できません" : undefined}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 1段階目: 新しいパスワードを入力 */}
      {pendingReset && resetStep === "new" && (
        <div
          className="modal-overlay"
          onMouseDown={() => {
            setPendingReset(null);
            setNewPassword("");
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h2>パスワード再設定</h2>
              <button
                className="modal__close"
                onClick={() => {
                  setPendingReset(null);
                  setNewPassword("");
                }}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              対象: <strong>{pendingReset.name}</strong>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newPassword.length >= 8) setResetStep("confirm");
              }}
              className="auth-form"
            >
              <label className="field">
                <span>New Passcode</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8文字以上"
                  autoComplete="new-password"
                  autoFocus
                />
              </label>
              <div className="modal__actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setPendingReset(null);
                    setNewPassword("");
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={newPassword.length < 8}
                >
                  次へ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2段階目: admin 自身のパスワードで本人確認 */}
      {pendingReset && resetStep === "confirm" && (
        <PasswordConfirmModal
          title="パスワード再設定の確認"
          description={`${pendingReset.name} のパスワードを変更します。管理者本人のパスワードを入力してください。`}
          confirmLabel="変更を確定"
          onConfirm={onResetConfirm}
          onClose={() => {
            // 2段階目のキャンセルでは新パスワードを保ったまま 1段階目へ戻す
            setResetStep("new");
          }}
        />
      )}

      {/* 削除: admin 本人のパスワード確認 */}
      {pendingDelete && (
        <PasswordConfirmModal
          title="アカウント削除の確認"
          description={`${pendingDelete.name} を完全に削除します。この操作は元に戻せません。管理者本人のパスワードを入力してください。`}
          confirmLabel="削除する"
          destructive
          onConfirm={onDeleteConfirm}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
