import type { PresenceStatus } from "../types.js";

/**
 * キャラの見た目段階(1〜6)を HP 軸で決定する。
 * ベース:
 *   - HP > 50        → 状態1
 *   - 0 < HP ≤ 50    → 状態4
 *   - HP = 0         → 状態5
 * 特殊上書き:
 *   - 状態2 = HP>50 かつ 連続在室 3h 以上
 *   - 状態6 = HP=0 かつ HP が 0 になってから 4h 以上継続在室
 *   - 状態3 = 深夜 AM1:00〜AM4:00(JST)に状態4で「在室」
 * 上書きの有効範囲:
 *   - 状態2・6: present / unknown(在室不明・最大30分)で有効。absent では基本帯に戻る
 *   - 状態3: present のときのみ(薄表示の unknown/absent では出さない)
 */
export function computeStage(opts: {
  hp: number;
  elapsedMin: number | null;
  status: PresenceStatus;
  hpZeroAt: string | null;
  now: Date;
}): number {
  const { hp, elapsedMin, status, hpZeroAt, now } = opts;
  const overrideActive = status !== "absent"; // present | unknown
  const fullyPresent = status === "present";

  if (hp > 50) {
    if (overrideActive && (elapsedMin ?? 0) >= 180) return 2;
    return 1;
  }
  if (hp > 0) {
    // 深夜 AM1:00〜AM4:00(JST)に「在室」なら状態3（夜更かし演出）
    if (fullyPresent && isJst1to4(now)) return 3;
    return 4;
  }
  // hp <= 0
  if (
    overrideActive &&
    hpZeroAt &&
    (now.getTime() - new Date(hpZeroAt).getTime()) / 60000 >= 240
  ) {
    return 6;
  }
  return 5;
}

// JST(+9h)の時刻で AM1:00〜AM4:00 の範囲内か
function isJst1to4(now: Date): boolean {
  const h = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
  return h >= 1 && h < 4;
}
