#!/usr/bin/env bash
set -euo pipefail

ROLLBACK_COMMIT="${1:-7c0fc15cec0365c52f297feb4abf747650145ec0}"
REMOTE="${REMOTE:-aliyun}"
REMOTE_DIR="${REMOTE_DIR:-/opt/huapai-backend/services/backend}"

repo_root="$(git rev-parse --show-toplevel)"
tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

cd "$repo_root"
git cat-file -e "${ROLLBACK_COMMIT}^{commit}"
git archive --format=tar "$ROLLBACK_COMMIT" services/backend | tar -x -C "$tmpdir"

rsync -az --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude '*.log' \
  "$tmpdir/services/backend/" \
  "$REMOTE:$REMOTE_DIR/"

ssh "$REMOTE" "set -e; cd '$REMOTE_DIR'; npm install --omit=dev; systemctl restart huapai-backend.service; sleep 2; systemctl status huapai-backend.service --no-pager -l | sed -n '1,80p'; curl -fsS http://127.0.0.1:8080/healthz"
