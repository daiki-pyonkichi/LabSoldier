import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Todo } from "../types";

/**
 * 研究室のやることリスト（To-Do）。
 * - 登録: するべきこと / 担当者 / 期限 をまとめて登録（すべて空欄でも可）
 * - 担当者は登録メンバーからドロップダウンで複数選択可能。「全員」も用意
 * - 期限は日付のみ／時刻付きを選べる
 * - 登録すると チェックボックス・編集・削除 が付いた行になる
 * - 完了チェック後 10 秒間は取り消しボタンを表示（誤操作対策）
 * - チェックすると「完了済み」へ移動。完了済みは折りたたみで開閉でき、タスクへ戻せる
 *
 * 全員で共有する想定なので、表示用にメンバー一覧 (users) を親から受け取る。
 */
type Member = { id: string; name: string };

const UNDO_MS = 10_000; // 完了取り消しボタンを出しておく時間

/**
 * 担当者を複数選択するドロップダウン。
 * 人数が増えても溢れないよう、選択欄＋ドロップダウン内のチェックボックスで選ぶ。
 * - 「全員」を選ぶと個人選択はクリアされ ["all"] になる
 * - 個人を選ぶと「全員」は解除される
 */
function AssigneePicker({
  users,
  value,
  onChange,
}: {
  users: Member[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // ドロップダウンは名前順で表示
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  const isAll = value.includes("all");
  const toggleAll = () => onChange(isAll ? [] : ["all"]);
  const toggleUser = (id: string) => {
    const base = isAll ? [] : value;
    onChange(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  const label =
    value.length === 0
      ? "担当者（未設定）"
      : isAll
        ? "全員"
        : value.map((id) => users.find((u) => u.id === id)?.name ?? "不明").join("・");

  return (
    <div className="todo-picker" ref={ref}>
      <button
        type="button"
        className="todo-picker__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        👤 {label} ▾
      </button>
      {open && (
        <div className="todo-picker__dropdown">
          <ul className="todo-picker__list">
            <li>
              <label className="todo-picker__row">
                <input type="checkbox" checked={isAll} onChange={toggleAll} />
                <span>全員</span>
              </label>
            </li>
            {sortedUsers.length === 0 && (
              <li className="muted" style={{ padding: 12, textAlign: "center" }}>
                メンバーがいません
              </li>
            )}
            {sortedUsers.map((u) => (
              <li key={u.id}>
                <label className="todo-picker__row">
                  <input
                    type="checkbox"
                    checked={value.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  <span>{u.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 期限入力。日付のみ／時刻付きを切り替えられる。
 * 値は "YYYY-MM-DD" または "YYYY-MM-DDTHH:MM" の文字列（空文字＝未設定）。
 */
function DueInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [withTime, setWithTime] = useState(value.includes("T"));

  const toggleWithTime = (next: boolean) => {
    setWithTime(next);
    if (!value) return;
    if (next && !value.includes("T")) onChange(`${value}T00:00`);
    if (!next && value.includes("T")) onChange(value.slice(0, 10));
  };

  return (
    <div className="todo-due">
      {withTime ? (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="期限（日時）"
        />
      ) : (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="期限（日付）"
        />
      )}
      <label className="todo-due__time-toggle">
        <input
          type="checkbox"
          checked={withTime}
          onChange={(e) => toggleWithTime(e.target.checked)}
        />
        時刻も指定
      </label>
    </div>
  );
}

/**
 * タスク行右上のケバブ(⋮)メニュー。モバイルで編集/削除を集約して場所を取らないようにする。
 * 表示の出し分け（モバイルのみ表示）は CSS 側で行う。
 */
function TodoItemMenu({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="todo-item__menu" ref={ref}>
      <button
        type="button"
        className="btn ghost todo-item__menu-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="メニュー"
      >
        ⋮
      </button>
      {open && (
        <div className="todo-item__menu-dropdown" role="menu">
          {onEdit && (
            <button type="button" role="menuitem" onClick={run(onEdit)}>
              編集
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="todo-item__menu-danger"
            onClick={run(onDelete)}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

// 期限の表示用フォーマット
function formatDue(dueDate: string | null): string {
  if (!dueDate) return "期限なし";
  return dueDate.includes("T") ? dueDate.replace("T", " ") : dueDate;
}

export function TodoList({ users }: { users: Member[] }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 新規登録フォームの状態
  const [title, setTitle] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  // 完了済みの開閉
  const [showDone, setShowDone] = useState(false);

  // 編集中の行 id
  const [editingId, setEditingId] = useState<string | null>(null);

  // 直前に完了にしたタスク（10秒間 取り消しボタンを出す）
  const [undoId, setUndoId] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTodos = useCallback(async () => {
    try {
      const data = await api.listTodos();
      setTodos(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // アンマウント時にタイマーを片付ける
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const assigneeLabel = (ids: string[]): string => {
    if (ids.length === 0) return "未設定";
    if (ids.includes("all")) return "全員";
    return ids.map((id) => users.find((u) => u.id === id)?.name ?? "不明").join("・");
  };

  const handleAdd = async () => {
    setBusy(true);
    try {
      await api.createTodo({
        title: title.trim(),
        assigneeIds,
        dueDate: due === "" ? null : due,
      });
      setTitle("");
      setAssigneeIds([]);
      setDue("");
      await fetchTodos();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const armUndo = (id: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoId(id);
    undoTimer.current = setTimeout(() => setUndoId(null), UNDO_MS);
  };

  const toggleDone = async (todo: Todo) => {
    const nextDone = !todo.done;
    try {
      await api.setTodoDone(todo.id, nextDone);
      // 未完了→完了 のときだけ「取り消し」を出す
      if (nextDone) armUndo(todo.id);
      else if (undoId === todo.id) setUndoId(null);
      await fetchTodos();
    } catch (e) {
      setError(String(e));
    }
  };

  const undoComplete = async (id: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoId(null);
    try {
      await api.setTodoDone(id, false);
      await fetchTodos();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("このタスクを削除しますか？")) return;
    try {
      await api.deleteTodo(id);
      await fetchTodos();
    } catch (e) {
      setError(String(e));
    }
  };

  // 期限の早い順に並べる。期限なし(null)は末尾。同じ期限は元の順を維持。
  const byDue = (a: Todo, b: Todo) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  };
  const active = todos.filter((t) => !t.done).sort(byDue);
  const done = todos.filter((t) => t.done).sort(byDue);
  const undoTodo = undoId ? todos.find((t) => t.id === undoId && t.done) : null;

  return (
    <section className="card">
      <div className="card__head">
        <h2>To Do</h2>
        <span className="spacer" />
        <span className="count">
          <strong>{active.length}</strong> TASKS
        </span>
      </div>

      {/* 登録フォーム */}
      <div className="todo-form">
        <input
          type="text"
          placeholder="するべきこと（例: イベントの幹事）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <AssigneePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
        <DueInput value={due} onChange={setDue} />
        <button className="primary" disabled={busy} onClick={handleAdd}>
          {busy ? "…" : "登録"}
        </button>
      </div>

      {error && <p className="muted" style={{ color: "var(--crimson)" }}>{error}</p>}

      {/* 完了取り消しバナー（10秒間） */}
      {undoTodo && (
        <div className="todo-undo">
          <span>「{undoTodo.title || "(無題)"}」を完了にしました</span>
          <button className="btn ghost" onClick={() => undoComplete(undoTodo.id)}>
            ↩ 取り消し
          </button>
        </div>
      )}

      {/* タスク欄（未完了） */}
      <ul className="todo-list">
        {active.length === 0 && (
          <li className="todo-empty muted">タスクはありません</li>
        )}
        {active.map((t) =>
          editingId === t.id ? (
            <TodoEditRow
              key={t.id}
              todo={t}
              users={users}
              onCancel={() => setEditingId(null)}
              onSaved={async () => {
                setEditingId(null);
                await fetchTodos();
              }}
              onError={setError}
            />
          ) : (
            <li key={t.id} className="todo-item">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleDone(t)}
                aria-label="完了にする"
              />
              <div className="todo-main">
                <span className="todo-title">{t.title || "(無題)"}</span>
                <span className="todo-meta">
                  <span className="todo-chip">👤 {assigneeLabel(t.assigneeIds)}</span>
                  <span className="todo-chip">📅 {formatDue(t.dueDate)}</span>
                </span>
              </div>
              {/* デスクトップ: 横並びボタン / モバイル: 右上のケバブメニュー（CSSで出し分け） */}
              <div className="todo-actions">
                <button className="btn ghost" onClick={() => setEditingId(t.id)}>
                  編集
                </button>
                <button className="btn danger" onClick={() => remove(t.id)}>
                  削除
                </button>
              </div>
              <TodoItemMenu
                onEdit={() => setEditingId(t.id)}
                onDelete={() => remove(t.id)}
              />
            </li>
          ),
        )}
      </ul>

      {/* 完了済み（折りたたみ） */}
      <button className="btn ghost todo-done-toggle" onClick={() => setShowDone((v) => !v)}>
        {showDone ? "▼" : "▶"} 完了済み（{done.length}）
      </button>
      {showDone && (
        <ul className="todo-list todo-list--done">
          {done.length === 0 && (
            <li className="todo-empty muted">完了済みはありません</li>
          )}
          {done.map((t) => (
            <li key={t.id} className="todo-item todo-item--done">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggleDone(t)}
                aria-label="タスクへ戻す"
              />
              <div className="todo-main">
                <span className="todo-title">{t.title || "(無題)"}</span>
                <span className="todo-meta">
                  <span className="todo-chip">👤 {assigneeLabel(t.assigneeIds)}</span>
                  <span className="todo-chip">📅 {formatDue(t.dueDate)}</span>
                </span>
              </div>
              <div className="todo-actions">
                <button className="btn danger" onClick={() => remove(t.id)}>
                  削除
                </button>
              </div>
              <TodoItemMenu onDelete={() => remove(t.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 1行ぶんのインライン編集フォーム */
function TodoEditRow({
  todo,
  users,
  onCancel,
  onSaved,
  onError,
}: {
  todo: Todo;
  users: Member[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(todo.assigneeIds);
  const [due, setDue] = useState(todo.dueDate ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateTodo(todo.id, {
        title: title.trim(),
        assigneeIds,
        dueDate: due === "" ? null : due,
      });
      await onSaved();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="todo-item todo-item--editing">
      <div className="todo-form">
        <input
          type="text"
          placeholder="するべきこと"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <AssigneePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
        <DueInput value={due} onChange={setDue} />
        <button className="primary" disabled={busy} onClick={save}>
          {busy ? "…" : "保存"}
        </button>
        <button className="btn ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </li>
  );
}
