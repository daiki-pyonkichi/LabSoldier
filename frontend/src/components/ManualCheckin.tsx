import { useState } from "react";
import { api } from "../api/client";

/**
 * 退室トグル。
 * - 通常時: 「退室する」ボタン。押下で manualOff=true、以降の ping は無視される
 * - 退室中: 「在室を再開する」ボタン。押下で manualOff=false、次の ping から自動判定に戻る
 *
 * 状態 (manualOff) は親 (App.tsx) から渡される。
 */
const ROLE_DESC =
  "在室判定の手動切り替え。「退室」を押すと Wi-Fi の自動在室判定をオフにして退室扱いにします。「在室を再開」で自動判定に戻ります。";

export function ManualCheckin({
  manualOff,
  present,
  onChanged,
  compact = false,
}: {
  manualOff: boolean;
  /** 現在「在室中」か。在室中のときだけ退室できる */
  present: boolean;
  onChanged: () => void;
  /** Roster ヘッダー右上に小さく置くためのコンパクト表示 */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // 退室できるのは在室中のときだけ。退室中(manualOff)は「在室を再開」なので常に押せる。
  const disabled = busy || (!manualOff && !present);

  const handle = async () => {
    // 退室は誤操作を防ぐため確認を挟む（在室再開は確認なし）
    if (!manualOff && !window.confirm("本当に退室しますか？")) return;
    setBusy(true);
    setMsg("");
    try {
      if (manualOff) {
        await api.resume();
        // resume だけだと is_present=false のまま次の ping(最大60秒) まで反映が遅れるので
        // 即座に 1 回 ping を発火して在室判定を行う
        await api.ping().catch(() => undefined);
        setMsg("在室判定を再開しました");
      } else {
        await api.leave();
        setMsg("退室にしました");
      }
      onChanged();
    } catch (e) {
      setMsg(`失敗: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // Roster ヘッダー右上に置く小さなコントロール。役割はツールチップ(title)で説明する。
  if (compact) {
    return (
      <div className="manual-inline" title={ROLE_DESC}>
        <span
          className={`manual-inline__state ${manualOff ? "is-off" : !present ? "is-away" : ""}`}
        >
          {manualOff ? "退室中" : present ? "在室中" : "不在"}
        </span>
        <button
          type="button"
          className={`manual-inline__btn ${manualOff ? "is-resume" : ""}`}
          disabled={disabled}
          onClick={handle}
          aria-label={ROLE_DESC}
          title={!manualOff && !present ? "在室中のみ退室できます" : undefined}
        >
          {busy ? "…" : manualOff ? "在室を再開" : "退室する"}
        </button>
      </div>
    );
  }

  return (
    <section className="card">
      <div className="card__head">
        <h2>手動設定</h2>
      </div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        {manualOff
          ? "現在「退室中」です。再開するまで Wi-Fi 自動判定はオフ。"
          : present
            ? "明示的に退室する場合のみ押してください。"
            : "在室中のみ退室できます。"}
      </p>
      <div className="manual-row">
        <button
          className="primary"
          disabled={disabled}
          onClick={handle}
        >
          {busy ? "…" : manualOff ? "在室を再開する" : "退室する"}
        </button>
        <span className="spacer" />
        {msg && <small>{msg}</small>}
      </div>
    </section>
  );
}
