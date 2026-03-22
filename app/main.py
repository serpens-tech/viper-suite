import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import User  # noqa: F401 – ensures model is registered
from app.routers import auth, lists, tasks, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    Base.metadata.create_all(bind=engine)

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


app = FastAPI(title="OpenTask API", version="1.0.0", lifespan=lifespan)

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

# Serve the web client — API routes above take priority over static files.
# In development the webclient/ folder lives next to app/; in Docker it is
# copied to /app/webclient (see Dockerfile).
_webclient = os.path.join(os.path.dirname(__file__), "..", "webclient")
if os.path.isdir(_webclient):
    app.mount("/", StaticFiles(directory=_webclient, html=True), name="webclient")
