import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * パスワード変更モーダル（2段階フロー）。
 * 1) 現在のパスワードを入力 → 本人確認(verify)に成功したら次へ
 * 2) 新しいパスワードと確認用を入力 → 両者が一致したら変更を実行
 */
export function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 1段階目: 現在のパスワードを確認
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyMyPassword(current);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // 2段階目: 新パスワードと確認用の一致をチェックして変更
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      setError("新しいパスワードは8文字以上にしてください");
      return;
    }
    if (next !== confirm) {
      setError("新しいパスワードと確認用が一致しません");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changeMyPassword(current, next);
      setDone(true);
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
          <h2>パスワード変更</h2>
          <button className="modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {done ? (
          <>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
              パスワードを変更しました。
            </p>
            <div className="modal__actions">
              <button type="button" className="primary" onClick={onClose}>
                閉じる
              </button>
            </div>
          </>
        ) : step === 1 ? (
          <form onSubmit={verify} className="auth-form">
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
              まず本人確認のため、現在のパスワードを入力してください。
            </p>
            <label className="field">
              <span>現在のパスワード</span>
              <input
                type="password"
                placeholder="現在のパスワード"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>

            {error && <p className="auth-error">確認失敗: {error}</p>}

            <div className="modal__actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                キャンセル
              </button>
              <button type="submit" className="primary" disabled={busy || !current}>
                {busy ? "確認中…" : "▸ 次へ"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={change} className="auth-form">
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
              新しいパスワード（8文字以上）と確認用を入力してください。
            </p>
            <label className="field">
              <span>新しいパスワード</span>
              <input
                type="password"
                placeholder="新しいパスワード"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </label>
            <label className="field">
              <span>新しいパスワード（確認）</span>
              <input
                type="password"
                placeholder="もう一度入力"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {error && <p className="auth-error">変更失敗: {error}</p>}

            <div className="modal__actions">
              <button type="button" className="ghost" onClick={onClose} disabled={busy}>
                キャンセル
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || !next || !confirm}
              >
                {busy ? "変更中…" : "▸ パスワードを変更"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
