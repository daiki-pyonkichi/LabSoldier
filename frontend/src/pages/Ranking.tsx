import { useEffect, useState } from "react";
import { api } from "../api/client";
import { avatarEmoji, avatarNormalPngSrc } from "../avatars";
import type { RankingEntry, RankingPeriod } from "../types";

const PERIOD_LABELS: { value: RankingPeriod; label: string }[] = [
  { value: "week",  label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "all",   label: "All Time" },
];

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function Ranking({ meId }: { meId: string }) {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getRanking(period)
      .then((data) => {
        setRanking(data);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [period]);

  const maxSec = ranking[0]?.totalSec ?? 1;

  return (
    <section className="card">
      <div className="card__head">
        <h2>Ranking · 在室ランキング</h2>
        <span className="spacer" />
        <div className="ranking-tabs">
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.value}
              className={period === p.value ? "active" : ""}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="auth-error">取得失敗: {error}</p>}

      {loading ? (
        <p className="muted" style={{ textAlign: "center", padding: "32px 0" }}>
          LOADING…
        </p>
      ) : (
        <div className="ranking-list">
          {ranking.map((entry) => {
            const isMe = entry.userId === meId;
            return (
              <div
                key={entry.userId}
                className={`ranking-row ${isMe ? "ranking-row--me" : ""}`}
              >
                <span className="ranking-row__rank">
                  {entry.rank <= 3
                    ? RANK_MEDALS[entry.rank - 1]
                    : `#${entry.rank}`}
                </span>
                <span className="ranking-row__avatar">
                  <RankingAvatar avatarId={entry.avatarId} name={entry.name} />
                </span>
                <span className="ranking-row__name">
                  {entry.name}
                  {isMe && <span className="ranking-row__me-tag">YOU</span>}
                </span>
                <div className="ranking-row__bar-wrap">
                  <div
                    className="ranking-row__bar"
                    style={{ width: `${(entry.totalSec / maxSec) * 100}%` }}
                  />
                </div>
                <span className="ranking-row__time">
                  {formatTime(entry.totalSec)}
                </span>
              </div>
            );
          })}
          {ranking.length === 0 && (
            <p className="muted" style={{ textAlign: "center", padding: "32px 0" }}>
              この期間のデータがありません
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// アバター PNG。読み込み失敗時のみ絵文字にフォールバック。
function RankingAvatar({ avatarId, name }: { avatarId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{avatarEmoji(avatarId)}</>;
  return (
    <img
      className="ranking-row__avatar-png"
      src={avatarNormalPngSrc(avatarId)}
      alt={name}
      onError={() => setFailed(true)}
    />
  );
}
