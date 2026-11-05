#!/usr/bin/env bash
# Стройка 3D — установка на VPS (Ubuntu 22.04/24.04, Debian 11/12). Всё, что нужно с телефона, — открыть ссылки.
#
#   apt update && apt install -y gh git && gh auth login -h github.com -p https -w \
#     && gh repo clone mts89118037449-coder/xcxcx /opt/stroyka -- -b ccr-daed372c-kxhkyu \
#     && bash /opt/stroyka/stroyka/deploy/install.sh
#
# Скрипт сам: ставит Node.js и nginx, запускает приложение, закрывает вход паролем, выпускает HTTPS,
# создаёт и публикует скрипт Google-таблицы (clasp) и ждёт, пока владелец нажмёт «Разрешить».
#
# Переменные (все необязательные, кроме GH_TOKEN для приватного репозитория):
#   GH_TOKEN        GitHub-токен с правом чтения репозитория (на диске не сохраняется)
#   DOMAIN          домен → nginx + бесплатный HTTPS (Let's Encrypt). Без домена — http://IP
#   EMAIL           почта для Let's Encrypt (уведомления об истечении сертификата)
#   GOOGLE_API_URL  ссылка …/exec скрипта таблицы, если он уже опубликован (иначе скрипт создастся сам)
#   SKIP_GOOGLE=1   не создавать скрипт таблицы
#   LOGIN/PASSWORD  вход на сайт; пароль по умолчанию генерируется и печатается в конце
#   NO_AUTH=1       сайт без логина и пароля (выбор запоминается; NO_AUTH=0 — вернуть пароль)
#   BRANCH          ветка (по умолчанию ccr-daed372c-kxhkyu)
#   REPO_URL        другой адрес репозитория (зеркало GitLab/свой git), если GitHub недоступен
# Повторный запуск той же командой = обновление: данные и .env сохраняются.
set -euo pipefail
trap 'echo "✖ Ошибка в строке $LINENO: $BASH_COMMAND" >&2' ERR

REPO="mts89118037449-coder/xcxcx"
BRANCH="${BRANCH:-ccr-daed372c-kxhkyu}"
DIR=/opt/stroyka
APP="$DIR/stroyka"
# Порты подбираются так, чтобы не мешать тому, что уже работает на сервере (VPN/VLESS, панели и т.п.)
busy() { ss -Hltn "sport = :$1" 2>/dev/null | grep -q LISTEN; }
first_free() { for p in "$@"; do busy "$p" || { echo "$p"; return; }; done; echo ""; }
if [ -f /opt/stroyka/stroyka/.env ]; then PORT="${PORT:-$(grep '^PORT=' /opt/stroyka/stroyka/.env | cut -d= -f2)}"; fi
PORT="${PORT:-$(first_free 8080 18080 18081 18082 28080)}"
[ -n "$PORT" ] || { echo "Нет свободного внутреннего порта, задайте PORT=…"; exit 1; }
LOGIN="${LOGIN:-prorab}"

say() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Запустите через sudo"
command -v apt-get >/dev/null || die "Нужен Ubuntu или Debian (apt)"
export DEBIAN_FRONTEND=noninteractive

NGINX_WAS=$(command -v nginx || true)   # nginx уже стоял (например, для VPN) — его сайты не трогаем
say "Пакеты: git, nginx, curl"
apt-get update -qq
apt-get install -y -qq git nginx apache2-utils curl ca-certificates xz-utils iproute2 >/dev/null
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
command -v npm >/dev/null || apt-get install -y -qq npm >/dev/null 2>&1 || true
NODE=$(command -v node)
echo "node $(node -v) → $NODE"

say "Код приложения → $DIR"
id stroyka >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d "$DIR" stroyka
URL="${REPO_URL:-https://github.com/$REPO.git}"   # REPO_URL — зеркало, если GitHub недоступен
AUTH_URL="$URL"; [ -n "${GH_TOKEN:-}" ] && [ -z "${REPO_URL:-}" ] && AUTH_URL="https://x-access-token:${GH_TOKEN}@github.com/$REPO.git"
git config --global --add safe.directory "$DIR" 2>/dev/null || true
command -v gh >/dev/null && gh auth status -h github.com >/dev/null 2>&1 && gh auth setup-git -h github.com >/dev/null 2>&1 || true
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
  (cd "$APP" && set -a && . ./.env && set +a && exec nohup runuser -u stroyka -- "$NODE" server/server.js) >> "$APP/data/server.log" 2>&1 < /dev/null &
fi
for i in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null || die "Сервер не запустился: stroyka logs"

