from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import TaskList, User
from app.schemas import TaskListCreate, TaskListOut, TaskListUpdate

router = APIRouter(prefix="/lists", tags=["lists"])

UserDep = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Session, Depends(get_db)]


def _get_list_or_404(list_id: int, user: User, db: Session) -> TaskList:
    task_list = db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if task_list.owner_id != user.id and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your list")
    return task_list


@router.post("", response_model=TaskListOut, status_code=status.HTTP_201_CREATED)
def create_list(body: TaskListCreate, current_user: UserDep, db: DbDep):
    task_list = TaskList(title=body.title, description=body.description, owner_id=current_user.id)
    db.add(task_list)
    db.commit()
    db.refresh(task_list)
    return task_list


@router.get("", response_model=list[TaskListOut])
def get_lists(current_user: UserDep, db: DbDep):
    if current_user.is_admin:
        return db.query(TaskList).all()
    return db.query(TaskList).filter(TaskList.owner_id == current_user.id).all()


@router.get("/{list_id}", response_model=TaskListOut)
def get_list(list_id: int, current_user: UserDep, db: DbDep):
    return _get_list_or_404(list_id, current_user, db)


@router.patch("/{list_id}", response_model=TaskListOut)
def update_list(list_id: int, body: TaskListUpdate, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    if body.title is not None:
        task_list.title = body.title
    if body.description is not None:
        task_list.description = body.description
    db.commit()
    db.refresh(task_list)
    return task_list


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(list_id: int, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    db.delete(task_list)
    db.commit()
