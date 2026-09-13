"""SQLAlchemy 模型。

读数使用 NUMERIC(5,2)（规则只允许两位小数），未舍入比率使用不绑定精度/标度的
NUMERIC 保留计算出的真实有效数字；四位小数的显示值以字符串保存，避免被
NUMERIC 标度补零。
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base

READING_NUMERIC = Numeric(5, 2, asdecimal=True)
# 无标度 NUMERIC：未舍入比率按计算结果本身的有效数字存储，不被补零
RATIO_NUMERIC = Numeric(asdecimal=True)


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    initial: Mapped[Decimal] = mapped_column(READING_NUMERIC, nullable=False)
    peak: Mapped[Decimal] = mapped_column(READING_NUMERIC, nullable=False)
    released: Mapped[Decimal] = mapped_column(READING_NUMERIC, nullable=False)
    total: Mapped[Decimal] = mapped_column(READING_NUMERIC, nullable=False)
    permanent: Mapped[Decimal] = mapped_column(READING_NUMERIC, nullable=False)
    # ratio 为未舍入比率（%）；ratio_display 是固定四位小数的显示值，
    # 以字符串原样保存，避免被 NUMERIC 标度补零改变展示位数。
    ratio: Mapped[Decimal] = mapped_column(RATIO_NUMERIC, nullable=False)
    ratio_display: Mapped[str] = mapped_column(String(12), nullable=False)
    conclusion: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
