import { useState } from "react";
import { api } from "../api/client";
import { AVATARS, avatarNormalPngSrc } from "../avatars";
import type { User } from "../types";

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 新規登録時、確認用パスワードが一致しているか
  const passwordMismatch =
    mode === "signup" && passwordConfirm.length > 0 && password !== passwordConfirm;
  const canSubmit =
    !busy &&
    !!name.trim() &&
    !!password &&
    (mode === "login" || (passwordConfirm.length > 0 && password === passwordConfirm));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && password !== passwordConfirm) {
      setError("パスワードが一致しません");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const credentials = { name: name.trim(), password };
      const user = mode === "login"
        ? await api.login(credentials)
        : await api.signup({ ...credentials, avatarId });
      onLogin(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${mode === "login" ? "ログイン" : "登録"}に失敗しました: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  // タブ切り替え時に確認用パスワードとエラーをリセット
  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setPasswordConfirm("");
    setError(null);
  };

  return (
    <section className="terminal" aria-label="認証ターミナル">
      <div className="terminal__brand">
        <span className="dot" aria-hidden />
        <span>LabSoldier</span>
      </div>
      <h1 className="terminal__title">
        Lab<em>Soldier</em>
      </h1>

      <div className="auth-tabs" role="tablist" aria-label="認証モード">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "active" : ""}
          onClick={() => switchMode("login")}
        >
          Sign-In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "active" : ""}
          onClick={() => switchMode("signup")}
        >
          Enlist
        </button>
      </div>

      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span>User ID</span>
          <input
            type="text"
            placeholder="あなたのコードネーム"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Passcode</span>
          <input
            type="password"
            placeholder="8文字以上"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {mode === "signup" && (
          <label className="field">
            <span>Passcode（確認）</span>
            <input
              type="password"
              placeholder="もう一度入力"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              aria-invalid={passwordMismatch}
            />
            {passwordMismatch && (
              <small className="field__error">パスワードが一致しません</small>
            )}
          </label>
        )}
        {mode === "signup" && (
          <div className="field">
            <span>Avatar</span>
            <div className="avatar-picker" role="radiogroup" aria-label="アバター選択">
              {AVATARS.map((a) => (
                <AvatarPngOption
                  key={a.id}
                  meta={a}
                  active={avatarId === a.id}
                  onSelect={() => setAvatarId(a.id)}
                />
              ))}
              {/* 今後追加予定の枠 */}
              <div className="avatar-option avatar-option--soon" aria-disabled="true">
                <span className="avatar-option__label">Coming soon…</span>
              </div>
              <div className="avatar-option avatar-option--soon" aria-disabled="true">
                <span className="avatar-option__label">Coming soon…</span>
              </div>
            </div>
          </div>
        )}
        <button className="primary" disabled={!canSubmit}>
          {busy
            ? "認証中..."
            : mode === "login"
              ? "▸ Authenticate"
              : "▸ Deploy"}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}
    </section>
  );
}

// PNG が無いときは絵文字にフォールバック
function AvatarPngOption({
  meta,
  active,
  onSelect,
}: {
  meta: (typeof AVATARS)[number];
  active: boolean;
  onSelect: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`avatar-option ${active ? "active" : ""}`}
      onClick={onSelect}
      title={meta.label}
    >
      {imgFailed ? (
        <span className="avatar-option__face">{meta.emoji}</span>
      ) : (
        <img
          className="avatar-option__png"
          src={avatarNormalPngSrc(meta.id)}
          alt={meta.label}
          onError={() => setImgFailed(true)}
        />
      )}
      <span className="avatar-option__label">{meta.label}</span>
    </button>
  );
}
