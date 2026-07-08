#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_ALIAS="${SSH_ALIAS:-aliyun}"
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/opt/huapai-backend/services/backend}"
REMOTE_SERVICE="${REMOTE_SERVICE:-huapai-backend.service}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/etc/huapai-backend.env}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://www.wangyouk.cn/healthz}"
LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:8080/healthz}"

RUN_CHECKS=1
RUN_SYNC=1
RUN_REMOTE_RESTART=1
RUN_PUBLIC_HEALTH=1
SHOW_HELP=0

usage() {
  cat <<EOF
Usage: $0 [options]

Deploy the Huapai backend to the production server recorded in openspec/config.yaml.

Options:
  --skip-checks        Skip local regression checks.
  --only-checks        Run local regression checks and stop.
  --skip-public-health Skip public HTTPS health check after restart.
  --help               Show this help.

Environment overrides:
  SSH_ALIAS            Default: aliyun
  REMOTE_BACKEND_DIR   Default: /opt/huapai-backend/services/backend
  REMOTE_SERVICE       Default: huapai-backend.service
  REMOTE_ENV_FILE      Default: /etc/huapai-backend.env
  PUBLIC_HEALTH_URL    Default: https://www.wangyouk.cn/healthz
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-checks)
      RUN_CHECKS=0
      ;;
    --only-checks)
      RUN_SYNC=0
      RUN_REMOTE_RESTART=0
      RUN_PUBLIC_HEALTH=0
      ;;
    --skip-public-health)
      RUN_PUBLIC_HEALTH=0
      ;;
    --help|-h)
      SHOW_HELP=1
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$SHOW_HELP" -eq 1 ]; then
  usage
  exit 0
fi

step() {
  printf '\n==> %s\n' "$1"
}

run_local_checks() {
  step "Running local backend regression checks"
  (
    cd "$ROOT_DIR"
    node scripts/run-server-core-checks.mjs
    node scripts/run-online-checks.mjs
    node scripts/run-backend-checks.mjs
  )
}

sync_backend() {
  step "Syncing backend source to ${SSH_ALIAS}:${REMOTE_BACKEND_DIR}"
  rsync -az --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude '*.log' \
    "$ROOT_DIR/services/backend/" \
    "${SSH_ALIAS}:${REMOTE_BACKEND_DIR}/"
}

restart_remote_backend() {
  step "Installing dependencies, restarting backend, and checking MongoDB"
  ssh "$SSH_ALIAS" \
    "REMOTE_BACKEND_DIR='$REMOTE_BACKEND_DIR' REMOTE_SERVICE='$REMOTE_SERVICE' REMOTE_ENV_FILE='$REMOTE_ENV_FILE' LOCAL_HEALTH_URL='$LOCAL_HEALTH_URL' bash -s" <<'REMOTE'
set -euo pipefail

cd "$REMOTE_BACKEND_DIR"

echo "[remote] verifying MongoDB environment"
grep -E "^(PORT|PUBLIC_API_BASE_URL|PUBLIC_SOCKET_URL|DATABASE_DRIVER|MONGODB_DB)=" "$REMOTE_ENV_FILE" || true
if grep -q "^MONGODB_URI=" "$REMOTE_ENV_FILE"; then
  echo "MONGODB_URI=present"
else
  echo "MONGODB_URI=missing" >&2
  exit 1
fi
if grep -q "^FILE_DB_PATH=" "$REMOTE_ENV_FILE"; then
  echo "FILE_DB_PATH=present; production should use MongoDB" >&2
  exit 1
else
  echo "FILE_DB_PATH=removed"
fi

echo "[remote] verifying MongoDB container"
docker ps --filter name=huapai-mongo --format "{{.Names}} {{.Status}} {{.Ports}}"
ss -lntp 2>/dev/null | grep ":27017" || {
  echo "MongoDB is not listening on 27017" >&2
  exit 1
}
echo "[remote] restarting ${REMOTE_SERVICE}"
systemctl restart "$REMOTE_SERVICE"
sleep 3
systemctl status "$REMOTE_SERVICE" --no-pager -l | sed -n "1,80p"

echo "[remote] checking local health"
curl -fsS "$LOCAL_HEALTH_URL"
echo

echo "[remote] counting MongoDB collections"
APP_PASSWORD="$(cat /etc/huapai-mongo/app_password)"
MONGODB_URI="mongodb://huapai_app:${APP_PASSWORD}@127.0.0.1:27017/huapai?authSource=huapai"
MONGODB_URI="$MONGODB_URI" node <<'NODE'
const { MongoClient } = require('mongodb');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('huapai');
  const names = ['users', 'rooms', 'roomStates', 'matchQueue', 'adminUsers'];
  for (const name of names) {
    console.log(`${name}:${await db.collection(name).countDocuments({})}`);
  }
  await client.close();
})().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
NODE
REMOTE
}

check_public_health() {
  step "Checking public health endpoint"
  curl -fsS "$PUBLIC_HEALTH_URL"
  echo
}

if [ "$RUN_CHECKS" -eq 1 ]; then
  run_local_checks
fi

if [ "$RUN_SYNC" -eq 1 ]; then
  sync_backend
fi

if [ "$RUN_REMOTE_RESTART" -eq 1 ]; then
  restart_remote_backend
fi

if [ "$RUN_PUBLIC_HEALTH" -eq 1 ]; then
  check_public_health
fi

step "Backend deploy workflow completed"
