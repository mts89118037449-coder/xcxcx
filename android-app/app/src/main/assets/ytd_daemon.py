# Постоянный процесс yt-dlp: Python и yt-dlp загружаются один раз, дальше запросы
# идут строками JSON через stdin/stdout. Аргументы: путь к yt-dlp (zip), путь к quickjs, папка кэша.
import sys, json, threading, re, os, tempfile
from concurrent.futures import ThreadPoolExecutor
if len(sys.argv) > 1: sys.path.insert(0, sys.argv[1])
import yt_dlp

# SoundCloud: yt-dlp проверяет 8 вариантов обложки сетевыми запросами (~2,5 с на поиск).
# Берём сразу 500x500 — она есть всегда.
try:
    from yt_dlp.extractor import soundcloud as _sc
    def _fast_thumbs(self, info):
        u = info.get('artwork_url') or (info.get('user') or {}).get('avatar_url')
        if not u: return []
        return [{'id': 't500x500', 'url': re.sub(self._IMAGE_REPL_RE, '-t500x500.jpg', u), 'width': 500, 'height': 500}]
    _sc.SoundcloudBaseIE._extract_thumbnails = _fast_thumbs
except Exception:
    pass

lock = threading.Lock()
def out(o):
    s = json.dumps(o, ensure_ascii=False)
    with lock:
        sys.stdout.write(s + "\n"); sys.stdout.flush()

BASE = {"quiet": True, "no_warnings": True, "noprogress": True, "skip_download": True}
if len(sys.argv) > 2 and sys.argv[2]: BASE["js_runtimes"] = {"quickjs": {"path": sys.argv[2]}}
if len(sys.argv) > 3 and sys.argv[3]: BASE["cachedir"] = sys.argv[3]

cancelled = set()  # метки отменённых поисков: ещё не начатые запросы с ними пропускаем

# Куки: yt-dlp в конце каждого запроса перезаписывает файл куки. Запросы идут параллельно — один читал файл, пока другой
# его стёр и пишет заново, и падал с «does not look like a Netscape format cookies file» (журнал 17.11: так «не играли»
# SoundCloud, Rutube и Яндекс). Каждому запросу — своя копия; общий файл yt-dlp больше не трогает.
def cookie_copy(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f: text = f.read()
        lines = [l for l in text.splitlines() if l.strip()]
        if not lines or not re.match(r"#( Netscape)? HTTP Cookie File", lines[0]): return None
        fd, tmp = tempfile.mkstemp(prefix="ck-", suffix=".txt", dir=os.path.dirname(path))
        with os.fdopen(fd, "w", encoding="utf-8") as f: f.write(text)
        return tmp
    except Exception:
        return None

def handle(req):
    rid = req.get("id")
    if req.get("tag") and req["tag"] in cancelled:
        out({"id": rid, "ok": False, "error": "cancelled"})
        return
    tmp = None
    try:
        opts = dict(BASE); opts.update(req.get("opts") or {})
        if opts.get("cookiefile"):
            tmp = cookie_copy(opts["cookiefile"])
            if tmp: opts["cookiefile"] = tmp
            else: opts.pop("cookiefile", None)  # файл испорчен — работаем без него, а не падаем
        info = None
        url = req["url"]
        # Звук с YouTube: сначала лёгкий клиент без JavaScript (секунды вместо десятков секунд на телефоне);
        # не вышло — обычный путь.
        if req.get("op") not in ("search", "playlist") and ("youtube.com/" in url or "youtu.be/" in url) and not opts.get("cookiefile"):
            try:
                fast = dict(opts); fast.pop("js_runtimes", None)
                fast["extractor_args"] = {"youtube": {"player_client": ["visionos"]}}
                with yt_dlp.YoutubeDL(fast) as ydl:
                    got = ydl.extract_info(url, download=False)
                if any(f.get("url") for f in (got.get("requested_formats") or [got])): info = got
            except BaseException:
                info = None
        if info is None:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
        if req.get("op") == "playlist":
            res = {"title": info.get("title"), "entries": [{"url": e.get("url") or e.get("webpage_url"), "title": e.get("title"),
                    "artist": e.get("artist") or e.get("uploader") or e.get("channel"), "duration": e.get("duration")}
                   for e in (info.get("entries") or []) if e]}
        elif req.get("op") == "search":
            res = [{"url": e.get("url") or e.get("webpage_url"), "title": e.get("title"),
                    "artist": e.get("artist") or (e.get("artists") or [None])[0] or e.get("creator") or e.get("uploader") or e.get("channel"),
                    "duration": e.get("duration"), "views": e.get("view_count"), "id": e.get("id")}
                   for e in (info.get("entries") or []) if e]
        else:
            fmts = info.get("requested_formats") or [info]
            res = {"urls": [f.get("url") for f in fmts if f.get("url")], "thumbnail": info.get("thumbnail"),
                   "page": info.get("webpage_url"), "title": info.get("title"), "duration": info.get("duration"),
                   "artist": info.get("artist") or (info.get("artists") or [None])[0] or info.get("creator") or info.get("uploader") or info.get("channel"),
                   "abr": max([f.get("abr") or 0 for f in fmts] or [0]), "ext": fmts[0].get("ext"), "acodec": fmts[0].get("acodec")}
        out({"id": rid, "ok": True, "data": res})
    except BaseException as e:
        msg = str(e)[:600]
        # Не ошибка сайта, а сбой в коде (например «'NoneType' object is not subscriptable», журнал 20.11) — с местом, где случился.
        if not isinstance(e, yt_dlp.utils.DownloadError):
            import traceback
            tb = traceback.extract_tb(e.__traceback__)
            if tb: msg += " @ " + " ← ".join(f"{f.filename.rsplit('/', 1)[-1]}:{f.lineno} {f.name}" for f in tb[-3:][::-1])
        out({"id": rid, "ok": False, "error": msg})
    finally:
        if tmp:
            try: os.remove(tmp)
            except Exception: pass

out({"ready": True, "version": yt_dlp.version.__version__})
# Нажатое человеком — в своём пуле, подготовка заранее («bg») — в отдельном, чтобы не стоять в очереди за ней.
pool = ThreadPoolExecutor(10)
bg_pool = ThreadPoolExecutor(4)
while True:
    line = sys.stdin.readline()
    if not line: break
    line = line.strip()
    if not line: continue
    try:
        req = json.loads(line)
        if req.get("op") == "cancel":
            cancelled.add(req.get("tag"))
            if len(cancelled) > 500: cancelled.clear()
            continue
        (bg_pool if req.get("bg") else pool).submit(handle, req)
    except Exception as e:
        out({"ok": False, "error": str(e)})
