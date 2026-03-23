from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Expense, Income, Task, TaskList, User
from app.schemas import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/lists/{list_id}/tasks", tags=["tasks"])

UserDep = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Session, Depends(get_db)]


def _get_list_or_404(list_id: int, user: User, db: Session) -> TaskList:
    task_list = db.get(TaskList, list_id)
    if not task_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if task_list.owner_id != user.id and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your list")
    return task_list


def _get_task_or_404(task_id: int, task_list: TaskList, db: Session) -> Task:
    task = db.get(Task, task_id)
    if not task or task.list_id != task_list.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(list_id: int, body: TaskCreate, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    task = Task(
        title=body.title,
        description=body.description,
        completed=body.completed,
        finance_type=body.finance_type,
        finance_amount=body.finance_amount,
        list_id=task_list.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("", response_model=list[TaskOut])
def get_tasks(list_id: int, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    return db.query(Task).filter(Task.list_id == task_list.id).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(list_id: int, task_id: int, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    return _get_task_or_404(task_id, task_list, db)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(list_id: int, task_id: int, body: TaskUpdate, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    task = _get_task_or_404(task_id, task_list, db)
    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    # finance fields: use model_fields_set so explicit null clears the value
    if 'finance_type' in body.model_fields_set:
        task.finance_type = body.finance_type
    if 'finance_amount' in body.model_fields_set:
        task.finance_amount = body.finance_amount
    was_completed = task.completed
    if body.completed is not None:
        task.completed = body.completed
    # Auto-create finance entry when task is newly marked complete
    if body.completed is True and not was_completed and task.finance_type and task.finance_amount:
        today = date_type.today()
        if task.finance_type == 'income':
            entry = Income(
                user_id=current_user.id,
                name=task.title,
                description='Auto-created from task',
                amount=task.finance_amount,
                date=today,
            )
        else:
            entry = Expense(
                user_id=current_user.id,
                name=task.title,
                description='Auto-created from task',
                amount=task.finance_amount,
                date=today,
            )
        db.add(entry)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(list_id: int, task_id: int, current_user: UserDep, db: DbDep):
    task_list = _get_list_or_404(list_id, current_user, db)
    task = _get_task_or_404(task_id, task_list, db)
    db.delete(task)
    db.commit()
