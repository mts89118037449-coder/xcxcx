#!/usr/bin/env bash
# Копирует бэкапы на второй сервер/диск, чтобы данные пережили потерю основного сервера.
# cron (каждый час):  0 * * * * /opt/stroyka/stroyka/deploy/backup-offsite.sh
set -euo pipefail
SRC="${SRC:-/opt/stroyka/stroyka/data/backups/}"
DEST="${DEST:-backup@second-server:/backups/stroyka/}"   # или локальная папка: /mnt/usb/stroyka/
rsync -a --ignore-existing "$SRC" "$DEST"