say "nginx + вход по паролю"
NEWPASS=""
[ "${NO_AUTH:-}" = 1 ] && touch /etc/nginx/stroyka.noauth
[ "${NO_AUTH:-}" = 0 ] && rm -f /etc/nginx/stroyka.noauth
NOAUTH=0; [ -f /etc/nginx/stroyka.noauth ] && NOAUTH=1
if [ "$NOAUTH" = 0 ] && { [ ! -f /etc/nginx/stroyka.htpasswd ] || [ -n "${PASSWORD:-}" ]; }; then
  NEWPASS="${PASSWORD:-$( (tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 12) 2>/dev/null || true )}"
  [ ${#NEWPASS} -ge 8 ] || die "Не удалось сгенерировать пароль, задайте PASSWORD=…"
  htpasswd -bc /etc/nginx/stroyka.htpasswd "$LOGIN" "$NEWPASS" >/dev/null
fi
SERVER_NAME="${DOMAIN:-_}"
# Внешний порт сайта: при повторном запуске — прежний; иначе 80, если он свободен, иначе первый свободный
SITE_CONF=/etc/nginx/sites-available/stroyka
WEB_PORT="${WEB_PORT:-}"
[ -z "$WEB_PORT" ] && [ -f "$SITE_CONF" ] && WEB_PORT=$(grep -m1 -oE 'listen [0-9]+' "$SITE_CONF" | awk '{print $2}')
if [ -z "$WEB_PORT" ]; then
  if [ -z "$NGINX_WAS" ] && [ -z "${DOMAIN:-}" ]; then
    rm -f /etc/nginx/sites-enabled/default      # nginx поставили мы — его пустой сайт по умолчанию не нужен
    nginx -s stop 2>/dev/null || systemctl stop nginx 2>/dev/null || true
  fi
  WEB_PORT=$(first_free 80 8088 8880 8000 9080 10080)
fi
[ -n "$WEB_PORT" ] || die "Нет свободного порта для сайта, задайте WEB_PORT=…"
DEF=""; [ -z "${DOMAIN:-}" ] && DEF=" default_server"   # без домена сайт открывается по IP:порт
sed -e "s|listen 80;|listen $WEB_PORT$DEF;|" -e "s|server_name stroyka.example.ru;|server_name $SERVER_NAME;|" -e "s|127.0.0.1:8080|127.0.0.1:$PORT|" "$APP/deploy/nginx.conf" > "$SITE_CONF"
[ "$NOAUTH" = 1 ] && sed -i '/auth_basic/d' "$SITE_CONF"   # вход без пароля
rm -f /etc/nginx/sites-enabled/stroyka
ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/stroyka
if ! nginx -t -q 2>/dev/null; then
  sed -i "s| default_server;|;|" "$SITE_CONF"   # «default_server» уже занят другим сайтом
  nginx -t -q || { rm -f /etc/nginx/sites-enabled/stroyka; die "Конфигурация nginx не прошла проверку — сайт stroyka отключён, остальное не тронуто"; }
fi
if [ -d /run/systemd/system ]; then systemctl enable -q nginx; systemctl reload nginx 2>/dev/null || systemctl restart nginx; else nginx -s reload 2>/dev/null || nginx </dev/null >/dev/null 2>&1; fi
command -v ufw >/dev/null && ufw status | grep -q active && ufw allow "$WEB_PORT/tcp" >/dev/null || true

if [ -n "${DOMAIN:-}" ] && busy 443 && ! ss -Hltnp "sport = :443" 2>/dev/null | grep -q nginx; then
  echo "⚠ Порт 443 занят другой программой (VPN/VLESS) — HTTPS не выпускаю, чтобы её не сломать. Сайт работает по http на порту $WEB_PORT."
  SITE="http://$DOMAIN$( [ "$WEB_PORT" = 80 ] || echo ":$WEB_PORT")"
elif [ -n "${DOMAIN:-}" ]; then
  say "HTTPS для $DOMAIN"
  if [ -n "${EMAIL:-}" ]; then CB_MAIL=(-m "$EMAIL"); else CB_MAIL=(--register-unsafely-without-email); fi
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${CB_MAIL[@]}" \
    || echo "⚠ Сертификат не выпущен: проверьте, что A-запись $DOMAIN указывает на этот сервер, и повторите команду"
  SITE="https://$DOMAIN"
else
  SITE="http://$(curl -fs4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')$( [ "$WEB_PORT" = 80 ] || echo ":$WEB_PORT")"
fi

# ───────────────────────── Google-таблица ─────────────────────────
[ "${SKIP_GOOGLE:-}" = 1 ] || APP="$APP" bash "$APP/deploy/connect-google.sh" || echo "⚠ Таблица не подключена — повторите: bash $APP/deploy/connect-google.sh"

MODE_NOW=$(grep '^MODE=' "$APP/.env" | cut -d= -f2)
cat <<EOF

────────────────────────────────────────────────────────
 ✅ Стройка 3D запущена:  $SITE
    Порт сайта: $WEB_PORT (если не открывается — откройте этот порт в панели провайдера VPS)
    $( [ "$NOAUTH" = 1 ] && echo "Вход: без пароля" || echo "Логин: $LOGIN${NEWPASS:+   Пароль: $NEWPASS}")
    Пароль руководителя (финансы): $(stroyka fin-password 2>/dev/null | grep -o '[^ ]*$')
    Ссылка без пароля — вид для рабочих: работы, этажи, люди, материалы; без денег.
    Режим: $MODE_NOW $( [ "$MODE_NOW" = proxy ] && echo '(данные — Google-таблица)' || echo '(ссылки на таблицу нет — добавьте GOOGLE_API_URL и повторите команду)')

 Команды:
    stroyka status | logs | restart
    stroyka backup | list | restore <файл> | pull
    stroyka fin-password [новый]   — показать / сменить пароль руководителя
 Обновление: повторите ту же команду установки.
 Данные и бэкапы: $APP/data
────────────────────────────────────────────────────────
EOF
