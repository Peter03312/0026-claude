"""Pydantic v2 模型：入参校验（Decimal）与出参序列化（Decimal -> 字符串保真）。"""
from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

READING_MIN = Decimal("0.00")
READING_MAX = Decimal("999.99")
READING_MAX_DECIMAL_PLACES = 2

# 只接受“普通”十进制写法：1~3 位整数 + 至多三位小数（第三位须为 0，见下方判定）。
# 拒绝科学计数法、NaN 等。
_READING_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3})?$")


def _validate_reading(value: object) -> Decimal:
    """共同的读数校验：普通十进制写法、范围 0.00~999.99、至多两位小数。

    前端始终发字符串并逐字符保真；数字类型也可接受（其值必须落在范围内）。
    "1.230" 这类末位为零的额外精度写法规范化后仅两位小数，予以接受。
    """
    if isinstance(value, bool):
        raise ValueError("读数不能是布尔值")
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            raise ValueError("请输入读数")
        try:
            d = Decimal(text)
        except InvalidOperation:
            raise ValueError("读数必须是十进制数字")
        # Decimal 接受 1E+2 / NaN / Infinity 等，这里按业务只允许普通写法
        if not _READING_RE.match(text):
            if "E" in text.upper() or not d.is_finite():
                raise ValueError("读数必须是普通十进制数字（0.00 至 999.99，最多两位小数）")
            raise ValueError("读数必须在 0.00 至 999.99 之间、最多两位小数")
    else:
        try:
            d = Decimal(value)
        except (InvalidOperation, ValueError):
            raise ValueError("读数必须是十进制数字")
    if not d.is_finite():
        raise ValueError("读数必须是有限数字")
    if d < READING_MIN or d > READING_MAX:
        raise ValueError("读数必须在 0.00 至 999.99 之间")
    exp = d.as_tuple().exponent
    if isinstance(exp, int) and exp < -READING_MAX_DECIMAL_PLACES:
        # 末位为零的额外精度（如 1.230）规范化后仅两位，允许。
        normalized = d.normalize()
        n_exp = normalized.as_tuple().exponent
        if not isinstance(n_exp, int) or n_exp < -READING_MAX_DECIMAL_PLACES:
            raise ValueError("读数最多保留两位小数")
    return d


# BeforeValidator 在 Pydantic 任何 Decimal 强转之前执行，因此能拦截空串、
# 科学计数法、NaN 等，并直接返回已校验的 Decimal。
ReadingDecimal = Annotated[Decimal, BeforeValidator(_validate_reading)]


class ReadingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    initial: ReadingDecimal = Field(title="初始读数")
    peak: ReadingDecimal = Field(title="保压峰值读数")
    released: ReadingDecimal = Field(title="卸压稳定读数")


class SubmissionOut(BaseModel):
    """一次有效提交的完整记录。Decimal 全部序列化为字符串避免浮点失真。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    initial: Decimal
    peak: Decimal
    released: Decimal
    total: Decimal
    permanent: Decimal
    ratio: Decimal
    ratio_display: str
    conclusion: str
    created_at: datetime


def collect_invalid_fields(errors: Iterable[dict]) -> list[str]:
    fields: list[str] = []
    for err in errors:
        loc = [part for part in err.get("loc", ()) if part not in ("body", "")]
        if loc:
            fields.append(str(loc[-1]))
    return fields
