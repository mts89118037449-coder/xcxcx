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
#   BRANCH          ветка (по умолчанию ccr-daed372c-kxhkyu)
#   REPO_URL        другой адрес репозитория (зеркало GitLab/свой git), если GitHub недоступен
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
if [ ! -f /etc/nginx/stroyka.htpasswd ] || [ -n "${PASSWORD:-}" ]; then
  NEWPASS="${PASSWORD:-$(tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 12)}"
  htpasswd -bc /etc/nginx/stroyka.htpasswd "$LOGIN" "$NEWPASS" >/dev/null 2>&1
fi
SERVER_NAME="${DOMAIN:-_}"
sed -e "s|server_name stroyka.example.ru;|server_name $SERVER_NAME;|" -e "s|127.0.0.1:8080|127.0.0.1:$PORT|" "$APP/deploy/nginx.conf" > /etc/nginx/sites-available/stroyka
ln -sf /etc/nginx/sites-available/stroyka /etc/nginx/sites-enabled/stroyka
[ -z "${DOMAIN:-}" ] && rm -f /etc/nginx/sites-enabled/default
nginx -t -q
if [ -d /run/systemd/system ]; then systemctl enable -q nginx; systemctl reload nginx || systemctl restart nginx; else nginx -s reload 2>/dev/null || nginx </dev/null >/dev/null 2>&1; fi
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

# ───────────────────────── Google-таблица: скрипт создаётся и публикуется с VPS ─────────────────────────
SHEET_ID=1H-0BjSxyU60e4O7LVViPMi1bJYX9quiKk1TFKsuHJlo
TTY="${TTY:-/dev/tty}"
GAS=/opt/stroyka-gas                      # проект скрипта и инструменты (вне git, только root)
CLASP_DIR=/opt/stroyka-clasp
CLASP="$CLASP_DIR/node_modules/.bin/clasp"
gas_files() {  # положить в проект актуальный код из репозитория
  find "$GAS" -maxdepth 1 \( -name '*.js' -o -name '*.gs' \) -delete
  cp "$APP/apps-script/Code.gs" "$APP/apps-script/appsscript.json" "$GAS/"
  printf '**/**\n!Code.gs\n!appsscript.json\n' > "$GAS/.claspignore"   # в Google уходят только эти два файла
}
set_api_url() {
  sed -i "s|^GOOGLE_API_URL=.*|GOOGLE_API_URL=$1|; s|^MODE=.*|MODE=proxy|" "$APP/.env"
  if [ -d /run/systemd/system ]; then systemctl restart stroyka; else pkill -u stroyka -f server/server.js; (cd "$APP" && set -a && . ./.env && set +a && exec nohup runuser -u stroyka -- "$NODE" server/server.js) >> "$APP/data/server.log" 2>&1 < /dev/null & fi
}
HAVE_URL=$(grep -c '^GOOGLE_API_URL=.\+' "$APP/.env" || true)
if [ -f "$GAS/.clasp.json" ] && [ -f "$GAS/deployment-id" ]; then
  say "Обновление скрипта Google-таблицы"
  gas_files
  (cd "$GAS" && "$CLASP" push -f >/dev/null && "$CLASP" deploy -i "$(cat deployment-id)" -d "Стройка 3D $(date +%F)" >/dev/null) \
    && echo "скрипт обновлён, ссылка прежняя" || echo "⚠ Не удалось обновить скрипт (stroyka работает на прежней версии)"
elif [ "$HAVE_URL" = 0 ] && [ "${SKIP_GOOGLE:-}" != 1 ]; then
  say "Подключение Google-таблицы «Glorax_Учёт»"
  mkdir -p "$GAS" "$CLASP_DIR" && chmod 700 "$GAS"
  [ -x "$CLASP" ] || npm install --silent --prefix "$CLASP_DIR" @google/clasp@3.4.1 >/dev/null 2>&1 || die "Не удалось установить clasp (npm)"
  cat <<'TXT'

  Шаг 1 из 3 (на телефоне): откройте ссылку и включите переключатель «Google Apps Script API»:
      https://script.google.com/home/usersettings

TXT
  read -r -p "  Включили? Нажмите Enter… " _ <"$TTY"
  cat <<'TXT'

  Шаг 2 из 3: сейчас появится длинная ссылка. Откройте её на телефоне, войдите в аккаунт
  владельца таблицы и нажмите «Разрешить». Браузер покажет ошибку «не удаётся открыть страницу
  localhost» — это нормально: скопируйте адрес этой страницы целиком и вставьте сюда.

TXT
  "$CLASP" login --no-localhost <"$TTY" || die "Вход в Google не выполнен — повторите команду установки"
  cd "$GAS"
  if [ ! -f .clasp.json ]; then
    "$CLASP" create --type sheets --title "Стройка 3D — API" --parentId "$SHEET_ID" --rootDir . >/dev/null \
      || die "Не удалось создать скрипт в таблице (включён ли Apps Script API на шаге 1?)"
  fi
  gas_files
  "$CLASP" push -f >/dev/null || die "Не удалось загрузить код скрипта"
  DEP_JSON=$("$CLASP" --json deploy -d "Стройка 3D") || die "Не удалось опубликовать скрипт"
  DEP_ID=$(printf '%s' "$DEP_JSON" | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=s.match(/\{[\s\S]*\}/);console.log(JSON.parse(m[0]).deploymentId)})')
  [ -n "$DEP_ID" ] || die "Не удалось получить адрес скрипта: $DEP_JSON"
  echo "$DEP_ID" > deployment-id
  EXEC="${GAS_EXEC_BASE:-https://script.google.com/macros/s}/$DEP_ID/exec"
  cd /
  set_api_url "$EXEC"
  cat <<TXT

  Шаг 3 из 3 (на телефоне): откройте ссылку и разрешите скрипту доступ к таблице и Диску:
      $EXEC

  Google покажет «Приложение не проверено» — нажмите «Дополнительные настройки» →
  «Перейти на страницу Стройка 3D — API» → «Разрешить». Появится «✓ Стройка 3D подключена».

TXT
  printf '  Жду разрешения'
  OKG=0
  for i in $(seq 1 180); do
    if curl -fsSL --max-time 20 "$EXEC?action=version" 2>/dev/null | grep -q '"ok":true'; then OKG=1; break; fi
    printf '.'; sleep 5
  done
  echo
  if [ "$OKG" = 1 ]; then
    echo "  ✓ Таблица подключена: данные читаются и пишутся в «Glorax_Учёт», ежедневный бэкап на Диск включён"
    set_api_url "$EXEC"
  else
    echo "  ⚠ Разрешение пока не получено. Откройте ссылку выше и нажмите «Разрешить» — сервер подключится сам."
  fi
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
