from datetime import date as date_, datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Auth ─────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None


# ── User ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    is_admin: bool | None = None


class UserSelfUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_admin: bool
    created_at: datetime


# ── Task List ─────────────────────────────────────────────────────────────────

class TaskListCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1024)


class TaskListUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1024)


class TaskListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    owner_id: int
    created_at: datetime
    updated_at: datetime


# ── Task ─────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=2048)
    completed: bool = False
    finance_type: str | None = Field(default=None, pattern='^(income|expense)$')
    finance_amount: float | None = Field(default=None, gt=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=2048)
    completed: bool | None = None
    finance_type: str | None = Field(default=None, pattern='^(income|expense)$')
    finance_amount: float | None = Field(default=None, gt=0)


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    completed: bool
    finance_type: str | None
    finance_amount: float | None
    list_id: int
    created_at: datetime
    updated_at: datetime


# ── Finance: Income ───────────────────────────────────────────────────────────

class IncomeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1024)
    amount: float = Field(gt=0)
    date: date_


class IncomeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1024)
    amount: float | None = Field(default=None, gt=0)
    date: date_ | None = None


class IncomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    amount: float
    date: date_
    created_at: datetime


# ── Finance: Expense ──────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1024)
    amount: float = Field(gt=0)
    date: date_


class ExpenseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=1024)
    amount: float | None = Field(default=None, gt=0)
    date: date_ | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    amount: float
    date: date_
    created_at: datetime


# ── Finance: Summary ──────────────────────────────────────────────────────────

class FinanceSummaryMonth(BaseModel):
    year: int
    month: int
    income: float
    expense: float
    net: float


class FinanceSummary(BaseModel):
    balance: float
    total_income: float
    total_expense: float
    monthly: list[FinanceSummaryMonth]
