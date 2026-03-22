#!/usr/bin/env python3
"""Seed the database with a default admin user.

Usage:
    python seed.py                          # admin / admin
    python seed.py myuser mypassword        # custom credentials
    python seed.py myuser mypassword --admin
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import Base, SessionLocal, engine
from app.models import User
from app.auth import hash_password

def seed(username: str = "admin", password: str = "admin", is_admin: bool = True):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"User '{username}' already exists (id={existing.id}). Skipping.")
            return
        user = User(
            username=username,
            password_hash=hash_password(password),
            is_admin=is_admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        role = "admin" if user.is_admin else "user"
        print(f"Created {role}: '{user.username}' (id={user.id})")
    finally:
        db.close()

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    is_admin = "--admin" in sys.argv

    username = args[0] if len(args) > 0 else "admin"
    password = args[1] if len(args) > 1 else "admin"
    if len(args) == 0:
        is_admin = True  # default seed is always admin

    seed(username, password, is_admin)
