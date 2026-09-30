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
#   HTTPS_PORT  — внешний порт HTTPS (по умолчанию 443). Если 443 занят (VPN, другой прокси) —
#                 HTTPS_PORT=8443. Telegram принимает webhook только на 443, 80, 88 и 8443.
#                 Запоминается в /etc/zona.env — при обновлении передавать заново не нужно.
#                 Порт 80 должен оставаться свободным: по нему Let's Encrypt проверяет домен.
#   GIT_TOKEN   — токен GitHub, если репозиторий приватный. Запоминается в
#                 /root/.zona-git-credentials (права 600) — при обновлении передавать заново не нужно.
#
# Свой Caddyfile: если в /etc/caddy/Caddyfile есть строка «# zona: manual», скрипт его не трогает.
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
# Токен GitHub храним не в адресе репозитория, а в отдельном файле только для root:
# так он не светится в `git remote -v` и логах, а обновление идёт без логина и пароля.
CRED_FILE=/root/.zona-git-credentials
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
if [ -n "${GIT_TOKEN:-}" ]; then
  host="${REPO_URL#https://}"; host="${host%%/*}"
  umask 077
  printf 'https://x-access-token:%s@%s\n' "$GIT_TOKEN" "$host" > "$CRED_FILE"
  chmod 600 "$CRED_FILE"
  umask 022
fi
GIT_AUTH=()
[ -f "$CRED_FILE" ] && GIT_AUTH=(-c "credential.helper=store --file=$CRED_FILE")
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -C "$APP_DIR" "${GIT_AUTH[@]}" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  rm -rf "$APP_DIR"
  git "${GIT_AUTH[@]}" clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
# и для ручного `git pull` в /opt/zona
[ -f "$CRED_FILE" ] && git -C "$APP_DIR" config credential.helper "store --file=$CRED_FILE"
SRC="$APP_DIR/zona"

log "Зависимости и сборка"
cd "$SRC"
npm ci --no-audit --no-fund
npm run build
chown -R zona:zona "$APP_DIR"

log "Настройки ($ENV_FILE)"
# переданное в команде важнее; чего не передали — берём из прошлой установки
NEW_TOKEN="${BOT_TOKEN:-}"; NEW_ADMINS="${ADMIN_IDS:-}"; NEW_DOMAIN="${DOMAIN:-}"; NEW_HTTPS_PORT="${HTTPS_PORT:-}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
BOT_TOKEN="${NEW_TOKEN:-${BOT_TOKEN:-}}"
ADMIN_IDS="${NEW_ADMINS:-${ADMIN_IDS:-}}"
: "${BOT_TOKEN:?Нужен BOT_TOKEN: BOT_TOKEN='...' bash install.sh}"
# Адрес из прошлой установки: https://домен[:порт]
OLD_HOST="${PUBLIC_URL:-}"; OLD_HOST="${OLD_HOST#https://}"; OLD_HOST="${OLD_HOST%%/*}"
OLD_DOMAIN="${OLD_HOST%%:*}"
OLD_PORT=""; [ "$OLD_HOST" != "$OLD_DOMAIN" ] && OLD_PORT="${OLD_HOST##*:}"
DOMAIN="${NEW_DOMAIN:-$OLD_DOMAIN}"
# порт, выставленный руками в текущем Caddyfile, тоже не теряем
CADDY_PORT="$(grep -oE '^[[:space:]]*https_port[[:space:]]+[0-9]+' /etc/caddy/Caddyfile 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
HTTPS_PORT="${NEW_HTTPS_PORT:-${HTTPS_PORT:-${OLD_PORT:-${CADDY_PORT:-443}}}}"
if [ -z "$DOMAIN" ]; then
  IP="$(curl -4 -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  DOMAIN="${IP//./-}.sslip.io"
fi
case "$HTTPS_PORT" in
  443|80|88|8443) ;;
  *) echo "⚠️  HTTPS_PORT=$HTTPS_PORT: Telegram принимает webhook только на 443, 80, 88 или 8443 — бот не будет получать сообщения." ;;
esac
if [ "$HTTPS_PORT" = 443 ]; then PUBLIC_URL="https://$DOMAIN"; else PUBLIC_URL="https://$DOMAIN:$HTTPS_PORT"; fi
umask 077
cat > "$ENV_FILE" <<ENV
BOT_TOKEN=$BOT_TOKEN
PUBLIC_URL=$PUBLIC_URL
HTTPS_PORT=$HTTPS_PORT
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

log "HTTPS: $PUBLIC_URL"
if [ -f /etc/caddy/Caddyfile ] && grep -q '# zona: manual' /etc/caddy/Caddyfile; then
  echo "Caddyfile помечен «# zona: manual» — не трогаю."
else
  sed "s#__DOMAIN__#$DOMAIN#g; s#__PORT__#$PORT#g; s#__HTTPS_PORT__#$HTTPS_PORT#g" "$SRC/deploy/Caddyfile" > /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "❌ Caddyfile с ошибкой:"; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; exit 1; }
systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp >/dev/null
  ufw allow "$HTTPS_PORT/tcp" >/dev/null
fi

log "Бэкап базы каждую ночь (хранится 14 дней)"
cat > /etc/cron.d/zona-backup <<CRON
30 4 * * * zona /usr/bin/node $SRC/deploy/backup.mjs $DATA_DIR/zona.db $DATA_DIR/backups 14 >> $DATA_DIR/backups/backup.log 2>&1
CRON

sleep 3
if systemctl is-active --quiet zona; then
  echo
  echo "✅ Готово. Игра: $PUBLIC_URL  ·  бот сам поставил webhook и кнопку «Играть»."
  echo "   Логи:      journalctl -u zona -f"
  echo "   Обновить:  bash $SRC/deploy/install.sh   (секреты возьмутся из $ENV_FILE)"
else
  echo "❌ Сервис не запустился:"; journalctl -u zona -n 40 --no-pager; exit 1
fi
