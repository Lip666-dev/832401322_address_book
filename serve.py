#!/usr/bin/env python3
"""通讯录 · 本地静态服务器（只用 Python 标准库，无需安装任何依赖）。

用法::

    python serve.py                 # http://127.0.0.1:8021
    python serve.py --port 8080     # 指定端口
    PORT=8080 python serve.py       # 云服务器上常用写法

Windows 上也可以直接双击 start.bat。
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import socket
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    """静态文件处理：禁用缓存，避免改完样式还要强刷。"""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003 - 标准库签名
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the address book app.")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8021")))
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.port), handler) as server:
        print(f"通讯录已启动：http://127.0.0.1:{args.port}/")
        if args.host in ("0.0.0.0", ""):
            print(f"局域网访问：  http://{local_ip()}:{args.port}/")
        print("按 Ctrl+C 停止。")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
