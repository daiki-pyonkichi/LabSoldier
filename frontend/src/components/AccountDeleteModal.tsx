import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * アカウント削除モーダル。
 * 本人確認のため、ログイン時のパスワードをそのまま入力させる。
 * 削除が成功したら親に通知し、ログアウト状態に戻す。
 */
export function AccountDeleteModal({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe(password);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>アカウント削除</h2>
          <button className="modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
          アカウントと関連する在室ログを完全に削除します。
          <br />
          この操作は元に戻せません。
        </p>

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span>Passcode</span>
            <input
              type="password"
              placeholder="現在のパスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>

          {error && <p className="auth-error">削除失敗: {error}</p>}

          <div className="modal__actions">
            <button type="button" className="ghost" onClick={onClose} disabled={busy}>
              キャンセル
            </button>
            <button type="submit" className="primary danger" disabled={busy || !password}>
              {busy ? "削除中…" : "▸ Delete Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
