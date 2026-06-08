import type { Presence } from "../types.js";

export type PresenceStatus = "present" | "unknown" | "absent";

const PRESENT_THRESHOLD_MIN = 5;
const UNKNOWN_THRESHOLD_MIN = 30;

export function judgeStatus(p: Presence): PresenceStatus {
  // 明示的な退室中フラグは最優先（ping を無視して absent 固定）
  if (p.manualOff) return "absent";

  if (!p.lastSeenAt) return "absent";//lastSeenAtがないなら不在(初期設定)

  const elapsedMin =
    (Date.now() - new Date(p.lastSeenAt).getTime()) / 60000;//現在の時間ー最終確認時間

  if (elapsedMin < PRESENT_THRESHOLD_MIN && p.isPresent) return "present";
  if (elapsedMin < UNKNOWN_THRESHOLD_MIN) return "unknown";
  return "absent";
}

export function elapsedMinutes(lastSeenAt: string | null): number | null {
  if (!lastSeenAt) return null;
  return Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
}//最終確認時間からの経過時間を分単位で返す関数 フロントでの表示に使うかも
