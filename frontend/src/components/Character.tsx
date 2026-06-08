import { useEffect, useState } from "react";
import type { PresenceView } from "../types";
import {
  AVATAR_GIFS_READY,
  avatarEmoji,
  avatarGifSrc,
} from "../avatars";

/**
 * キャラクター描画コンポーネント。
 * - 見た目(GIF/絵文字): サーバーが HP軸で算出した段階(1..6)で変化。GIF未配置時は絵文字フォールバック。
 * - HPバー: サーバー算出の HP を起点に、取得時刻からの経過分でローカル補正して表示。
 */

// HP 減少: 24時間で 100% → 0%
const DRAIN_PER_MIN = 100 / (24 * 60);
// HP 回復: 10時間で 0% → 100%
const HEAL_PER_MIN = 100 / (10 * 60);

// サーバー算出の HP を起点に、取得時刻からの経過分でローカル補正する
function computeHp(p: PresenceView, now: Date): number {
  const base = p.hp ?? 100;
  const since = p.hpAt ? (now.getTime() - new Date(p.hpAt).getTime()) / 60000 : 0;
  if (p.status === "present") {
    return Math.max(0, base - since * DRAIN_PER_MIN);
  }
  return Math.min(100, base + since * HEAL_PER_MIN);
}

// 段階に応じた絵文字サフィックス（GIF が無いときの簡易表現）
function stageSuffix(stage: number): string {
  if (stage <= 2) return "";
  if (stage === 3) return "💪";
  if (stage === 4) return "😅";
  if (stage === 5) return "😩";
  return "💀";
}

export function Character({ p }: { p: PresenceView }) {
  const minutes = p.elapsedMin ?? 0;
  const isPresent = p.status === "present";
  const stage = p.stage;
  const stateClass = isPresent ? "present" : "absent";

  const emoji = avatarEmoji(p.avatarId);
  const gifSrc = avatarGifSrc(p.avatarId, stage);

  // GIF 読み込み失敗時は絵文字にフォールバック。stage/avatar が変わるたびに再試行。
  const [gifFailed, setGifFailed] = useState(false);
  useEffect(() => setGifFailed(false), [gifSrc]);
  const showGif = AVATAR_GIFS_READY && !gifFailed;

  // 1分ごとに HP を再計算（サーバー値を起点にローカル補正）
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hp = computeHp(p, now);
  const hpPct = Math.round(hp);
  // HP に応じてバーの色を変える
  const hpColor =
    hp > 60 ? "var(--olive)" : hp > 30 ? "var(--amber)" : "var(--crimson)";

  return (
    <div className={`character ${stateClass}`}>
      <div className="avatar" aria-label={p.name}>
        {showGif ? (
          <img
            className="avatar-img"
            src={gifSrc}
            alt={p.name}
            onError={() => setGifFailed(true)}
          />
        ) : (
          `${emoji}${isPresent ? stageSuffix(stage) : ""}`
        )}
      </div>
      <div className="name">{p.name}</div>
      <div className="status">
        {isPresent ? (
          <>
            ON DUTY · <strong>{[
              Math.floor(minutes / 1440) > 0 && `${Math.floor(minutes / 1440)}d`,
              Math.floor((minutes % 1440) / 60) > 0 && `${Math.floor((minutes % 1440) / 60)}h`,
              minutes % 60 > 0 && `${minutes % 60}m`,
            ].filter(Boolean).join(" ") || "0m"}</strong>
          </>
        ) : p.status === "unknown" ? (
          <>UNKNOWN</>
        ) : (
          <>OFFLINE</>
        )}
      </div>
      <div className="hp">
        <div className="hp__label">
          <span>HP</span>
          <span className="hp__pct">{hpPct}%</span>
        </div>
        <div className="hp__bar-wrap">
          <div
            className="hp__bar"
            style={{ width: `${hpPct}%`, background: hpColor }}
          />
        </div>
      </div>
    </div>
  );
}
