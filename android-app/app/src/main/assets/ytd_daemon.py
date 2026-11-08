# Постоянный процесс yt-dlp: Python и yt-dlp загружаются один раз, дальше запросы
# идут строками JSON через stdin/stdout. Аргументы: путь к yt-dlp (zip), путь к quickjs, папка кэша.
import sys, json, threading, re
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

def handle(req):
    rid = req.get("id")
    try:
        opts = dict(BASE); opts.update(req.get("opts") or {})
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(req["url"], download=False)
        if req.get("op") == "search":
            res = [{"url": e.get("url") or e.get("webpage_url"), "title": e.get("title"),
                    "artist": e.get("artist") or (e.get("artists") or [None])[0] or e.get("creator") or e.get("uploader") or e.get("channel"),
                    "duration": e.get("duration"), "views": e.get("view_count"), "id": e.get("id")}
                   for e in (info.get("entries") or []) if e]
        else:
            fmts = info.get("requested_formats") or [info]
            res = {"urls": [f.get("url") for f in fmts if f.get("url")], "thumbnail": info.get("thumbnail"),
                   "page": info.get("webpage_url"), "title": info.get("title"), "duration": info.get("duration"),
                   "abr": max([f.get("abr") or 0 for f in fmts] or [0]), "ext": fmts[0].get("ext"), "acodec": fmts[0].get("acodec")}
        out({"id": rid, "ok": True, "data": res})
    except BaseException as e:
        out({"id": rid, "ok": False, "error": str(e)[:600]})

out({"ready": True, "version": yt_dlp.version.__version__})
pool = ThreadPoolExecutor(6)
while True:
    line = sys.stdin.readline()
    if not line: break
    line = line.strip()
    if not line: continue
    try:
        pool.submit(handle, json.loads(line))
    except Exception as e:
        out({"ok": False, "error": str(e)})
