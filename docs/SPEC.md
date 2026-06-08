# LabSoldier 仕様書

研究室の在室状況をキャラクターで可視化する PWA。在室時間に応じてキャラの見た目（GIF）が
変化し、HP（体力ゲージ）が増減する。サポーターズ主催ハッカソン製作物。

- 本番URL: https://<your-vm-ip>.sslip.io
- リポジトリ: `daiki-pyonkichi/LabSoldier`（public）

---

## 1. システム全体像

```
[利用者のブラウザ / PWA]
        │ HTTPS (443)
        ▼
[Oracle Cloud VM (Ubuntu 22.04)]
   ┌─────────────────────────────────────────┐
   │ Caddy (443/80, リバースプロキシ + 自動HTTPS) │
   │            │ localhost:3001               │
   │            ▼                              │
   │ Node.js + Express (backend, systemd常駐)   │
   │   ├─ /api/* … API                         │
   │   └─ /     … frontend/dist を静的配信       │
   │            │                              │
   │            ▼                              │
   │ SQLite (better-sqlite3) … data/labsoldier.db │
   └─────────────────────────────────────────┘
```

- **フロントとバックは同一オリジン**（Express が frontend のビルド成果物も配信）。
  そのため CORS 不要・API は相対パス `/api/...` で呼ぶ。
- 在室判定は **クライアントの送信元IP** を研究室の許可IPと突き合わせて行う。

---

## 2. 技術スタック

### フロントエンド
| 技術 | 用途 |
| --- | --- |
| React 18 + TypeScript | UI |
| Vite | ビルド / 開発サーバー |
| vite-plugin-pwa | PWA（ホーム画面追加・Service Worker） |
| recharts | 在室統計のグラフ表示 |

### バックエンド
| 技術 | 用途 |
| --- | --- |
| Node.js 20 + TypeScript | サーバー実行環境 |
| Express 4 | HTTP / ルーティング |
| better-sqlite3 | SQLite ドライバ（同期API） |
| Node標準 crypto | パスワードハッシュ（scrypt）/ token署名（HMAC-SHA256） |
| dotenv | 環境変数読み込み |

### インフラ
| 技術 | 用途 |
| --- | --- |
| Oracle Cloud (Always Free VM) | ホスティング（Ubuntu 22.04 / 1 OCPU / 1GB AMD） |
| systemd | バックエンドの常駐・自動再起動 |
| Caddy 2 | HTTPS終端（Let's Encrypt自動）+ リバースプロキシ |
| sslip.io | ドメイン代わり（`<IP>.sslip.io` がIPに解決される無料DNS） |

---

## 3. ディレクトリ構成

```
.
├── frontend/
│   ├── src/
│   │   ├── pages/        Login / Ranking / Logs
│   │   ├── components/   Character / PresenceList / ManualCheckin
│   │   ├── api/          client.ts（API呼び出し）/ authStorage.ts（token保管）
│   │   ├── hooks/        usePresencePing.ts（1分ごとping）
│   │   ├── avatars.ts    アバター定義 / GIF段階ロジック
│   │   └── types.ts
│   └── public/avatars/   キャラGIF素材（{id}_{stage}.gif）
├── backend/
│   └── src/
│       ├── index.ts        エントリ（ルーティング + 静的配信 + 起動）
│       ├── db/
│       │   ├── database.ts  SQLite初期化・テーブル作成・seed・マイグレーション
│       │   └── store.ts     DB操作をまとめた store オブジェクト
│       ├── routes/         auth / presence / stats / logs
│       ├── services/       password.ts（scrypt）/ token.ts（JWT）
│       ├── middleware/     auth.ts（Bearer検証）/ ipCheck.ts（IP判定）
│       └── lib/            judge.ts（在室3状態）/ hp.ts（HP算出）/ timeout.ts（自動退室）
├── deploy/                 systemd unit / Caddyfile / setup.sh / redeploy.sh
└── docs/                   ドキュメント
```

---

## 4. データベース（SQLite）

3テーブル。`users` を中心に `presence`（現在の状態・1対1）と `presence_logs`（在室履歴・1対多）。

### users（ユーザー台帳）
| カラム | 型 | 説明 |
| --- | --- | --- |
| id | TEXT PK | ユーザーID（例 `u-user1` / UUID） |
| name | TEXT UNIQUE | ユーザー名 |
| password_hash | TEXT | `scrypt:salt:hash` 形式 |
| avatar_id | TEXT | キャラ識別子（例 `soldier-armor`） |
| created_at | TEXT | 作成日時(ISO8601) |

### presence（現在の在室状態・ユーザー1人1行）
| カラム | 型 | 説明 |
| --- | --- | --- |
| user_id | TEXT PK / FK→users.id | |
| is_present | INTEGER(0/1) | 在室か |
| source | TEXT | `wifi`（自動）/ `manual`（手動） |
| entered_at | TEXT | 入室時刻 |
| last_seen_at | TEXT | 最終ping時刻 |
| manual_off | INTEGER(0/1) | 退室フラグ（trueの間pingを無視） |

### presence_logs（在室履歴・滞在ごとに1行）
| カラム | 型 | 説明 |
| --- | --- | --- |
| id | TEXT PK | ログID(UUID) |
| user_id | TEXT FK→users.id | |
| entered_at | TEXT | 入室時刻 |
| left_at | TEXT | 退室時刻 |
| duration_sec | INTEGER | 滞在秒数 |

