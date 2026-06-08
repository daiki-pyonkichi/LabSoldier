import { useEffect, useState } from "react";

/**
 * 管理者の破壊的操作（削除 / パスワード変更）前に、本人パスワードを求めるモーダル。
 * onConfirm は async で、例外を投げればモーダル内にエラー表示する。成功時は親が onClose を呼ぶ想定。
 */
export function PasswordConfirmModal({
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
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
      await onConfirm(password);
      // 成功時のクローズは親に任せる（モーダルを残して再利用したいケースもあるため）
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
          <h2>{title}</h2>
          <button className="modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {description && (
          <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            {description}
          </p>
        )}

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span>Admin Passcode</span>
            <input
              type="password"
              placeholder="管理者の現在のパスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <div className="modal__actions">
            <button type="button" className="ghost" onClick={onClose} disabled={busy}>
              キャンセル
            </button>
            <button
              type="submit"
              className={destructive ? "primary danger" : "primary"}
              disabled={busy || !password}
            >
              {busy ? "処理中…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
