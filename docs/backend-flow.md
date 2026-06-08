# LabSoldier Backend 動作フロー

「リクエストが来てから返るまで、どの関数を順に通るか」を流れで示します。

---

## ファイル早見表

| ファイル | 役割 |
| --- | --- |
| [index.ts](../backend/src/index.ts) | 司令塔。起動 + ミドルウェア + ルーティング登録 |
| [routes/auth.ts](../backend/src/routes/auth.ts) | ログイン・自分情報取得 |
| [routes/presence.ts](../backend/src/routes/presence.ts) | 在室判定の3つのAPI |
| [middleware/ipCheck.ts](../backend/src/middleware/ipCheck.ts) | クライアントIPの取得・判定 |
| [lib/judge.ts](../backend/src/lib/judge.ts) | 3状態（present/unknown/absent）の動的判定 |
| [lib/timeout.ts](../backend/src/lib/timeout.ts) | 30分タイムアウトで自動退室記録 |
| [db/store.ts](../backend/src/db/store.ts) | DBアクセスの入口（8メソッド） |
| [db/database.ts](../backend/src/db/database.ts) | SQLite初期化、テーブル作成、seed |
| [types.ts](../backend/src/types.ts) | 型定義の辞書 |

---

## 起動シーケンス

```
npm run dev
   ↓
tsx が src/index.ts を実行
   ↓
[index.ts:1]  import "dotenv/config"
              → .env を process.env に流し込み

[index.ts:4-6] ルーター類を import
              → 連鎖的に database.ts が評価される
              → SQLite ファイル作成 + テーブル3つ作成 + seed 3人投入

[index.ts:8-11] Express アプリ生成 + CORS + JSON パース ミドルウェア
[index.ts:13-16] ルーティング登録
[index.ts:19]   app.listen(3001) でポートをListen
   ↓
[index.ts:22]   startTimeoutSweep() で 1分タイマー起動
   ↓
リクエスト待機状態
```

---

## API: POST /api/auth/login

仮ログイン（モック）。名前を渡してトークンを返す。

```
クライアント
  └─ POST /api/auth/login { "name": "user2" }
        ↓
[index.ts:14]      app.use("/api/auth", authRouter)
        ↓
[auth.ts:11]       authRouter.post("/login", ...)
        ↓
[store.ts:65]      store.listUsers()         ← users 全件取得
        ↓
                   配列から name=="user2" を find
        ↓
                   見つかれば { user, token: "mock-u-user2" } を返す
                   見つからなければ 404
        ↓
クライアント
```

---

## API: POST /api/presence/ping

フロントから1分毎に来る、Wi-Fi判定の本丸。

```
クライアント (Authorization: Bearer mock-u-user2)
  └─ POST /api/presence/ping
        ↓
[index.ts:16]      app.use("/api/presence", presenceRouter)
        ↓
[presence.ts:22]   presenceRouter.post("/ping", ...)
        ↓
[presence.ts:15]   userIdFromReq(req)        ← トークンから userId 抜き出す
        ↓
[store.ts:68]      store.getUser(userId)     ← ユーザー存在チェック
        ↓
[ipCheck.ts:6]     getClientIp(req)          ← IP取得
[ipCheck.ts:19]    isLabIp(ip)               ← 研究室IPか判定 → present (true/false)
        ↓
[store.ts:79]      store.getPresence(userId) ← 直前の状態を取得
        ↓
   ┌─── 在室→不在に切り替わった瞬間か？ ───┐
   │   YES (!present && prev.isPresent && prev.enteredAt) │
   │      ↓                                              │
   │   [store.ts:93] store.insertPresenceLog(...)        │
   │      → presence_logs に1行 INSERT                    │
   └──────────────────────────────────────────────────────┘
        ↓
[store.ts:83]      store.upsertPresence(...) ← presence テーブル更新
        ↓
                   res.json({ ...updated, ip })
        ↓
クライアント
```

---

## API: POST /api/presence/manual

手動チェックイン/チェックアウト。

```
クライアント
  └─ POST /api/presence/manual { "action": "checkout" }
        ↓
[presence.ts:58]   presenceRouter.post("/manual", ...)
        ↓
                   userIdFromReq(req) → userId
                   action 検証（"checkin" or "checkout"）
        ↓
[store.ts:79]      store.getPresence(userId) ← 直前の状態を取得
        ↓
   ┌─── checkout 時か？ ───────────────────────────────┐
   │   YES (action === "checkout" && prev.isPresent && prev.enteredAt) │
   │      ↓                                                          │
   │   [store.ts:93] store.insertPresenceLog(...)                    │
   └──────────────────────────────────────────────────────────────────┘
        ↓
[store.ts:83]      store.upsertPresence(...)
        ↓
クライアント
```

