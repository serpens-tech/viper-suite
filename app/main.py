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

# Redirects so both /budget and /tasks work without a trailing slash
@app.get("/budget", include_in_schema=False)
def budget_redirect():
    return RedirectResponse(url="/budget/")

@app.get("/tasks", include_in_schema=False)
def tasks_redirect():
    return RedirectResponse(url="/tasks/")

@app.get("/tasks/", include_in_schema=False)
@app.get("/tasks/index.html", include_in_schema=False)
def tasks_index():
    """Serve index.html, injecting CROSSED_VIPER_SERVER via ?server= param if set."""
    _index = os.path.join(os.path.dirname(__file__), "..", "crossed-viper", "webclient", "index.html")
    _server = os.environ.get("CROSSED_VIPER_SERVER", "").strip().rstrip("/")
    if not _server:
        return FileResponse(_index)
    from fastapi.responses import HTMLResponse
    from urllib.parse import quote as _quote
    with open(_index, "r", encoding="utf-8") as f:
        html = f.read()
    snippet = f'<script>if(!localStorage.getItem("ot_server")){{localStorage.setItem("ot_server","{_server}");}}</script>'
    html = html.replace("</head>", snippet + "\n</head>", 1)
    return HTMLResponse(content=html)

@app.get("/", include_in_schema=False)
def root():
    landing = os.path.join(os.path.dirname(__file__), "landing.html")
    return FileResponse(landing)

# Serve the budget web client at /budget — must be mounted before /tasks.
_budgetclient = os.path.join(os.path.dirname(__file__), "..", "leaf-viper", "webclient")
if os.path.isdir(_budgetclient):
    app.mount("/budget", StaticFiles(directory=_budgetclient, html=True), name="budgetclient")

# Serve the task web client at /tasks.
_webclient = os.path.join(os.path.dirname(__file__), "..", "crossed-viper", "webclient")
if os.path.isdir(_webclient):
    app.mount("/tasks", StaticFiles(directory=_webclient, html=True), name="webclient")
