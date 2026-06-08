import { useEffect } from "react";
import { api } from "../api/client";

/**
 * 1分間隔でサーバーにping。
 * 担当: フロントロジック係
 *   - タブが非表示のときの間隔調整、エラー時のリトライ等
 */
export function usePresencePing(enabled: boolean, intervalMs = 60_000) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const send = async () => {
      try {
        await api.ping();
      } catch (e) {
        console.warn("[ping] failed", e);
      }
    };

    send(); // 起動直後に1回
    const id = setInterval(() => {
      if (!cancelled) send();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
