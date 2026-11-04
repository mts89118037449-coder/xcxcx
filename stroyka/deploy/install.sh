#!/usr/bin/env bash
# Стройка 3D — установка на VPS одной командой (Ubuntu 22.04/24.04, Debian 11/12).
#
#   sudo GH_TOKEN=ghp_xxx DOMAIN=stroyka.example.ru GOOGLE_API_URL='https://script.google.com/macros/s/…/exec' \
#     bash -c "$(curl -fsSL -H "Authorization: token ghp_xxx" \
#     https://raw.githubusercontent.com/mts89118037449-coder/xcxcx/ccr-daed372c-kxhkyu/stroyka/deploy/install.sh)"
#
# Переменные (все необязательные, кроме GH_TOKEN для приватного репозитория):
#   GH_TOKEN        GitHub-токен с правом чтения репозитория (на диске не сохраняется)
#   DOMAIN          домен → nginx + бесплатный HTTPS (Let's Encrypt). Без домена — http://IP
#   EMAIL           почта для Let's Encrypt (уведомления об истечении сертификата)
#   GOOGLE_API_URL  ссылка …/exec скрипта таблицы — источник данных (режим proxy)
#   LOGIN/PASSWORD  вход на сайт; пароль по умолчанию генерируется и печатается в конце
#   BRANCH          ветка (по умолчанию ccr-daed372c-kxhkyu)
# Повторный запуск той же командой = обновление: данные и .env сохраняются.
set -euo pipefail

REPO="mts89118037449-coder/xcxcx"
BRANCH="${BRANCH:-ccr-daed372c-kxhkyu}"
DIR=/opt/stroyka
APP="$DIR/stroyka"
PORT="${PORT:-8080}"
LOGIN="${LOGIN:-prorab}"

say() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Запустите через sudo"
command -v apt-get >/dev/null || die "Нужен Ubuntu или Debian (apt)"
export DEBIAN_FRONTEND=noninteractive

say "Пакеты: git, nginx, curl"
apt-get update -qq
apt-get install -y -qq git nginx apache2-utils curl ca-certificates xz-utils >/dev/null
[ -n "${DOMAIN:-}" ] && apt-get install -y -qq certbot python3-certbot-nginx >/dev/null

say "Node.js 18+"
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if ! node_ok; then
  apt-get install -y -qq nodejs >/dev/null 2>&1 || true
fi
if ! node_ok; then
  V=20.18.1; ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')
  for MIRROR in https://nodejs.org/dist https://npmmirror.com/mirrors/node; do
    if curl -fsSL "$MIRROR/v$V/node-v$V-linux-$ARCH.tar.xz" -o /tmp/node.tar.xz; then
      tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && break
    fi
  done
fi
node_ok || die "Не удалось установить Node.js 18+"
NODE=$(command -v node)
echo "node $(node -v) → $NODE"

say "Код приложения → $DIR"
id stroyka >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d "$DIR" stroyka
URL="https://github.com/$REPO.git"
AUTH_URL="$URL"; [ -n "${GH_TOKEN:-}" ] && AUTH_URL="https://x-access-token:${GH_TOKEN}@github.com/$REPO.git"
git config --global --add safe.directory "$DIR" 2>/dev/null || true
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q "$AUTH_URL" "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone -q --depth 1 -b "$BRANCH" "$AUTH_URL" "$DIR" || die "Не удалось скачать репозиторий (проверьте GH_TOKEN)"
fi
git -C "$DIR" remote set-url origin "$URL" 2>/dev/null || true   # токен на диске не остаётся

say "Настройки $APP/.env"
if [ ! -f "$APP/.env" ]; then
  cp "$APP/deploy/env.example" "$APP/.env"
  sed -i "s|^PORT=.*|PORT=$PORT|" "$APP/.env"
  grep -q '^HOST=' "$APP/.env" || echo "HOST=127.0.0.1" >> "$APP/.env"
fi
if [ -n "${GOOGLE_API_URL:-}" ]; then
  sed -i "s|^GOOGLE_API_URL=.*|GOOGLE_API_URL=$GOOGLE_API_URL|; s|^MODE=.*|MODE=proxy|" "$APP/.env"
