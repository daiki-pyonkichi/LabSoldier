import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AVATARS, avatarNormalPngSrc } from "../avatars";
import type { User } from "../types";

/**
 * 自分のキャラクター（アバター）を変更するモーダル。
 * HOME のヘッダーから開く。保存すると /api/me (PATCH) を叩いて me を更新する。
 */
export function AvatarModal({
  current,
  onClose,
  onSaved,
}: {
  current: string;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escでも閉じられるように
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (selected === current) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const user = await api.updateAvatar(selected);
      onSaved(user);
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>キャラクター変更</h2>
          <button className="modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="avatar-picker" role="radiogroup" aria-label="アバター選択">
          {AVATARS.map((a) => (
            <AvatarOption
              key={a.id}
              meta={a}
              active={selected === a.id}
              onSelect={() => setSelected(a.id)}
            />
          ))}
        </div>

        {error && <p className="auth-error">変更失敗: {error}</p>}

        <div className="modal__actions">
          <button className="ghost" onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarOption({
  meta,
  active,
  onSelect,
}: {
  meta: (typeof AVATARS)[number];
  active: boolean;
  onSelect: () => void;
}) {
  // デフォルトの立ち絵 PNG をプレビュー。読み込み失敗時のみ絵文字にフォールバック。
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`avatar-option ${active ? "active" : ""}`}
      onClick={onSelect}
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
