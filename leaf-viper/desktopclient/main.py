"""Leaf Viper — Desktop Client (PyWebView)

Serves the leaf-viper/webclient/ folder locally and opens it in a native window.
On first launch the app will auto-connect to the local server.

Run from the project root:
    .venv/bin/python leaf-viper/desktopclient/main.py
"""

import os
import sys
import http.server
import threading

import webview

# ── Paths ─────────────────────────────────────────────────────────────────────

if getattr(sys, "frozen", False):
    _ROOT = sys._MEIPASS
else:
    _ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

WEBCLIENT = os.path.join(_ROOT, "leaf-viper", "webclient")
PORT_WEB  = 5502

# ── Static file server ────────────────────────────────────────────────────────

class _SilentHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEBCLIENT, **kwargs)

    def log_message(self, *_):
        pass


def _start_web():
    server = http.server.HTTPServer(("0.0.0.0", PORT_WEB), _SilentHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    _start_web()

    gui = "gtk" if sys.platform.startswith("linux") else None

    webview.create_window(
        title    = "Leaf Viper",
        url      = f"http://127.0.0.1:{PORT_WEB}/index.html",
        width    = 1200,
        height   = 740,
        min_size = (820, 560),
    )
    webview.start(debug=False, gui=gui, private_mode=False)


if __name__ == "__main__":
    main()
