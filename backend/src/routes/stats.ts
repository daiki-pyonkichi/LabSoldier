import { Router } from "express";
import { store } from "../db/store.js";
import { getAuthenticatedUser } from "../middleware/auth.js";

export const statsRouter = Router();

// GET /api/stats/ranking?period=week|month|all
statsRouter.get("/ranking", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const period = (req.query.period as string) ?? "week";
  if (!["week", "month", "all"].includes(period)) {
    return res.status(400).json({ error: "period must be week|month|all" });
  }

  const periodStart = getPeriodStart(period as "week" | "month" | "all");
  const rows = store.getRanking(periodStart.toISOString());

  // 現在在室中のユーザーの進行中セッション分を加算する
  const now = new Date();
  const presences = store.listPresences();

  const ranking = rows.map((r) => {
    const p = presences.find((x) => x.userId === r.userId);
    let totalSec = r.totalSec;

    if (p?.isPresent && p.enteredAt) {
      const enteredAt = new Date(p.enteredAt);
      // 入室時刻が集計期間内の場合だけ加算
      const sessionStart = enteredAt < periodStart ? periodStart : enteredAt;
      totalSec += Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
    }

    return { userId: r.userId, name: r.name, avatarId: r.avatarId, totalSec };
  });

  // totalSec で降順に並べ直してから rank を付ける
  ranking.sort((a, b) => b.totalSec - a.totalSec);
  const result = ranking.map((r, i) => ({ rank: i + 1, ...r }));

  return res.json({ period, ranking: result });
});

// 今週月曜・今月1日・エポックを JST 基準で返す
function getPeriodStart(period: "week" | "month" | "all"): Date {
  if (period === "all") return new Date(0);

  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowJST = new Date(Date.now() + JST_OFFSET_MS);

  if (period === "month") {
    // 今月1日 00:00 JST
    const jstMidnight = new Date(
      Date.UTC(nowJST.getUTCFullYear(), nowJST.getUTCMonth(), 1)
    );
    return new Date(jstMidnight.getTime() - JST_OFFSET_MS);
  }

  // 今週月曜 00:00 JST
  const dow = nowJST.getUTCDay(); // 0=日, 1=月, ...
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const jstMonday = new Date(
    Date.UTC(
      nowJST.getUTCFullYear(),
      nowJST.getUTCMonth(),
      nowJST.getUTCDate() - daysFromMonday
    )
  );
  return new Date(jstMonday.getTime() - JST_OFFSET_MS);
}
