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
import shutil
import subprocess

import webview

APP_WINDOW = None

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
        # Keep the embedded desktop server quiet.
        pass


def _start_web():
    server = http.server.HTTPServer(("0.0.0.0", PORT_WEB), _SilentHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def _resolve_command(cmd):
    executable = cmd[0]
    if os.path.isabs(executable) or os.sep in executable:
        return cmd if os.path.exists(executable) else None
    resolved = shutil.which(executable)
    return [resolved, *cmd[1:]] if resolved else None


def _target_candidates(target):
    if target == "leaf-viper":
        exe_name = "LeafViper.exe"
        launcher_name = "leaf-viper"
    else:
        exe_name = "CrossedViper.exe"
        launcher_name = "crossed-viper"

    candidates = []
    if sys.platform.startswith("win"):
        current_dir = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else __file__)
        candidates.extend([
            [exe_name],
            [os.path.join(current_dir, exe_name)],
            [os.path.abspath(os.path.join(current_dir, "..", os.path.splitext(exe_name)[0], exe_name))],
        ])
    else:
        candidates.extend([
            [launcher_name],
            [f"/opt/{target}/{launcher_name}"],
        ])

    source_main = os.path.join(_ROOT, target, "desktopclient", "main.py")
    if os.path.isfile(source_main):
        candidates.append([sys.executable, source_main])

    return candidates


def _spawn_target(target):
    for candidate in _target_candidates(target):
        command = _resolve_command(candidate)
        if not command:
            continue
        kwargs = {
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "cwd": _ROOT,
        }
        if sys.platform.startswith("win"):
            kwargs["creationflags"] = (
                getattr(subprocess, "DETACHED_PROCESS", 0)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            )
        else:
            kwargs["start_new_session"] = True
        try:
            subprocess.Popen(command, **kwargs)
            return True
        except OSError:
            continue
    return False


class DesktopBridge:
    def switch_app(self, target):
        if target not in {"crossed-viper", "leaf-viper"}:
            return False
        opened = _spawn_target(target)
        if opened and APP_WINDOW is not None:
            threading.Timer(0.2, APP_WINDOW.destroy).start()
        return opened

# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    global APP_WINDOW
    _start_web()

    gui = "gtk" if sys.platform.startswith("linux") else None

    APP_WINDOW = webview.create_window(
        title    = "Leaf Viper",
        url      = f"http://127.0.0.1:{PORT_WEB}/index.html",
        width    = 1200,
        height   = 740,
        min_size = (820, 560),
    )
    webview.start(debug=False, gui=gui, private_mode=False, js_api=DesktopBridge())


if __name__ == "__main__":
    main()
