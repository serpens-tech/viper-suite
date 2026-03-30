#!/usr/bin/env python3
"""Tiny static file server for the Crossed Viper web client.

Usage:
    python serve.py          # http://localhost:5500
    python serve.py 8080     # custom port
"""
import http.server
import os
import sys
import webbrowser


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # silent


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
os.chdir(os.path.dirname(os.path.abspath(__file__)))

_env_server = os.environ.get("CROSSED_VIPER_SERVER", "").strip().rstrip("/")
_index_url  = f"http://localhost:{port}/index.html"
if _env_server:
    from urllib.parse import quote as _quote
    _index_url += "?server=" + _quote(_env_server, safe="")

print(f"Crossed Viper Web Client → http://localhost:{port}")
if _env_server:
    print(f"Server (from env): {_env_server}")
print("Press Ctrl+C to stop.\n")
webbrowser.open(_index_url)

with http.server.HTTPServer(("", port), CORSHandler) as httpd:
    httpd.serve_forever()
