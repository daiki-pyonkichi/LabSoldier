import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import { usePresencePing } from "./hooks/usePresencePing";
import { PresenceList } from "./components/PresenceList";
import { ManualCheckin } from "./components/ManualCheckin";
import { TodoList } from "./components/TodoList";
import { AvatarModal } from "./components/AvatarModal";
import { PasswordChangeModal } from "./components/PasswordChangeModal";
import { AccountDeleteModal } from "./components/AccountDeleteModal";
import { HeaderMenu } from "./components/HeaderMenu";
import { Login } from "./pages/Login";
import { Ranking } from "./pages/Ranking";
import { Logs } from "./pages/Logs";
import { Admin } from "./pages/Admin";
import type { PresenceView, User } from "./types";

type Tab = "home" | "ranking" | "logs" | "admin";

function App() {
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [presences, setPresences] = useState<PresenceView[]>([]);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    const storedUser = api.getStoredUser();
    if (storedUser) setMe(storedUser);

    api
      .me()
      .then((u) => setMe(u))
      .finally(() => setLoading(false));
  }, []);

  const fetchPresences = useCallback(async () => {
    try {
      const data = await api.listPresences();
      setPresences(data);
      setPresenceError(null);
    } catch (e) {
      setPresenceError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    fetchPresences();
    const id = setInterval(fetchPresences, 15_000);
    return () => clearInterval(id);
  }, [me, fetchPresences]);

  const myPresence = me ? presences.find((p) => p.userId === me.id) : null;
  const manualOff = myPresence?.manualOff ?? false;
  const isPresent = myPresence?.status === "present";

  // ログイン中かつ退室中でない時のみ ping を発信。管理者は在室判定の対象外。
  usePresencePing(me !== null && !manualOff && !me.isAdmin);

  const logout = () => {
    api.clearToken();
    setMe(null);
    setPresences([]);
  };

  if (loading) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: 80 }}>
        ▸ BOOTING…
      </p>
    );
  }
  if (!me) return <Login onLogin={setMe} />;

  return (
    <>
      <header className="ops-bar">
        <div>
          <span className="tag">Lab Presence HUD</span>
          <h1 className="ops-bar__title">
            Lab<em>Soldier</em>
          </h1>
          <p className="ops-bar__sub">研究室の戦況を可視化する</p>
        </div>
        <div className="ops-bar__user">
          <span className="who">{me.name}</span>
          {me.isAdmin && <span className="admin-tag">ADMIN</span>}
          <HeaderMenu
            // 管理者にはキャラクターを持たせないので、キャラ変更メニューも出さない
            onAvatarChange={me.isAdmin ? undefined : () => setAvatarModalOpen(true)}
            // パスワード変更は全アカウント共通で可能
            onChangePassword={() => setPasswordModalOpen(true)}
            // 管理者は自身のアカウントを削除できないようメニュー項目自体を出さない
            onDeleteAccount={me.isAdmin ? undefined : () => setDeleteModalOpen(true)}
            onLogout={logout}
          />
        </div>
      </header>

      {avatarModalOpen && (
        <AvatarModal
          current={me.avatarId}
          onClose={() => setAvatarModalOpen(false)}
          onSaved={(u) => setMe(u)}
        />
      )}
      {passwordModalOpen && (
        <PasswordChangeModal onClose={() => setPasswordModalOpen(false)} />
      )}
      {deleteModalOpen && (
        <AccountDeleteModal
          onClose={() => setDeleteModalOpen(false)}
          onDeleted={() => {
            setDeleteModalOpen(false);
            setMe(null);
            setPresences([]);
          }}
        />
      )}
      <div className="nav-tabs">
        <button
          className={activeTab === "home" ? "active" : ""}
          onClick={() => setActiveTab("home")}
        >
          Home
        </button>
        <button
          className={activeTab === "ranking" ? "active" : ""}
          onClick={() => setActiveTab("ranking")}
        >
          Ranking
        </button>
        <button
          className={activeTab === "logs" ? "active" : ""}
          onClick={() => setActiveTab("logs")}
        >
          Logs
        </button>
        {me.isAdmin && (
          <button
            className={activeTab === "admin" ? "active" : ""}
            onClick={() => setActiveTab("admin")}
          >
            Admin
          </button>
        )}
      </div>

      {activeTab === "home" && (
        <>
          <PresenceList
            presences={presences}
            error={presenceError}
            // 手動設定は独立カードをやめ、Roster ヘッダー右上に小さく置く。
            // 管理者は在室判定対象外なので出さない。
            headerExtra={
              !me.isAdmin ? (
                <ManualCheckin
                  manualOff={manualOff}
                  present={isPresent}
                  onChanged={fetchPresences}
                  compact
                />
              ) : undefined
            }
          />
          {/* 研究室のやることリスト。担当者は在室メンバーから選択 */}
          <TodoList
            users={presences.map((p) => ({ id: p.userId, name: p.name }))}
          />
        </>
      )}
      {activeTab === "ranking" && <Ranking meId={me.id} />}
      {activeTab === "logs" && (
        <Logs
          meId={me.id}
          isAdmin={me.isAdmin}
          users={presences.map((p) => ({
            id: p.userId,
            name: p.name,
            avatarId: p.avatarId,
            createdAt: "",
            isAdmin: false,
          }))}
        />
      )}
      {activeTab === "admin" && me.isAdmin && <Admin meId={me.id} />}
    </>
  );
}

export default App;
