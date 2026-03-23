from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Expense, Income, User
from app.schemas import (
    ExpenseCreate, ExpenseOut, ExpenseUpdate,
    FinanceSummary, FinanceSummaryMonth,
    IncomeCreate, IncomeOut, IncomeUpdate,
)

router = APIRouter(prefix="/finance", tags=["finance"])

UserDep = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Session, Depends(get_db)]


def _get_income_or_404(income_id: int, user: User, db: Session) -> Income:
    income = db.get(Income, income_id)
    if not income:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income not found")
    if income.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your income")
    return income


def _get_expense_or_404(expense_id: int, user: User, db: Session) -> Expense:
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    if expense.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your expense")
    return expense


# ── Incomes ───────────────────────────────────────────────────────────────────

@router.post("/incomes", response_model=IncomeOut, status_code=status.HTTP_201_CREATED)
def create_income(body: IncomeCreate, current_user: UserDep, db: DbDep):
    income = Income(**body.model_dump(), user_id=current_user.id)
    db.add(income)
    db.commit()
    db.refresh(income)
    return income


@router.get("/incomes", response_model=list[IncomeOut])
def get_incomes(current_user: UserDep, db: DbDep):
    return (
        db.query(Income)
        .filter(Income.user_id == current_user.id)
        .order_by(Income.date.desc(), Income.id.desc())
        .all()
    )


@router.patch("/incomes/{income_id}", response_model=IncomeOut)
def update_income(income_id: int, body: IncomeUpdate, current_user: UserDep, db: DbDep):
    income = _get_income_or_404(income_id, current_user, db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(income, field, val)
    db.commit()
    db.refresh(income)
    return income


@router.delete("/incomes/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(income_id: int, current_user: UserDep, db: DbDep):
    income = _get_income_or_404(income_id, current_user, db)
    db.delete(income)
    db.commit()


# ── Expenses ──────────────────────────────────────────────────────────────────

@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(body: ExpenseCreate, current_user: UserDep, db: DbDep):
    expense = Expense(**body.model_dump(), user_id=current_user.id)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/expenses", response_model=list[ExpenseOut])
def get_expenses(current_user: UserDep, db: DbDep):
    return (
        db.query(Expense)
        .filter(Expense.user_id == current_user.id)
        .order_by(Expense.date.desc(), Expense.id.desc())
        .all()
    )


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: int, body: ExpenseUpdate, current_user: UserDep, db: DbDep):
    expense = _get_expense_or_404(expense_id, current_user, db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(expense, field, val)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, current_user: UserDep, db: DbDep):
    expense = _get_expense_or_404(expense_id, current_user, db)
    db.delete(expense)
    db.commit()


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=FinanceSummary)
def get_summary(current_user: UserDep, db: DbDep):
    total_income = (
        db.query(func.sum(Income.amount))
        .filter(Income.user_id == current_user.id)
        .scalar()
    ) or 0

    total_expense = (
        db.query(func.sum(Expense.amount))
        .filter(Expense.user_id == current_user.id)
        .scalar()
    ) or 0

    # Monthly income aggregation
    income_rows = (
        db.query(
            extract("year", Income.date).label("year"),
            extract("month", Income.date).label("month"),
            func.sum(Income.amount).label("total"),
        )
        .filter(Income.user_id == current_user.id)
        .group_by("year", "month")
        .all()
    )

    # Monthly expense aggregation
    expense_rows = (
        db.query(
            extract("year", Expense.date).label("year"),
            extract("month", Expense.date).label("month"),
            func.sum(Expense.amount).label("total"),
        )
        .filter(Expense.user_id == current_user.id)
        .group_by("year", "month")
        .all()
    )

    months: dict[tuple[int, int], dict] = {}
    for row in income_rows:
        key = (int(row.year), int(row.month))
        months.setdefault(key, {"income": 0.0, "expense": 0.0})
        months[key]["income"] = float(row.total)
    for row in expense_rows:
        key = (int(row.year), int(row.month))
        months.setdefault(key, {"income": 0.0, "expense": 0.0})
        months[key]["expense"] = float(row.total)

    monthly = [
        FinanceSummaryMonth(
            year=k[0],
            month=k[1],
            income=v["income"],
            expense=v["expense"],
            net=v["income"] - v["expense"],
        )
        for k, v in sorted(months.items(), reverse=True)
    ]

    return FinanceSummary(
        balance=float(total_income) - float(total_expense),
        total_income=float(total_income),
        total_expense=float(total_expense),
        monthly=monthly,
    )
