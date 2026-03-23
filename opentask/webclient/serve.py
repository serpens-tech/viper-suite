#!/usr/bin/env python3
"""Tiny static file server for the OpenTask web client.

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

print(f"OpenTask Web Client → http://localhost:{port}")
print("Press Ctrl+C to stop.\n")
webbrowser.open(f"http://localhost:{port}/index.html")

with http.server.HTTPServer(("", port), CORSHandler) as httpd:
    httpd.serve_forever()
