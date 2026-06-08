import { useEffect, useRef, useState } from "react";

/**
 * ヘッダー右上のハンバーガーメニュー。
 * - キャラ変更 / アカウント削除 / Logout を集約
 * - 機能追加時はここに項目を増やす
 */
export function HeaderMenu({
  onAvatarChange,
  onChangePassword,
  onDeleteAccount,
  onLogout,
}: {
  // キャラ変更が不要なユーザー（管理者など）では undefined を渡す → 項目自体を出さない
  onAvatarChange?: () => void;
  // パスワード変更。不要なユーザーでは undefined を渡す → 項目自体を出さない
  onChangePassword?: () => void;
  // 管理者など、自分でアカウント削除させたくないユーザーでは undefined を渡す → 項目自体を出さない
  onDeleteAccount?: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="header-menu" ref={wrapperRef}>
      <button
        type="button"
        className="ghost header-menu__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="メニュー"
      >
        <span className="header-menu__bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && (
        <div className="header-menu__dropdown" role="menu">
          {onAvatarChange && (
            <button type="button" role="menuitem" onClick={run(onAvatarChange)}>
              キャラ変更
            </button>
          )}
          {onChangePassword && (
            <button type="button" role="menuitem" onClick={run(onChangePassword)}>
              パスワード変更
            </button>
          )}
          {onDeleteAccount && (
            <button
              type="button"
              role="menuitem"
              className="header-menu__danger"
              onClick={run(onDeleteAccount)}
            >
              アカウント削除
            </button>
          )}
          <button type="button" role="menuitem" onClick={run(onLogout)}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