elif ! grep -q '^GOOGLE_API_URL=.\+' "$APP/.env"; then
  # ссылки на таблицу ещё нет — работаем на снимке, пока её не добавят
  sed -i "s|^MODE=.*|MODE=standalone|" "$APP/.env"
fi
mkdir -p "$APP/data"
chown -R stroyka:stroyka "$DIR"
chmod 600 "$APP/.env"

say "Служба stroyka"
cat > /usr/local/bin/stroyka <<EOF
#!/usr/bin/env bash
# stroyka backup | list | restore <файл> | pull | status | logs | restart
cd "$APP"
case "\${1:-status}" in
  status)  systemctl status stroyka --no-pager 2>/dev/null || curl -s http://127.0.0.1:$PORT/healthz; echo ;;
  logs)    journalctl -u stroyka -n 100 -f 2>/dev/null || tail -f "$APP/data/server.log" ;;
  restart) systemctl restart stroyka ;;
  *)       set -a; . "$APP/.env"; set +a; runuser -u stroyka -- "$NODE" server/server.js "\$@" ;;
esac
EOF
chmod +x /usr/local/bin/stroyka
if [ -d /run/systemd/system ]; then
  sed "s|/usr/bin/node|$NODE|" "$APP/deploy/stroyka.service" > /etc/systemd/system/stroyka.service
  systemctl daemon-reload
  systemctl enable -q stroyka
  systemctl restart stroyka
else
  # без systemd (контейнер): фоновый процесс
  pkill -u stroyka -f "server/server.js" 2>/dev/null || true
  (cd "$APP" && set -a && . ./.env && set +a && nohup runuser -u stroyka -- "$NODE" server/server.js >> "$APP/data/server.log" 2>&1 &)
fi
for i in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null || die "Сервер не запустился: stroyka logs"

say "nginx + вход по паролю"
NEWPASS=""
if [ ! -f /etc/nginx/stroyka.htpasswd ] || [ -n "${PASSWORD:-}" ]; then
  NEWPASS="${PASSWORD:-$(tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 12)}"
  htpasswd -bc /etc/nginx/stroyka.htpasswd "$LOGIN" "$NEWPASS" >/dev/null 2>&1
fi
SERVER_NAME="${DOMAIN:-_}"
sed -e "s|server_name stroyka.example.ru;|server_name $SERVER_NAME;|" -e "s|127.0.0.1:8080|127.0.0.1:$PORT|" "$APP/deploy/nginx.conf" > /etc/nginx/sites-available/stroyka
ln -sf /etc/nginx/sites-available/stroyka /etc/nginx/sites-enabled/stroyka
[ -z "${DOMAIN:-}" ] && rm -f /etc/nginx/sites-enabled/default
nginx -t -q
if [ -d /run/systemd/system ]; then systemctl enable -q nginx; systemctl reload nginx || systemctl restart nginx; else nginx -s reload 2>/dev/null || nginx; fi
command -v ufw >/dev/null && ufw status | grep -q active && ufw allow 'Nginx Full' >/dev/null || true

if [ -n "${DOMAIN:-}" ]; then
  say "HTTPS для $DOMAIN"
  if [ -n "${EMAIL:-}" ]; then CB_MAIL=(-m "$EMAIL"); else CB_MAIL=(--register-unsafely-without-email); fi
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${CB_MAIL[@]}" \
    || echo "⚠ Сертификат не выпущен: проверьте, что A-запись $DOMAIN указывает на этот сервер, и повторите команду"
  SITE="https://$DOMAIN"
else
  SITE="http://$(curl -fs4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
fi

MODE_NOW=$(grep '^MODE=' "$APP/.env" | cut -d= -f2)
cat <<EOF

────────────────────────────────────────────────────────
 ✅ Стройка 3D запущена:  $SITE
    Логин: $LOGIN${NEWPASS:+   Пароль: $NEWPASS}
    Режим: $MODE_NOW $( [ "$MODE_NOW" = proxy ] && echo '(данные — Google-таблица)' || echo '(ссылки на таблицу нет — добавьте GOOGLE_API_URL и повторите команду)')

 Команды:
    stroyka status | logs | restart
    stroyka backup | list | restore <файл> | pull
 Обновление: повторите ту же команду установки.
 Данные и бэкапы: $APP/data
────────────────────────────────────────────────────────
EOF