---

## API: GET /api/presence

在室一覧の取得（フロント表示用）。**3状態判定をここで動的計算**。

```
クライアント
  └─ GET /api/presence
        ↓
[presence.ts:93]   presenceRouter.get("/", ...)
        ↓
[store.ts:65]      store.listUsers()         ← users 全件
[store.ts:76]      store.listPresences()     ← presence 全件
        ↓
   users.map で 1人ずつ処理:
        ↓
   ├─ presences.find で対応する Presence を探す（無ければデフォルト不在）
   ├─ [judge.ts:8]  judgeStatus(p)        → "present" | "unknown" | "absent"
   └─ [judge.ts:21] elapsedMinutes(...)   → 経過分（数値 or null）
        ↓
   PresenceView を組み立てて配列に詰める
        ↓
                   res.json({ presences: view })
        ↓
クライアント
```

---

## バックグラウンド: 1分ごとの自動タイムアウト

`app.listen` 直後から `setInterval` で常時動いている。

```
[index.ts:22] startTimeoutSweep() を呼んだ瞬間に setInterval セット
        ↓
   1分後…
        ↓
[timeout.ts:20] findStaleStmt.all()
        → 「source='wifi' かつ last_seen_at から30分以上経過」の行を全部取る
        ↓
   見つかった件数ぶんループ:
        ↓
   ├─ [store.ts:93]   store.insertPresenceLog(...)
   │       → presence_logs に記録（leftAt = last_seen_at を使用）
   └─ [timeout.ts:15] clearStmt.run(user_id)
           → presence.entered_at = NULL に
        ↓
   1件以上あれば console.log
        ↓
   さらに1分後…（以下繰り返し）
```

**`is_present` は触らない**。状態判定は judge.ts が動的にやるので、entered_at だけクリアすれば十分。

---

## 関数の呼び出し関係（全体像）

```
                    ┌──────────────┐
                    │  index.ts    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
        ┌──────────┐ ┌──────────┐ ┌────────────┐
        │ auth.ts  │ │presence  │ │ timeout.ts │
        │          │ │   .ts    │ │ (1分ごと)   │
        └────┬─────┘ └────┬─────┘ └─────┬──────┘
             │            │             │
             │      ┌─────┴─────┐       │
             │      ↓           ↓       │
             │ ┌─────────┐ ┌─────────┐  │
             │ │ipCheck  │ │judge.ts │  │
             │ │  .ts    │ │         │  │
             │ └─────────┘ └─────────┘  │
             │                          │
             └──────┐    ┌──────────────┘
                    ↓    ↓
                ┌──────────┐
                │ store.ts │  ← DBアクセスの入口
                └────┬─────┘
                     ↓
                ┌──────────────┐
                │ database.ts  │  ← SQLite本体
                └──────┬───────┘
                       ↓
                 [labsoldier.db]
                  ├─ users
                  ├─ presence
                  └─ presence_logs
```

---

## 3つのテーブルの役割

| テーブル | 行数の傾向 | 更新パターン | 用途 |
| --- | --- | --- | --- |
| `users` | 4行固定 | seed のみ | 誰がいるか |
| `presence` | 4行固定 | 上書き（upsert） | 今この瞬間の状態 |
| `presence_logs` | 増え続ける | INSERT のみ | 過去のセッション履歴 |

---

## 設計のポイント

1. **3状態はDBに保存しない** — GET時に judge.ts で動的計算するので「いつ更新するか」問題が消える
2. **upsertで状態を上書き** — ping や手動切替のたびに presence の1行が書き換わる
3. **退室の瞬間にログ化** — manualのcheckout、ping→不在、自動タイムアウトの3経路でログ記録
4. **store.tsが DBの全入口** — SQLは全部このファイルに集約。他のファイルからは関数呼び出しだけ
5. **`source = 'wifi'` のみタイムアウト対象** — 手動チェックインは明示的にチェックアウトされるまで残す

---

## デバッグ用コマンド

```bash
# サーバー生存確認
curl http://localhost:3001/api/health

# ログイン → トークン取得
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" -d '{"name":"user2"}' \
  | sed 's/.*"token":"\([^"]*\)".*/\1/')

# ping
curl -X POST http://localhost:3001/api/presence/ping \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'

# 在室一覧
curl -s http://localhost:3001/api/presence | python3 -m json.tool

# DB を直接見る
sqlite3 backend/data/labsoldier.db
.tables
SELECT * FROM presence;
SELECT * FROM presence_logs ORDER BY left_at DESC LIMIT 5;
.quit
```
