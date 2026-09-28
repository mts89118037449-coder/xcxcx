#!/usr/bin/env bash
# Установка «Зоны» на чистый сервер Ubuntu/Debian одной командой (от root):
#
#   curl -fsSL <ссылка на этот файл> -o install.sh
#   BOT_TOKEN='123:ABC' ADMIN_IDS='389248351' bash install.sh
#
# Что делает: ставит Node.js 22 и Caddy, забирает код из GitHub, собирает фронтенд,
# кладёт секреты в /etc/zona.env (права 600), запускает сервис zona через systemd,
# выдаёт HTTPS-сертификат (Let's Encrypt через Caddy) и настраивает ежедневный бэкап базы.
# Повторный запуск безопасен: обновит код и перезапустит сервис, база не трогается.
#
# Переменные:
#   BOT_TOKEN   — токен от @BotFather (обязательно при первой установке)
#   ADMIN_IDS   — Telegram ID админов через запятую (им /stats, покупки, обращения)
#   DOMAIN      — домен для HTTPS. По умолчанию <ip-с-дефисами>.sslip.io — бесплатный
#                 домен, который указывает на IP сервера; свой домен можно подставить позже
#   REPO_URL    — репозиторий (по умолчанию GitHub-репозиторий проекта)
#   BRANCH      — ветка (по умолчанию claude/tyuryaga-telegram-port-jignpo)
#   GIT_TOKEN   — токен GitHub, если репозиторий приватный
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Запусти от root: sudo -E bash install.sh"; exit 1; }

REPO_URL="${REPO_URL:-https://github.com/mts89118037449-coder/xcxcx.git}"
BRANCH="${BRANCH:-claude/tyuryaga-telegram-port-jignpo}"
APP_DIR=/opt/zona
DATA_DIR=/var/lib/zona
ENV_FILE=/etc/zona.env
PORT=8080

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

log "Пакеты системы"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".").map(Number).reduce((a,v,i)=>a+v*[1e6,1e3,1][i],0) >= 22018000')" != true ]; then
  log "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node -v

if ! command -v caddy >/dev/null; then
  log "Caddy (HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

log "Пользователь и папки"
id zona >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin zona
mkdir -p "$DATA_DIR" "$DATA_DIR/backups"
chown -R zona:zona "$DATA_DIR"

log "Код ($BRANCH)"
AUTH_URL="$REPO_URL"
[ -n "${GIT_TOKEN:-}" ] && AUTH_URL="${REPO_URL/https:\/\//https://x-access-token:${GIT_TOKEN}@}"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$AUTH_URL"
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$BRANCH" "$AUTH_URL" "$APP_DIR"
fi
git -C "$APP_DIR" remote set-url origin "$REPO_URL" # токен в конфиге git не храним
SRC="$APP_DIR/zona"

log "Зависимости и сборка"
cd "$SRC"
npm ci --no-audit --no-fund
npm run build
chown -R zona:zona "$APP_DIR"

log "Настройки ($ENV_FILE)"
# переданное в команде важнее; чего не передали — берём из прошлой установки
NEW_TOKEN="${BOT_TOKEN:-}"; NEW_ADMINS="${ADMIN_IDS:-}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
BOT_TOKEN="${NEW_TOKEN:-${BOT_TOKEN:-}}"
ADMIN_IDS="${NEW_ADMINS:-${ADMIN_IDS:-}}"
: "${BOT_TOKEN:?Нужен BOT_TOKEN: BOT_TOKEN='...' bash install.sh}"
if [ -z "${DOMAIN:-}" ]; then
  if [ -n "${PUBLIC_URL:-}" ]; then
    DOMAIN="${PUBLIC_URL#https://}"
  else
    IP="$(curl -4 -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
    DOMAIN="${IP//./-}.sslip.io"
  fi
fi
umask 077
cat > "$ENV_FILE" <<ENV
BOT_TOKEN=$BOT_TOKEN
PUBLIC_URL=https://$DOMAIN
ADMIN_IDS=${ADMIN_IDS:-}
PORT=$PORT
DB_PATH=$DATA_DIR/zona.db
ENV
chmod 600 "$ENV_FILE"
umask 022

log "Сервис systemd"
cp "$SRC/deploy/zona.service" /etc/systemd/system/zona.service
sed -i "s#__SRC__#$SRC#g" /etc/systemd/system/zona.service
systemctl daemon-reload
systemctl enable zona >/dev/null
systemctl restart zona

log "HTTPS: $DOMAIN"
sed "s#__DOMAIN__#$DOMAIN#g; s#__PORT__#$PORT#g" "$SRC/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

log "Бэкап базы каждую ночь (хранится 14 дней)"
cat > /etc/cron.d/zona-backup <<CRON
30 4 * * * zona /usr/bin/node $SRC/deploy/backup.mjs $DATA_DIR/zona.db $DATA_DIR/backups 14 >> $DATA_DIR/backups/backup.log 2>&1
CRON

sleep 3
if systemctl is-active --quiet zona; then
  echo
  echo "✅ Готово. Игра: https://$DOMAIN  ·  бот сам поставил webhook и кнопку «Играть»."
  echo "   Логи:      journalctl -u zona -f"
  echo "   Обновить:  bash $SRC/deploy/install.sh   (секреты возьмутся из $ENV_FILE)"
else
  echo "❌ Сервис не запустился:"; journalctl -u zona -n 40 --no-pager; exit 1
fi
