import type { ReactNode } from "react";
import type { PresenceView } from "../types";
import { Character } from "./Character";

/**
 * 在室一覧の表示。
 * データ取得は親 (App.tsx) が担当し、props で受け取る。
 */
export function PresenceList({
  presences,
  error,
  headerExtra,
}: {
  presences: PresenceView[];
  error: string | null;
  /** ヘッダー右上に差し込む追加コントロール（手動設定など） */
  headerExtra?: ReactNode;
}) {
  const presentCount = presences.filter((p) => p.status === "present").length;

  // 並び順: 在室中 → 不在 / 在室中は入室が古い順（長くいる人が上） / 不在は名前順
  const sorted = [...presences].sort((a, b) => {
    const aPresent = a.status === "present";
    const bPresent = b.status === "present";
    if (aPresent !== bPresent) return aPresent ? -1 : 1;
    if (aPresent && bPresent) {
      const aT = a.enteredAt ? new Date(a.enteredAt).getTime() : Infinity;
      const bT = b.enteredAt ? new Date(b.enteredAt).getTime() : Infinity;
      return aT - bT;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <section className="card">
      <div className="card__head">
        <h2>Roster · 在室メンバー</h2>
        <span className="spacer" />
        <span className="count">
          <strong>{presentCount}</strong> active / {presences.length}
        </span>
        {headerExtra}
      </div>
      {error && <p className="auth-error">取得失敗: {error}</p>}
      <div className="character-grid">
        {sorted.map((p) => (
          <Character key={p.userId} p={p} />
        ))}
      </div>
    </section>
  );
}
