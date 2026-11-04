# Развёртывание на своём сервере и бэкапы

Сервер — один файл `server/server.js` (Node.js 18+, без зависимостей). Он раздаёт приложение и API `/api`, которое понимает приложение. Внешних CDN нет: three.js лежит в `vendor/`, шрифты системные.

## Режимы

Источник данных — **Google-таблица «Glorax_Учёт»**. Сервер — только посредник и запасная копия.

| `MODE` | Где данные | Когда использовать |
|---|---|---|
| `proxy` (по умолчанию) | В Google-таблице, на сервере лежит её копия | Всегда. Если Google недоступен, приложение показывает копию с сервера |
| `standalone` | На сервере (`data/db.json`) | Только если Google заблокировали надолго |

Если задан `GOOGLE_API_URL`, сервер в обоих режимах снимает копию таблицы (по умолчанию раз в 5 минут) и после каждой правки.

## Установка одной командой (всё с телефона)

Нужен VPS с Ubuntu 22.04/24.04 или Debian 11/12. Подключитесь к нему по SSH, например из приложения Termius или JuiceSSH, войдите под root (`sudo -i`) и вставьте:

```bash
apt update && apt install -y gh git && gh auth login -h github.com -p https -w && gh repo clone mts89118037449-coder/xcxcx /opt/stroyka -- -b ccr-daed372c-kxhkyu && DOMAIN=stroyka.ваш-домен.ru bash /opt/stroyka/stroyka/deploy/install.sh
```

Без домена уберите `DOMAIN=…` — сайт будет по `http://IP-сервера`.

По ходу установки на телефоне нужно только открыть ссылки:

1. **GitHub.** Команда покажет код из 8 символов. Откройте <https://github.com/login/device>, введите код, нажмите «Authorize». На вопрос «Authenticate Git with your GitHub credentials?» ответьте Enter.
2. **Apps Script API.** Откройте <https://script.google.com/home/usersettings> и включите переключатель «Google Apps Script API». Вернитесь в терминал и нажмите Enter.
3. **Вход clasp.** Терминал покажет длинную ссылку. Откройте её, выберите аккаунт владельца таблицы и нажмите «Разрешить». Браузер покажет ошибку «localhost» — это нормально. Скопируйте адрес этой страницы целиком и вставьте в терминал.
4. **Разрешение скрипту.** Терминал покажет ссылку `…/exec`. Откройте её. На экране «Приложение не проверено» нажмите «Дополнительные настройки» → «Перейти на страницу Стройка 3D — API» → «Разрешить».

Дальше всё произойдёт само:
- скрипт создастся внутри «Glorax_Учёт» (Расширения → Apps Script);
- включатся триггеры изменений и ежедневный бэкап на Диск;
- сервер переключится на таблицу;
- в конце напечатаются адрес сайта, логин и пароль.

**Подключить таблицу к уже установленному серверу** (сайт и nginx не меняются): `bash /opt/stroyka/stroyka/deploy/connect-google.sh`.

**Сайт без логина и пароля:** `NO_AUTH=1` при установке. Выбор запоминается; `NO_AUTH=0` возвращает пароль.

**Обновление** — команда `bash /opt/stroyka/stroyka/deploy/install.sh`. Она обновит приложение и код скрипта в таблице, адрес скрипта останется прежним, данные и пароль сохранятся.

Дополнительные переменные: `EMAIL` (для HTTPS-сертификата), `LOGIN` / `PASSWORD` (вход на сайт), `GOOGLE_API_URL` (если скрипт уже опубликован вручную), `SKIP_GOOGLE=1` (не подключать таблицу), `REPO_URL` (зеркало репозитория).

После установки:

```bash
stroyka status          # состояние
stroyka logs            # журнал
stroyka backup | list | restore <файл> | pull
```

## Установка вручную (Ubuntu 22.04 / 24.04, вариант с Docker)

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

**На Google Диске** (главное, работает внутри Google, сервер не нужен): скрипт таблицы каждый день в 03:00 кладёт в папку [«Стройка 3D — бэкапы»](https://drive.google.com/drive/folders/1V9zW5kvqI9pC3eICf2vJ3-lg2JaHg-te) полную копию таблицы и JSON всех данных приложения. Копии хранятся 60 дней. Запустить вручную: в Apps Script выберите `backupToDrive` → «Выполнить».

**На сервере** автоматически в `data/backups/*.json.gz`:
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
