#!/usr/bin/env bash
# Oracle Cloud Always Free VM (Ubuntu 22.04+) 用 セットアップスクリプト。
# VM に SSH 接続後、root もしくは sudo で実行する。
#   curl -fsSL https://raw.githubusercontent.com/daiki-pyonkichi/LabSoldier/main/deploy/setup.sh | sudo bash
# もしくは clone 後に sudo bash deploy/setup.sh
set -euo pipefail

REPO_URL="https://github.com/daiki-pyonkichi/LabSoldier.git"
APP_DIR="/opt/labsoldier"        # コード配置先（rsync/clone先）
DATA_DIR="/opt/labsoldier-data"  # 永続データ(env/DB)。rsync対象外なので --delete で消えない
NODE_MAJOR=20

echo "==> 1. パッケージ更新 + 必要ツール"
apt-get update
apt-get install -y git curl ca-certificates gnupg build-essential

echo "==> 2. Node.js ${NODE_MAJOR}.x 導入"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 3. 実行ユーザー labsoldier 作成"
id -u labsoldier >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin labsoldier

echo "==> 4. リポジトリ取得 / 更新"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi
mkdir -p "$DATA_DIR"

echo "==> 5. backend ビルド"
cd "$APP_DIR/backend"
npm install
npm run build

echo "==> 6. frontend ビルド（同一オリジン配信用）"
cd "$APP_DIR/frontend"
npm install
npm run build

echo "==> 7. 所有権を ubuntu に（サービス実行ユーザーと揃える）"
chown -R ubuntu:ubuntu "$APP_DIR" "$DATA_DIR"

echo "==> 8. 環境変数ファイル（永続ディレクトリに作成）"
if [ ! -f "$DATA_DIR/labsoldier.env" ]; then
  cp "$APP_DIR/deploy/labsoldier.env.example" "$DATA_DIR/labsoldier.env"
  chmod 600 "$DATA_DIR/labsoldier.env"
  echo "!! $DATA_DIR/labsoldier.env を編集して JWT_SECRET と LAB_ALLOWED_IPS を設定してください"
  echo "!! JWT_SECRET 生成: openssl rand -hex 32"
fi

echo "==> 9. systemd サービス登録"
cp "$APP_DIR/deploy/labsoldier.service" /etc/systemd/system/labsoldier.service
systemctl daemon-reload
systemctl enable labsoldier

echo ""
echo "=== 次の手順 ==="
echo "1. sudo nano $DATA_DIR/labsoldier.env   # JWT_SECRET と LAB_ALLOWED_IPS を設定"
echo "2. sudo systemctl restart labsoldier    # 起動"
echo "3. sudo systemctl status labsoldier     # 稼働確認"
echo "4. Caddy を入れて HTTPS 化（deploy/Caddyfile 参照）"
