export type PresenceSource = "wifi" | "manual";
export type PresenceStatus = "present" | "unknown" | "absent";

export interface User {
  id: string;
  name: string;
  avatarId: string;
  createdAt: string;
  isAdmin: boolean;
}

export interface AuthUserRecord extends User {
  passwordHash: string;
}

export interface Presence {
  userId: string;
  isPresent: boolean;
  source: PresenceSource;
  enteredAt: string | null; // ISO8601
  lastSeenAt: string | null;
  manualOff: boolean; // 明示的「退室中」フラグ。true の間は ping を無視する
}

export interface PresenceView {
  userId: string;
  name: string;
  avatarId: string;
  status: PresenceStatus;
  lastSeenAt: string | null;
  elapsedMin: number | null;
  enteredAt: string | null;
  manualOff: boolean;
  hp: number;        // 0-100 のHP値。過去ログを再生して算出
  hpAt: string;      // HP が算出された時刻 (ISO8601)
  stage: number;     // キャラ見た目段階 1〜6 (HP軸で算出)
}//フロントへ送るやつ

export interface PresenceLog {
  id: string;
  userId: string;
  enteredAt: string;
  leftAt: string;
  durationSec: number;
}

export interface Todo {
  id: string;
  title: string;
  assigneeIds: string[];     // 担当者ユーザーIDの配列。["all"]=全員 / []=未設定
  dueDate: string | null;    // YYYY-MM-DD or null
  done: boolean;
  createdAt: string;
  createdBy: string | null;
}
