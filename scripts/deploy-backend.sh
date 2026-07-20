#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_ALIAS="${SSH_ALIAS:-aliyun}"
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/opt/huapai-backend/services/backend}"
REMOTE_SERVICE="${REMOTE_SERVICE:-huapai-backend.service}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/etc/huapai-backend.env}"
REMOTE_ADMIN_ROOT="${REMOTE_ADMIN_ROOT:-/var/www/huapai-admin}"
REMOTE_NGINX_SITE="${REMOTE_NGINX_SITE:-/etc/nginx/sites-available/wangyouk.cn}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://www.wangyouk.cn/healthz}"
PUBLIC_ADMIN_URL="${PUBLIC_ADMIN_URL:-https://www.wangyouk.cn/admin/}"
LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:8080/healthz}"

RUN_CHECKS=1
RUN_SYNC=1
RUN_REMOTE_RESTART=1
RUN_PUBLIC_HEALTH=1
RUN_ADMIN=0
RUN_BACKEND=1
INSTALL_ADMIN_NGINX=0
RUN_DEPLOY=1
SHOW_HELP=0

usage() {
  cat <<EOF
Usage: $0 [options]

Deploy the Huapai backend to the production server recorded in openspec/config.yaml.

Options:
  --skip-checks        Skip local regression checks.
  --only-checks        Run local regression checks and stop.
  --skip-public-health Skip public HTTPS health check after restart.
  --with-admin         Build, test, and deploy the Vue admin app after backend deploy.
  --only-admin         Build, test, and deploy only the Vue admin app.
  --install-admin-nginx Install the reviewed Nginx site config before switching assets.
  --help               Show this help.

Environment overrides:
  SSH_ALIAS            Default: aliyun
  REMOTE_BACKEND_DIR   Default: /opt/huapai-backend/services/backend
  REMOTE_SERVICE       Default: huapai-backend.service
  REMOTE_ENV_FILE      Default: /etc/huapai-backend.env
  REMOTE_ADMIN_ROOT    Default: /var/www/huapai-admin
  REMOTE_NGINX_SITE    Default: /etc/nginx/sites-available/wangyouk.cn
  PUBLIC_HEALTH_URL    Default: https://www.wangyouk.cn/healthz
  PUBLIC_ADMIN_URL     Default: https://www.wangyouk.cn/admin/
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
      RUN_DEPLOY=0
      ;;
    --skip-public-health)
      RUN_PUBLIC_HEALTH=0
      ;;
    --with-admin)
      RUN_ADMIN=1
      ;;
    --only-admin)
      RUN_ADMIN=1
      RUN_BACKEND=0
      RUN_SYNC=0
      RUN_REMOTE_RESTART=0
      RUN_PUBLIC_HEALTH=0
      ;;
    --install-admin-nginx)
      RUN_ADMIN=1
      INSTALL_ADMIN_NGINX=1
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
  if [ "$RUN_ADMIN" -eq 1 ]; then
    step "Running Vue admin checks"
    npm --prefix "$ROOT_DIR/services/admin-web" ci
    npm --prefix "$ROOT_DIR/services/admin-web" run check
  fi
}

build_admin() {
  step "Building Vue admin app"
  npm --prefix "$ROOT_DIR/services/admin-web" ci
  npm --prefix "$ROOT_DIR/services/admin-web" run build
}

install_admin_nginx() {
  if [ "$INSTALL_ADMIN_NGINX" -ne 1 ]; then
    return
  fi
  step "Installing reviewed Nginx admin configuration"
  scp "$ROOT_DIR/scripts/nginx/wangyouk.cn.conf" "${SSH_ALIAS}:/tmp/huapai-wangyouk.cn.conf"
  ssh "$SSH_ALIAS" \
    "REMOTE_NGINX_SITE='$REMOTE_NGINX_SITE' bash -s" <<'REMOTE'
set -euo pipefail
backup_path="${REMOTE_NGINX_SITE}.pre-admin"
cp --preserve=mode,ownership,timestamps "$REMOTE_NGINX_SITE" "$backup_path"
install -m 0644 /tmp/huapai-wangyouk.cn.conf "$REMOTE_NGINX_SITE"
rm -f /tmp/huapai-wangyouk.cn.conf
if ! nginx -t; then
  cp "$backup_path" "$REMOTE_NGINX_SITE"
  nginx -t
  exit 1
fi
systemctl reload nginx
sleep 1
REMOTE
}

