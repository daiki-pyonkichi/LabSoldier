#!/usr/bin/env bash
# LabSoldier 再デプロイスクリプト（ローカルから実行）。
# 最新コードを取得 → VMへrsync → VM上で再ビルド → サービス再起動。
#
# ★ 永続データ(env / SQLite DB)は /opt/labsoldier-data に置く。これは rsync 対象
#   (/opt/labsoldier)の外なので、--delete をかけても消えない。
#   （過去に env と DB を /opt/labsoldier 内に置いていて --delete で消した事故あり）
#
# 使い方:
#   ./deploy/redeploy.sh
# 値は環境変数で上書き可:
#   VM_IP=<your-vm-ip> SSH_KEY=~/.ssh/labsoldier.key ./deploy/redeploy.sh
set -euo pipefail

VM_IP="${VM_IP:?Set VM_IP to your VM public IP or domain}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:?Set SSH_KEY to your SSH private key path}"
REMOTE_DIR="${REMOTE_DIR:-/opt/labsoldier}"

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"
cd "$(dirname "$0")/.."

echo "==> 1. 最新コード取得（main）"
git checkout main
git pull origin main

echo "==> 2. VM へ rsync ($VM_USER@$VM_IP:$REMOTE_DIR)"
rsync -az --delete \
  -e "$SSH" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'backend/dist' \
  --exclude 'frontend/dist' \
  --exclude 'backend/data' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  ./ "$VM_USER@$VM_IP:$REMOTE_DIR/"

echo "==> 3. VM 上で再ビルド + 再起動"
$SSH "$VM_USER@$VM_IP" bash -s <<REMOTE
set -e
cd $REMOTE_DIR/backend && npm install && npm run build
cd $REMOTE_DIR/frontend && npm install && npm run build
sudo systemctl restart labsoldier
sleep 2
echo "service: \$(systemctl is-active labsoldier)"
curl -s -o /dev/null -w "health: HTTP %{http_code}\n" http://localhost:3001/api/health
REMOTE

echo "==> 完了: https://${VM_IP}.sslip.io"
