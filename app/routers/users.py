from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models import User
from app.schemas import UserCreate, UserOut, UserSelfUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

AdminDep = Annotated[User, Depends(get_admin_user)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Session, Depends(get_db)]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, _admin: AdminDep, db: DbDep):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        is_admin=body.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
def list_users(_admin: AdminDep, db: DbDep):
    return db.query(User).all()


@router.patch("/me", response_model=UserOut)
def update_me(body: UserSelfUpdate, current_user: CurrentUserDep, db: DbDep):
    if body.username is not None:
        conflict = db.query(User).filter(User.username == body.username, User.id != current_user.id).first()
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        current_user.username = body.username
    if body.password is not None:
        current_user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(current_user: CurrentUserDep, db: DbDep):
    db.delete(current_user)
    db.commit()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, _admin: AdminDep, db: DbDep):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, _admin: AdminDep, db: DbDep):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.username is not None:
        conflict = db.query(User).filter(User.username == body.username, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        user.username = body.username
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: AdminDep, db: DbDep):
    if admin.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.delete(user)
    db.commit()