sync_admin() {
  local release_id
  release_id="$(date -u +%Y%m%d%H%M%S)-$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
  step "Syncing Vue admin release ${release_id}"
  ssh "$SSH_ALIAS" "mkdir -p '$REMOTE_ADMIN_ROOT/releases/$release_id/admin'"
  rsync -az --delete \
    "$ROOT_DIR/services/admin-web/dist/" \
    "${SSH_ALIAS}:${REMOTE_ADMIN_ROOT}/releases/${release_id}/admin/"
  ssh "$SSH_ALIAS" \
    "REMOTE_ADMIN_ROOT='$REMOTE_ADMIN_ROOT' RELEASE_ID='$release_id' bash -s" <<'REMOTE'
set -euo pipefail
test -f "$REMOTE_ADMIN_ROOT/releases/$RELEASE_ID/admin/index.html"
if [ -L "$REMOTE_ADMIN_ROOT/current" ]; then
  ln -sfn "$(readlink -f "$REMOTE_ADMIN_ROOT/current")" "$REMOTE_ADMIN_ROOT/previous"
fi
ln -sfn "$REMOTE_ADMIN_ROOT/releases/$RELEASE_ID" "$REMOTE_ADMIN_ROOT/current.next"
mv -Tf "$REMOTE_ADMIN_ROOT/current.next" "$REMOTE_ADMIN_ROOT/current"
find "$REMOTE_ADMIN_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr | awk 'NR > 5 { print $2 }' | xargs -r rm -rf
REMOTE
}

rollback_admin() {
  step "Rolling back Vue admin release"
  ssh "$SSH_ALIAS" \
    "REMOTE_ADMIN_ROOT='$REMOTE_ADMIN_ROOT' bash -s" <<'REMOTE'
set -euo pipefail
test -L "$REMOTE_ADMIN_ROOT/previous"
ln -sfn "$(readlink -f "$REMOTE_ADMIN_ROOT/previous")" "$REMOTE_ADMIN_ROOT/current.next"
mv -Tf "$REMOTE_ADMIN_ROOT/current.next" "$REMOTE_ADMIN_ROOT/current"
REMOTE
}

check_public_admin() {
  step "Checking public Vue admin entry and SPA fallback"
  local html asset origin
  html="$(curl -fsS "$PUBLIC_ADMIN_URL")"
  printf '%s' "$html" | grep -q '<div id="app"></div>'
  asset="$(printf '%s' "$html" | grep -Eo '/admin/assets/[^" ]+\.js' | head -n 1)"
  test -n "$asset"
  origin="${PUBLIC_ADMIN_URL%%/admin/*}"
  curl -fsS "${origin}${asset}" >/dev/null
  curl -fsS "${PUBLIC_ADMIN_URL}administrators" | grep -q '<div id="app"></div>'
}

sync_backend() {
  step "Regenerating minigame asset manifest"
  node "$ROOT_DIR/scripts/build-asset-manifest.mjs" || step "WARN: asset manifest generation failed, continuing with existing manifest"
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

if [ "$RUN_BACKEND" -eq 1 ] && [ "$RUN_SYNC" -eq 1 ]; then
  sync_backend
fi

if [ "$RUN_BACKEND" -eq 1 ] && [ "$RUN_REMOTE_RESTART" -eq 1 ]; then
  restart_remote_backend
fi

if [ "$RUN_BACKEND" -eq 1 ] && [ "$RUN_PUBLIC_HEALTH" -eq 1 ]; then
  check_public_health
fi

if [ "$RUN_ADMIN" -eq 1 ] && [ "$RUN_DEPLOY" -eq 1 ]; then
  build_admin
  sync_admin
  install_admin_nginx
  if ! check_public_admin; then
    rollback_admin
    exit 1
  fi
fi

step "Backend deploy workflow completed"
