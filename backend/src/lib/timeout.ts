import { db } from "../db/database.js";
import { store } from "../db/store.js";

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

export function startTimeoutSweep() {
  const findStaleStmt = db.prepare(`
    SELECT user_id, entered_at, last_seen_at
    FROM presence
    WHERE source = 'wifi'
      AND entered_at IS NOT NULL
      AND last_seen_at IS NOT NULL
      AND (julianday('now') - julianday(last_seen_at)) * 86400 * 1000 > ?
  `);
  const clearStmt = db.prepare(
    `UPDATE presence SET entered_at = NULL WHERE user_id = ?`,
  );

  setInterval(() => {
    const stale = findStaleStmt.all(STALE_THRESHOLD_MS) as Array<{
      user_id: string;
      entered_at: string;
      last_seen_at: string;
    }>;

    for (const row of stale) {
      store.insertPresenceLog({
        userId: row.user_id,
        enteredAt: row.entered_at,
        leftAt: row.last_seen_at,
      });
      clearStmt.run(row.user_id);
    }

    if (stale.length > 0) {
      console.log(
        `[timeout] logged & cleared ${stale.length} stale session(s)`,
      );
    }
  }, 60 * 1000);
}
