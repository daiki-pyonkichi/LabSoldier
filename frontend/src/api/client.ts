import { authStorage } from "./authStorage";
import type {
  AuthResponse,
  LoginCredentials,
  PresenceLogEntry,
  PresenceView,
  RankingEntry,
  RankingPeriod,
  SignupInput,
  StatsBucket,
  StatsPoint,
  Todo,
  User,
} from "../types";

/**
 * API クライアント。
 * 担当: フロントロジック係
 *   - 認証トークンの保存/失効処理、エラーハンドリングの強化
 */

function getToken(): string | null {
  return authStorage.getToken();
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

function saveAuth(data: AuthResponse): User {
  authStorage.save(data.user, data.token);
  return data.user;
}

export const api = {
  clearToken() {
    authStorage.clear();
  },
  isLoggedIn(): boolean {
    return !!getToken();
  },
  getStoredUser(): User | null {
    return authStorage.getUser();
  },

  async login(credentials: LoginCredentials): Promise<User> {
    const data = await request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    return saveAuth(data);
  },

  async signup(input: SignupInput): Promise<User> {
    const data = await request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return saveAuth(data);
  },

  async me(): Promise<User | null> {
    try {
      const data = await request<{ user: User }>("/api/me");
      authStorage.save(data.user, getToken() ?? "");
      return data.user;
    } catch (error) {
      authStorage.clear();
      if (error instanceof Error && error.message.includes("unauthorized")) return null;
      return null;
    }
  },

  async updateAvatar(avatarId: string): Promise<User> {
    const data = await request<{ user: User }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ avatarId }),
    });
    authStorage.save(data.user, getToken() ?? "");
    return data.user;
  },

  // パスワード変更フロー1段階目: 現在のパスワードが正しいか確認
  async verifyMyPassword(password: string): Promise<void> {
    await request("/api/me/verify-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  // パスワード変更フロー2段階目: 現在のパスワードを再確認して新パスワードに更新
  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    await request("/api/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async deleteMe(password: string): Promise<void> {
    await request("/api/me", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    });
    authStorage.clear();
  },

  async adminListUsers(): Promise<User[]> {
    const data = await request<{ users: User[] }>("/api/admin/users");
    return data.users;
  },

  async adminResetPassword(
    userId: string,
    newPassword: string,
    adminPassword: string,
  ): Promise<void> {
    await request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword, adminPassword }),
    });
  },

  async adminDeleteUser(userId: string, adminPassword: string): Promise<void> {
    await request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      body: JSON.stringify({ adminPassword }),
    });
  },

  async adminCreateLog(input: {
    userId: string;
    enteredAt: string;
    leftAt: string;
  }): Promise<void> {
    await request("/api/admin/logs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async adminDeleteLog(logId: string, adminPassword: string): Promise<void> {
    await request(`/api/admin/logs/${encodeURIComponent(logId)}`, {
      method: "DELETE",
      body: JSON.stringify({ adminPassword }),
    });
  },

  async ping(): Promise<void> {
    await request("/api/presence/ping", {
      method: "POST",
      body: "{}",
    });
  },

  async leave(): Promise<void> {
    await request("/api/presence/leave", { method: "POST", body: "{}" });
  },

  async resume(): Promise<void> {
    await request("/api/presence/resume", { method: "POST", body: "{}" });
  },

  async listPresences(): Promise<PresenceView[]> {
    const data = await request<{ presences: PresenceView[] }>("/api/presence");
    return data.presences;
  },

  async getRanking(period: RankingPeriod): Promise<RankingEntry[]> {
    const data = await request<{ period: string; ranking: RankingEntry[] }>(
      `/api/stats/ranking?period=${period}`
    );
    return data.ranking;
  },

  async listLogs(filters: { userId?: string; from?: string; to?: string } = {}): Promise<PresenceLogEntry[]> {
    const qs = new URLSearchParams();
    if (filters.userId) qs.set("userId", filters.userId);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    const suffix = qs.toString() ? `?${qs}` : "";
    const data = await request<{ logs: PresenceLogEntry[] }>(`/api/logs${suffix}`);
    return data.logs;
  },

  async getStats(args: {
    userId: string;
    from: string;
    to: string;
    bucket: StatsBucket;
  }): Promise<StatsPoint[]> {
    const qs = new URLSearchParams({
      userId: args.userId,
      from: args.from,
      to: args.to,
      bucket: args.bucket,
    });
    const data = await request<{ userId: string; bucket: string; stats: StatsPoint[] }>(
      `/api/logs/stats?${qs}`
    );
    return data.stats;
  },

  async listTodos(): Promise<Todo[]> {
    const data = await request<{ todos: Todo[] }>("/api/todos");
    return data.todos;
  },

  async createTodo(input: {
    title: string;
    assigneeIds: string[];
    dueDate: string | null;
  }): Promise<Todo> {
    const data = await request<{ todo: Todo }>("/api/todos", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return data.todo;
  },

  async updateTodo(
    id: string,
    input: { title: string; assigneeIds: string[]; dueDate: string | null },
  ): Promise<Todo> {
    const data = await request<{ todo: Todo }>(`/api/todos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return data.todo;
  },

  async setTodoDone(id: string, done: boolean): Promise<Todo> {
    const data = await request<{ todo: Todo }>(`/api/todos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    });
    return data.todo;
  },

  async deleteTodo(id: string): Promise<void> {
    await request(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};
