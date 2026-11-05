#!/usr/bin/env bash
# Подключение Google-таблицы «Glorax_Учёт» к уже установленной Стройке 3D.
# Создаёт и публикует скрипт таблицы через clasp; с телефона нужно только открыть ссылки и нажать «Разрешить».
# Повторный запуск обновляет код скрипта (адрес остаётся прежним). Сайт и nginx не трогает.
#   bash /opt/stroyka/stroyka/deploy/connect-google.sh
set -euo pipefail
trap 'echo "✖ Ошибка в строке $LINENO: $BASH_COMMAND" >&2' ERR
say() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Запустите от root"
APP="${APP:-/opt/stroyka/stroyka}"
[ -f "$APP/.env" ] || die "Стройка 3D не установлена: нет $APP/.env"
NODE=$(command -v node) || die "Нет Node.js"
command -v npm >/dev/null || apt-get install -y -qq npm >/dev/null 2>&1 || true
# ───────────────────────── Google-таблица: скрипт создаётся и публикуется с VPS ─────────────────────────
SHEET_ID=1H-0BjSxyU60e4O7LVViPMi1bJYX9quiKk1TFKsuHJlo
TTY="${TTY:-/dev/tty}"
GAS=/opt/stroyka-gas                      # проект скрипта и инструменты (вне git, только root)
CLASP_DIR=/opt/stroyka-clasp
CLASP="$CLASP_DIR/node_modules/.bin/clasp"
# Секретный ключ скрипта: без него скрипт таблицы не отдаёт данные (знает только этот сервер)
if ! grep -q '^GOOGLE_TOKEN=.\+' "$APP/.env"; then
  TOK=$("$NODE" -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')
  if grep -q '^GOOGLE_TOKEN=' "$APP/.env"; then sed -i "s|^GOOGLE_TOKEN=.*|GOOGLE_TOKEN=$TOK|" "$APP/.env"; else echo "GOOGLE_TOKEN=$TOK" >> "$APP/.env"; fi
fi
GTOKEN=$(grep '^GOOGLE_TOKEN=' "$APP/.env" | head -1 | cut -d= -f2-)
gas_files() {  # положить в проект актуальный код из репозитория + ключ
  find "$GAS" -maxdepth 1 \( -name '*.js' -o -name '*.gs' \) -delete
  cp "$APP/apps-script/Code.gs" "$APP/apps-script/appsscript.json" "$GAS/"
  printf "const GEN_TOKEN = '%s';\n" "$GTOKEN" > "$GAS/Secret.gs"
  printf '**/**\n!Code.gs\n!Secret.gs\n!appsscript.json\n' > "$GAS/.claspignore"   # в Google уходят только эти файлы
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
    if curl -fsSL --max-time 20 "$EXEC?action=version&token=$GTOKEN" 2>/dev/null | grep -q '"ok":true'; then OKG=1; break; fi
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

