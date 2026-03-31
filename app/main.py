import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import Expense, Income, User  # noqa: F401 – ensures models are registered
from app.routers import auth, lists, tasks, users
from app.routers import finance

HEAD_CLOSE = "</head>"
HEAD_CLOSE_WITH_NEWLINE = "\n</head>"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    Base.metadata.create_all(bind=engine)

    # Migrate: add new columns if they don't exist yet
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS finance_type VARCHAR(8)"))
        conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS finance_amount NUMERIC(12,2)"))
        conn.commit()

    # Seed a default admin if none exists
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.is_admin == True).first():  # noqa: E712
            admin = User(
                username="admin",
                password_hash=hash_password("admin123"),
                is_admin=True,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()

    yield


app = FastAPI(title="Viper Suite API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(lists.router)
app.include_router(tasks.router)
app.include_router(finance.router)

# Canonical app routes use the real app names.
@app.get("/leaf-viper", include_in_schema=False)
def leaf_viper_redirect():
    return RedirectResponse(url="/leaf-viper/")

@app.get("/crossed-viper", include_in_schema=False)
def crossed_viper_redirect():
    return RedirectResponse(url="/crossed-viper/")

# Backward-compatible legacy routes.
@app.get("/budget", include_in_schema=False)
def budget_redirect():
    return RedirectResponse(url="/leaf-viper/")

@app.get("/tasks", include_in_schema=False)
def tasks_redirect():
    return RedirectResponse(url="/crossed-viper/")

@app.get("/crossed-viper/", include_in_schema=False)
@app.get("/crossed-viper/index.html", include_in_schema=False)
@app.get("/tasks/", include_in_schema=False)
@app.get("/tasks/index.html", include_in_schema=False)
def tasks_index():
    """Serve tasks index.html, injecting env flags."""
    from fastapi.responses import HTMLResponse
    _index = os.path.join(os.path.dirname(__file__), "..", "crossed-viper", "webclient", "index.html")
    _server = os.environ.get("CROSSED_VIPER_SERVER", "").strip().rstrip("/")
    _show_cs = os.environ.get("SHOW_CHANGE_SERVER", "true").strip().lower() not in ("0", "false", "no")
    with open(_index, "r", encoding="utf-8") as f:
        html = f.read()
    _show_num = "1" if _show_cs else "0"
    flags = (
        f'<script>window._SHOW_CHANGE_SERVER={str(_show_cs).lower()};'
        f'localStorage.setItem("ot_show_change_server","{_show_num}");'
        f'localStorage.setItem("ob_show_change_server","{_show_num}");'
    )
    if _server:
        flags += f'if(!localStorage.getItem("ot_server")){{localStorage.setItem("ot_server","{_server}");}}'
    flags += '</script>'
    html = html.replace(HEAD_CLOSE, flags + HEAD_CLOSE_WITH_NEWLINE, 1)
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})


@app.get("/crossed-viper/app.html", include_in_schema=False)
@app.get("/tasks/app.html", include_in_schema=False)
def tasks_app():
    """Serve tasks app.html, injecting env flags."""
    from fastapi.responses import HTMLResponse
    _app = os.path.join(os.path.dirname(__file__), "..", "crossed-viper", "webclient", "app.html")
    _show_cs = os.environ.get("SHOW_CHANGE_SERVER", "true").strip().lower() not in ("0", "false", "no")
    _show_num = "1" if _show_cs else "0"
    with open(_app, "r", encoding="utf-8") as f:
        html = f.read()
    flags = (
        f'<script>window._SHOW_CHANGE_SERVER={str(_show_cs).lower()};'
        f'localStorage.setItem("ot_show_change_server","{_show_num}");'
        f'localStorage.setItem("ob_show_change_server","{_show_num}");'
        '</script>'
    )
    html = html.replace(HEAD_CLOSE, flags + HEAD_CLOSE_WITH_NEWLINE, 1)
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})

@app.get("/leaf-viper/", include_in_schema=False)
@app.get("/leaf-viper/index.html", include_in_schema=False)
@app.get("/budget/", include_in_schema=False)
@app.get("/budget/index.html", include_in_schema=False)
def budget_index():
    """Serve budget index.html, injecting env flags."""
    from fastapi.responses import HTMLResponse
    _index = os.path.join(os.path.dirname(__file__), "..", "leaf-viper", "webclient", "index.html")
    _show_cs = os.environ.get("SHOW_CHANGE_SERVER", "true").strip().lower() not in ("0", "false", "no")
    _show_num = "1" if _show_cs else "0"
    with open(_index, "r", encoding="utf-8") as f:
        html = f.read()
    flags = (
        f'<script>window._SHOW_CHANGE_SERVER={str(_show_cs).lower()};'
        f'localStorage.setItem("ot_show_change_server","{_show_num}");'
        f'localStorage.setItem("ob_show_change_server","{_show_num}");'
        '</script>'
    )
    html = html.replace(HEAD_CLOSE, flags + HEAD_CLOSE_WITH_NEWLINE, 1)
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})


@app.get("/leaf-viper/app.html", include_in_schema=False)
@app.get("/budget/app.html", include_in_schema=False)
def budget_app():
    """Serve budget app.html, injecting env flags."""
    from fastapi.responses import HTMLResponse
    _app = os.path.join(os.path.dirname(__file__), "..", "leaf-viper", "webclient", "app.html")
    _show_cs = os.environ.get("SHOW_CHANGE_SERVER", "true").strip().lower() not in ("0", "false", "no")
    _show_num = "1" if _show_cs else "0"
    with open(_app, "r", encoding="utf-8") as f:
        html = f.read()
    flags = (
        f'<script>window._SHOW_CHANGE_SERVER={str(_show_cs).lower()};'
        f'localStorage.setItem("ot_show_change_server","{_show_num}");'
        f'localStorage.setItem("ob_show_change_server","{_show_num}");'
        '</script>'
    )
    html = html.replace(HEAD_CLOSE, flags + HEAD_CLOSE_WITH_NEWLINE, 1)
    return HTMLResponse(content=html, headers={"Cache-Control": "no-store"})

@app.get("/", include_in_schema=False)
def root():
    landing = os.path.join(os.path.dirname(__file__), "landing.html")
    return FileResponse(landing)


@app.get("/icon-256.png", include_in_schema=False)
def suite_icon():
    icon = os.path.join(os.path.dirname(__file__), "icon-256.png")
    return FileResponse(icon, headers={"Cache-Control": "public, max-age=31536000, immutable"})

# Serve the Leaf Viper web client at /leaf-viper and keep /budget as a legacy alias.
_budgetclient = os.path.join(os.path.dirname(__file__), "..", "leaf-viper", "webclient")
if os.path.isdir(_budgetclient):
    app.mount("/leaf-viper", StaticFiles(directory=_budgetclient, html=True), name="leafviperclient")
    app.mount("/budget", StaticFiles(directory=_budgetclient, html=True), name="budgetclient")

# Serve the Crossed Viper web client at /crossed-viper and keep /tasks as a legacy alias.
_webclient = os.path.join(os.path.dirname(__file__), "..", "crossed-viper", "webclient")
if os.path.isdir(_webclient):
    app.mount("/crossed-viper", StaticFiles(directory=_webclient, html=True), name="crossedviperclient")
    app.mount("/tasks", StaticFiles(directory=_webclient, html=True), name="webclient")
