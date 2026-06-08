import { Router } from "express";
import { store } from "../db/store.js";
import { getAuthenticatedUser } from "../middleware/auth.js";

export const logsRouter = Router();

// GET /api/logs?userId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// userId なし → 全員、from/to 両方なし → 全期間
// セッションの一部でも [from, to+1日) と重なれば対象
logsRouter.get("/", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const fromStr = typeof req.query.from === "string" ? req.query.from : undefined;
  const toStr = typeof req.query.to === "string" ? req.query.to : undefined;

  let dateUtcStart: string | undefined;
  let dateUtcEnd: string | undefined;

  if (fromStr || toStr) {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (fromStr && !ymd.test(fromStr)) return res.status(400).json({ error: "from must be YYYY-MM-DD" });
    if (toStr && !ymd.test(toStr)) return res.status(400).json({ error: "to must be YYYY-MM-DD" });
    // 片方しか指定されていなければ同じ日付として扱う
    const start = fromStr ?? toStr!;
    const end = toStr ?? fromStr!;
    const jstStart = new Date(`${start}T00:00:00+09:00`);
    const jstEnd = new Date(`${end}T00:00:00+09:00`);
    jstEnd.setDate(jstEnd.getDate() + 1); // 終端は翌日0時
    dateUtcStart = jstStart.toISOString();
    dateUtcEnd = jstEnd.toISOString();
  }

  const logs = store.listLogs({ userId, dateUtcStart, dateUtcEnd });
  return res.json({ logs });
});

// GET /api/logs/stats?userId=&from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=day|week|month
// 指定ユーザーの粒度別在室時間（グラフ用）
logsRouter.get("/stats", (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const userId = typeof req.query.userId === "string" ? req.query.userId : user.id;
  const fromStr = typeof req.query.from === "string" ? req.query.from : undefined;
  const toStr = typeof req.query.to === "string" ? req.query.to : undefined;
  const bucket = (typeof req.query.bucket === "string" ? req.query.bucket : "day") as
    | "day" | "week" | "month";

  if (!fromStr || !toStr) {
    return res.status(400).json({ error: "from and to (YYYY-MM-DD) are required" });
  }
  if (!["day", "week", "month"].includes(bucket)) {
    return res.status(400).json({ error: "bucket must be day|week|month" });
  }

  const fromUtc = new Date(`${fromStr}T00:00:00+09:00`).toISOString();
  const toUtc = new Date(`${toStr}T00:00:00+09:00`);
  toUtc.setDate(toUtc.getDate() + 1);
  const toUtcIso = toUtc.toISOString();

  const sessions = store.getDailyStats(userId, fromUtc, toUtcIso);

  // セッションを JST の日付ごとに分割
  const JST = 9 * 60 * 60 * 1000;
  const dailyMap = new Map<string, number>();

  for (const s of sessions) {
    let cursor = new Date(s.enteredAt).getTime();
    const end = new Date(s.leftAt).getTime();

    while (cursor < end) {
      const cursorJST = new Date(cursor + JST);
      const dateKey = cursorJST.toISOString().slice(0, 10);
      const nextDayJST = new Date(
        Date.UTC(cursorJST.getUTCFullYear(), cursorJST.getUTCMonth(), cursorJST.getUTCDate() + 1)
      ).getTime() - JST;
      const sliceEnd = Math.min(end, nextDayJST);
      const sec = Math.floor((sliceEnd - cursor) / 1000);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + sec);
      cursor = sliceEnd;
    }
  }

  // 粒度に応じたキーで再集計
  const bucketMap = new Map<string, number>();
  for (const [dateStr, sec] of dailyMap) {
    const key = bucketKey(dateStr, bucket);
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + sec);
  }

  const stats = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, totalSec]) => ({ key, totalSec }));

  return res.json({ userId, bucket, stats });
});

// 日付文字列 (YYYY-MM-DD) を粒度別のキーに変換
function bucketKey(dateStr: string, bucket: "day" | "week" | "month"): string {
  if (bucket === "day") return dateStr;
  if (bucket === "month") return dateStr.slice(0, 7); // YYYY-MM

  // week: 週の月曜日の YYYY-MM-DD
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const dow = d.getUTCDay(); // UTC値だがJST 0時の Date なので曜日として有効
  // 上の解釈は紛らわしいので確実に: JST の年月日からローカル Date を作って曜日を取る
  const [y, m, day] = dateStr.split("-").map(Number);
  const local = new Date(y, m - 1, day);
  const localDow = local.getDay(); // 0=日
  const daysFromMon = localDow === 0 ? 6 : localDow - 1;
  local.setDate(local.getDate() - daysFromMon);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