### リレーション
```
users (1) ──── (1) presence        … 各ユーザーの「今」の状態
users (1) ──── (N) presence_logs    … 各ユーザーの滞在履歴（ランキング/HP算出の元）
```

### ER図
![ER図](er-diagram.png)

---

## 5. API 一覧

すべて JSON。認証が要るものは `Authorization: Bearer <token>` ヘッダが必須。

| Method | Path | 認証 | 説明 |
| --- | --- | --- | --- |
| GET | `/api/health` | 不要 | 死活確認 |
| POST | `/api/auth/login` | 不要 | name+password → user + token |
| POST | `/api/auth/signup` | 不要 | name+password+avatarId → user + token |
| GET | `/api/auth/me` / `/api/me` | 要 | token から自分の情報 |
| POST | `/api/presence/ping` | 要 | IP判定で在室更新（退室中はスキップ） |
| POST | `/api/presence/leave` | 要 | 明示的に退室（manual_off=true） |
| POST | `/api/presence/resume` | 要 | 退室解除（自動判定再開） |
| GET | `/api/presence` | 要 | 在室者一覧（status/hp/elapsedMin付き） |
| GET | `/api/stats/ranking` | 要 | 在室時間ランキング（週/月/全期間） |
| GET | `/api/logs` | 要 | 在室履歴（ユーザー/期間で絞込み可） |

---

## 6. 在室判定ロジック

### Wi-Fi（IP）判定
1. フロントが**ログイン中1分ごと**に `POST /api/presence/ping`（[usePresencePing.ts](../frontend/src/hooks/usePresencePing.ts)）
2. バックエンドが**リクエストの送信元IP**を取得（`x-forwarded-for` 優先＝Caddy越し対応）
3. 環境変数 `LAB_ALLOWED_IPS`（カンマ区切り）に含まれれば在室、なければ不在
4. 結果を `presence` テーブルに保存

### 3状態判定（[judge.ts](../backend/src/lib/judge.ts)）
| status | 条件 |
| --- | --- |
| `present` | 退室フラグなし & 5分以内にping & 在室 |
| `unknown` | 5〜30分pingなし（離席かも） |
| `absent` | 30分以上 / 退室フラグON / 初期状態 |

### 退室トグル
「退室する」で `manual_off=true` → 以降のpingを無視（勝手に在室復帰しない）。「在室を再開」で解除。

### HP（[hp.ts](../backend/src/lib/hp.ts)）
過去の在室ログを再生して算出。**在室で減少（12時間で0%）/ 不在で回復（6時間で100%）**。
フロントは取得後も1分ごとにローカル補正して表示。

---

## 7. 認証フロー

```
[signup/login] name+password
   → password.ts: scrypt(salt付き)でハッシュ照合
   → token.ts: HS256署名のJWT発行（7日有効）
   → フロントは authStorage が localStorage に token/user 保管
[以降のAPI] Authorization: Bearer <token>
   → middleware/auth.ts が署名・期限を検証 → User を復元
```

- パスワードは `scrypt`、比較は `timingSafeEqual`（タイミング攻撃対策）
- 公開用 `User` 型と内部用 `AuthUserRecord`（passwordHash付き）を分離し、漏洩を型で防止
- token署名鍵は環境変数 `JWT_SECRET`（本番未設定なら起動停止）

---

## 8. デプロイ構成

| 項目 | 値 |
| --- | --- |
| ホスト | Oracle Cloud VM（Ubuntu 22.04, AMD E2.1.Micro, Always Free） |
| コード配置先 | `/opt/labsoldier`（ローカルからrsyncで転送） |
| 永続データ | `/opt/labsoldier-data`（env と DB。**rsync対象の外**＝再デプロイで消えない） |
| プロセス | systemd `labsoldier.service`（`node dist/index.js`, port 3001, User=ubuntu, 自動再起動） |
| 環境変数 | `/opt/labsoldier-data/labsoldier.env`（JWT_SECRET / LAB_ALLOWED_IPS / DB_PATH 等） |
| HTTPS | Caddy が `<your-vm-ip>.sslip.io` でLet's Encrypt証明書を自動取得 |
| ファイアウォール | ①VM内 iptables ②Oracle Security List の2層で 22/80/443 のみ許可 |
| DB保存先 | `/opt/labsoldier-data/labsoldier.db`（VMのディスクに永続） |

### 更新（再デプロイ）
ローカルで `deploy/redeploy.sh` を実行 → 最新コードをrsync→VMで再ビルド→サービス再起動。
env と DB は `/opt/labsoldier-data`（rsync対象外）にあるため、`--delete` をかけても保持される。

---

## 9. 規模・制約

- 想定: 研究室メンバー（数人〜数十人）規模。SQLite + 小型VMで十分。
- 在室ログは1行〜100バイト程度。年間でも数MB（ディスク数十GBに対し誤差）。
- 不特定多数への本格公開には未対応（下記の既知課題を要対応）。

---

## 10. 既知の課題（本格運用前に対応）

- 初期メンバーは開発用共通パスワード（`password123`）。初回変更フローが必要。
- ログイン試行のレート制限なし（総当たり対策）。
- 研究室の公開IPが変動するとWi-Fi判定が崩れる（6/2実機テストで実IPを確認・調整）。
- VMがAlways Free枠のため、7日間アイドルで停止されうる（停止時はコンソールからStartで復帰、データは保持）。
