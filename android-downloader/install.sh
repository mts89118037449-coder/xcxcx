#!/data/data/com.termux/files/usr/bin/bash
# Установщик универсального загрузчика для Android (Termux).
# Запуск в Termux:  bash install.sh
set -e

echo "== 1/4 Обновляю Termux и ставлю python, ffmpeg =="
yes | pkg update >/dev/null 2>&1 || true
pkg install -y python ffmpeg curl termux-api >/dev/null

echo "== 2/4 Ставлю yt-dlp и gallery-dl =="
pip install -q -U yt-dlp gallery-dl

echo "== 3/4 Доступ к памяти телефона (разрешите в появившемся окне) =="
[ -d "$HOME/storage/downloads" ] || termux-setup-storage
sleep 3

echo "== 4/4 Устанавливаю команду dl и «Поделиться → Termux» =="
mkdir -p "$HOME/bin" "$HOME/.cache"
cat > "$PREFIX/bin/dl" <<'DL_EOF'
#!/usr/bin/env bash
# Универсальный загрузчик: YouTube, TikTok, X/Twitter, Instagram, VK, Spotify (через поиск), SoundCloud и ещё ~1800 сайтов.
# Использование: dl <ссылка>   или   «Поделиться → Termux» из любого приложения.

set -u

OUT="${DL_DIR:-/storage/emulated/0/Download/Загрузчик}"
STAMP="${DL_STAMP:-$HOME/.cache/dl-last-update}"
COOKIES="${DL_COOKIES:-$HOME/cookies.txt}"

say() { printf '\033[1;36m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Приложения часто делятся текстом вида «Смотри видео! https://vm.tiktok.com/…» — достаём только ссылку.
RAW="${1:-}"
if [ -z "$RAW" ]; then read -rp "Ссылка: " RAW; fi
URL=$(printf '%s' "$RAW" | grep -oE 'https?://[^[:space:]]+' | head -n1)
if [ -z "$URL" ]; then err "Не нашёл ссылку в: $RAW"; exit 1; fi
mkdir -p "$OUT" || { err "Нет доступа к $OUT. Выполните: termux-setup-storage"; exit 1; }

# Сайты часто меняются — раз в неделю тихо обновляем загрузчики.
if [ -z "${DL_NO_UPDATE:-}" ] && { [ ! -f "$STAMP" ] || [ -n "$(find "$STAMP" -mtime +6 2>/dev/null)" ]; }; then
  say "Обновляю загрузчики (раз в неделю)…"
  if pip install -q -U yt-dlp gallery-dl >/dev/null 2>&1; then mkdir -p "$(dirname "$STAMP")" && touch "$STAMP"; fi
fi

# Spotify отдаёт музыку только в зашифрованном виде, поэтому берём название и исполнителя
# и скачиваем этот же трек с YouTube Music.
SOURCE="$URL"
DEFAULT=1
case "$URL" in
  *open.spotify.com/track/*|*spotify.link/*)
    PAGE=$(curl -sSL -A 'Mozilla/5.0' "$URL")
    TITLE=$(printf '%s' "$PAGE" | grep -oE 'og:title" content="[^"]*"' | head -n1 | sed 's/.*content="//; s/"$//')
    ARTIST=$(printf '%s' "$PAGE" | grep -oE 'og:description" content="[^"]*"' | head -n1 | sed 's/.*content="//; s/"$//; s/ · .*//')
    if [ -z "$TITLE" ]; then err "Не удалось прочитать трек Spotify"; exit 1; fi
    TITLE=$(printf '%s' "$TITLE" | sed 's/&amp;/\&/g; s/&#x27;/'"'"'/g; s/&quot;/"/g')
    ARTIST=$(printf '%s' "$ARTIST" | sed 's/&amp;/\&/g; s/&#x27;/'"'"'/g; s/&quot;/"/g')
    say "Spotify: $ARTIST — $TITLE"
    SOURCE="ytsearch1:$ARTIST - $TITLE audio"
    DEFAULT=3 ;;
  *open.spotify.com/*)
    err "Поддерживаются только ссылки на отдельные треки Spotify (open.spotify.com/track/…)"; exit 1 ;;
  *music.youtube.com*|*soundcloud.com*|*music.yandex*|*bandcamp.com*)
    DEFAULT=3 ;;
esac

CHOICE="${DL_FORMAT:-}"
if [ -z "$CHOICE" ] && [ -t 0 ]; then
  echo "1) Видео — лучшее качество"
  echo "2) Видео — до 720p (меньше весит)"
  echo "3) Только звук MP3"
  read -rt 8 -n1 -p "Выбор [$DEFAULT], через 8 сек. — по умолчанию: " CHOICE; echo
fi
CHOICE="${CHOICE:-$DEFAULT}"

ARGS=(--no-playlist --no-mtime --embed-metadata --newline
      -o "$OUT/%(title).90B [%(id)s].%(ext)s"
      --print after_move:filepath --progress)
[ -f "$COOKIES" ] && ARGS+=(--cookies "$COOKIES")
case "$CHOICE" in
  2) ARGS+=(-f 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b' --merge-output-format mp4) ;;
  3) ARGS+=(-x --audio-format mp3 --audio-quality 0) ;;
  *) ARGS+=(-f 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b' --merge-output-format mp4) ;;
esac

say "Скачиваю…"
LIST=$(mktemp)
yt-dlp "${ARGS[@]}" "$SOURCE" | tee "$LIST" | grep -v '^/'
FILES=$(grep '^/' "$LIST")
if [ -z "$FILES" ]; then
  # Фото, карусели, посты без видео (X/Twitter, Instagram, Pinterest, TikTok-слайдшоу) — через gallery-dl.
  say "Видео не найдено, пробую скачать фото…"
  GARGS=(-D "$OUT")
  [ -f "$COOKIES" ] && GARGS+=(--cookies "$COOKIES")
  FILES=$(gallery-dl "${GARGS[@]}" "$URL" 2>/dev/null | sed 's/^# //' | grep '^/')
fi
rm -f "$LIST"

if [ -z "${FILES:-}" ]; then
  err "Не получилось скачать. Причины: приватный пост, нужен вход (см. cookies в README) или сайт не поддерживается."
  have termux-notification && termux-notification -t "Загрузчик" -c "Ошибка: $URL"
  exit 1
fi

COUNT=$(printf '%s\n' "$FILES" | wc -l)
while IFS= read -r f; do
  say "✓ $(basename "$f")"
  have termux-media-scan && termux-media-scan "$f" >/dev/null 2>&1
done <<< "$FILES"
say "Готово: $COUNT файл(ов) в $OUT"
have termux-notification && termux-notification -t "Скачано: $COUNT" -c "$(basename "$(printf '%s\n' "$FILES" | head -n1)")"
exit 0
DL_EOF
chmod +x "$PREFIX/bin/dl"

# Termux вызывает этот файл, когда ссылкой «делятся» в Termux из любого приложения.
cat > "$HOME/bin/termux-url-opener" <<'OPENER_EOF'
#!/data/data/com.termux/files/usr/bin/bash
dl "$1"
echo; read -rt 5 -n1 -p "Окно закроется через 5 секунд…" || true
OPENER_EOF
chmod +x "$HOME/bin/termux-url-opener"
touch "$HOME/.cache/dl-last-update"

echo
echo "Готово! Теперь в любом приложении: Поделиться → Termux."
echo "Файлы сохраняются в: Загрузки/Загрузчик"
echo "Или вручную: dl <ссылка>"
