#!/bin/zsh
set -eu

cd -- "${0:A:h}/mobile-web"
exec python3 - "$@" <<'PY'
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import ProxyHandler, build_opener
import sys
import json
import webbrowser

url = 'http://127.0.0.1:5174/'
open_browser = '--no-browser' not in sys.argv
print('今天吃什么 · v1.0.0 固定版', flush=True)
print(f'入口：{url}', flush=True)

running = False
try:
    with build_opener(ProxyHandler({})).open(url + 'version.json', timeout=2) as response:
        running = json.loads(response.read().decode('utf-8')).get('version') == '1.0.0'
except Exception:
    pass

if running:
    print('本地服务已在运行。', flush=True)
    if open_browser:
        webbrowser.open(url)
    raise SystemExit(0)

handler = partial(SimpleHTTPRequestHandler, directory=str(Path.cwd() / 'dist'))
try:
    server = ThreadingHTTPServer(('127.0.0.1', 5174), handler)
except OSError as error:
    print(f'本地服务未能启动：{error}', file=sys.stderr)
    raise SystemExit(1)

print('服务已启动；关闭本窗口或按 Control+C 可停止。', flush=True)
if open_browser:
    Thread(target=lambda: webbrowser.open(url), daemon=True).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\n本地服务已停止。')
finally:
    server.server_close()
PY
