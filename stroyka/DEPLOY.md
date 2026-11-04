# Развёртывание на своём сервере и бэкапы

Сервер — один файл `server/server.js` (Node.js 18+, без зависимостей). Он раздаёт приложение и API `/api`, которое понимает приложение. Внешних CDN нет: three.js лежит в `vendor/`, шрифты системные.

## Режимы

| `MODE` | Где данные | Когда использовать |
|---|---|---|
| `proxy` | В Google-таблице, на сервере лежит её копия | Пока работаете через таблицу. Если Google недоступен, приложение показывает копию с сервера |
| `standalone` | На сервере (`data/db.json`) | Google заблокирован или не нужен |

Если задан `GOOGLE_API_URL`, сервер в обоих режимах снимает копию таблицы (по умолчанию раз в 5 минут) и после каждой правки.

## Установка (Ubuntu 22.04 / 24.04, вариант с Docker)

```bash
# 1. Пакеты
sudo apt update
sudo apt install -y git docker.io docker-compose-v2 nginx apache2-utils certbot python3-certbot-nginx

# 2. Код (репозиторий приватный: при запросе пароля введите GitHub-токен с правом чтения)
sudo git clone -b ccr-daed372c-kxhkyu https://github.com/mts89118037449-coder/xcxcx.git /opt/stroyka
cd /opt/stroyka/stroyka

# 3. Настройки
sudo cp deploy/env.example .env
sudo nano .env          # MODE, GOOGLE_API_URL (ссылка …/exec), при желании API_TOKEN

# 4. Запуск
sudo docker compose up -d --build
# если Docker Hub недоступен:
# sudo NODE_IMAGE=mirror.gcr.io/library/node:20-alpine docker compose up -d --build
curl -s localhost:8080/healthz     # {"ok":true,...}

# 5. Домен, пароль на вход, HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/stroyka
sudo sed -i 's/stroyka.example.ru/ВАШ-ДОМЕН/' /etc/nginx/sites-available/stroyka
sudo ln -s /etc/nginx/sites-available/stroyka /etc/nginx/sites-enabled/
sudo htpasswd -c /etc/nginx/stroyka.htpasswd prorab      # логин и пароль для входа
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ВАШ-ДОМЕН                          # бесплатный сертификат
```

После этого откройте `https://ВАШ-ДОМЕН`. Приложение подключается к серверу само, ничего вводить не нужно.

### Без Docker (systemd)

```bash
sudo apt install -y nodejs git          # в Ubuntu 24.04 — Node 18, этого достаточно
sudo useradd -r -s /usr/sbin/nologin stroyka
sudo git clone -b ccr-daed372c-kxhkyu https://github.com/mts89118037449-coder/xcxcx.git /opt/stroyka
cd /opt/stroyka/stroyka && sudo cp deploy/env.example .env && sudo nano .env
sudo chown -R stroyka:stroyka /opt/stroyka
sudo cp deploy/stroyka.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now stroyka
systemctl status stroyka
```

nginx и HTTPS — как в шаге 5.

## Бэкапы

Автоматически в `data/backups/*.json.gz`:
- после правки (не чаще раза в 10 минут);
- каждый час, если были изменения;
- при остановке сервера;
- при каждой новой версии Google-таблицы.

Хранятся последние `BACKUP_KEEP` файлов (по умолчанию 400).

```bash
# Docker:  sudo docker compose exec stroyka node server/server.js <команда>
# systemd: cd /opt/stroyka/stroyka && sudo -u stroyka node server/server.js <команда>

node server/server.js backup                 # снять бэкап сейчас
node server/server.js list                   # список бэкапов
node server/server.js restore <файл>         # восстановить (бэкап сервера или «Скачать копию» из приложения)
node server/server.js pull                   # забрать все данные из Google-таблицы в db.json
```

`restore` можно запускать при работающем сервере: он перечитает базу сам, а перед восстановлением сохранит текущее состояние (`before-restore`).

**Копия на второй сервер или диск** (раз в час):

```bash
sudo crontab -e
0 * * * * SRC=/opt/stroyka/stroyka/data/backups/ DEST=backup@ВТОРОЙ-СЕРВЕР:/backups/stroyka/ /opt/stroyka/stroyka/deploy/backup-offsite.sh
```

**В самом приложении** («Таблица…» → «Резервная копия»):
- «Скачать копию (JSON)» — полный снимок всех данных;
- CSV для Excel — расходы, журнал, прогресс;
- «Восстановить из файла» — восстановление из такого файла или из `.json.gz` сервера.

Каждое устройство хранит последнюю загруженную версию данных. Если сервер недоступен, приложение всё равно откроется и покажет её: файлы приложения кэшируются в офлайн-режиме. Правки ждут в очереди и уйдут, когда связь вернётся.

## Если Google заблокировали

```bash
cd /opt/stroyka/stroyka
sudo docker compose exec stroyka node server/server.js pull   # последние данные таблицы → db.json
sudo sed -i 's/^MODE=.*/MODE=standalone/' .env
sudo docker compose up -d
```

Дальше все данные хранятся на сервере. Если `pull` не дотягивается до Google, он возьмёт последнюю копию из `data/google-mirror.json`.

## Обновление

```bash
cd /opt/stroyka && sudo git pull
cd stroyka && sudo docker compose up -d --build      # или: sudo systemctl restart stroyka
```

Данные в `data/` при обновлении не трогаются.
