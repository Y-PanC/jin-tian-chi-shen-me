"""Local entry point; binds only to loopback and keeps the original Web origin."""
import argparse
import json
import sys
from threading import Thread
from urllib.request import ProxyHandler, build_opener
import webbrowser

import uvicorn


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}/"
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(url + "api/v1/health", timeout=2) as response:
            running = json.load(response).get("service") == "meal-web"
    except Exception:
        running = False
    if running:
        print(f"服务已在运行：{url}")
        if not args.no_browser:
            webbrowser.open(url)
        return
    if not args.no_browser:
        def open_when_ready():
            import time
            for _ in range(40):
                try:
                    with opener.open(url + "api/v1/health", timeout=1):
                        webbrowser.open(url)
                        return
                except Exception:
                    time.sleep(.25)
        Thread(target=open_when_ready, daemon=True).start()
    print(f"今天吃什么 · Web v4.0.0\n入口：{url}\n关闭本窗口或按 Control+C 可停止", flush=True)
    uvicorn.run("backend.app:create_app", factory=True, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
