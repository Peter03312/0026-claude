"""气瓶水套耐压试验的核心判定逻辑（纯 Decimal 运算，禁止浮点）。

业务定义
--------
- 总膨胀量   total      = peak - initial
- 永久膨胀量 permanent  = released - initial
- 永久膨胀率 ratio(%)   = permanent / total * 100  （未舍入）
- 有效提交必须同时满足：peak > initial 且 initial <= released <= peak
- 放行（PASS）当且仅当 **未舍入** 的比率不高于 10.00%（含等号）

防舍入陷阱
----------
结论必须用未舍入比率与 10.00% 比较。比率量化为 4 位小数只是为了显示，
绝不能拿显示值去判定，否则恰在边界的瓶体会被错误处置。

``permanent / total * 100 <= 10`` 等价于 ``permanent * 10 <= total``，
后者只做十进制乘法与整数比较、没有任何除法/舍入，因此判定采用该精确
比较；比率本身仍按 50 位有效数字计算后原样存储（用于审计与页面展示）。
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, localcontext

PASS_LIMIT_PERCENT = Decimal("10.00")
"""放行上限（百分比），未舍入比率 <= 该值即放行。"""

RATIO_DISPLAY_QUANT = Decimal("0.0001")
"""页面显示比率的量化单位：四位小数，ROUND_HALF_UP。"""

ZERO = Decimal("0")
HUNDRED = Decimal("100")


class TestInvalid(ValueError):
    """试验读数组合无效：不产生任何比率，也不形成提交记录。"""

    __test__ = False  # 告知 pytest 这不是测试类


def _as_decimal(value: Decimal) -> Decimal:
    if not isinstance(value, Decimal):  # pragma: no cover - 防御性
        value = Decimal(value)
    if not value.is_finite():
        raise TestInvalid("读数必须是有限十进制数")
    return value


def evaluate(initial: Decimal, peak: Decimal, released: Decimal) -> dict[str, Decimal | str]:
    """对三次读数执行校验、计算与判定。

    Returns:
        含 total / permanent / ratio / ratio_display / conclusion 的字典。

    Raises:
        TestInvalid: 峰值不大于初始值，或卸压值不在闭区间 [初始值, 峰值] 内。
    """
    initial = _as_decimal(initial)
    peak = _as_decimal(peak)
    released = _as_decimal(released)

    if peak <= initial:
        raise TestInvalid("峰值读数必须大于初始读数，试验无效")
    if released < initial or released > peak:
        raise TestInvalid("卸压稳定读数必须位于初始读数与峰值读数之间，试验无效")

    total = peak - initial
    permanent = released - initial

    # 50 位有效数字计算“未舍入比率”，仅用于记录与展示；判定走精确比较。
    with localcontext() as ctx:
        ctx.prec = 50
        ratio = permanent / total * HUNDRED

    # permanent * 10 <= total  <=>  permanent / total * 100 <= 10（无除法，精确）
    conclusion = "PASS" if permanent * HUNDRED <= total * PASS_LIMIT_PERCENT else "FAIL"

    ratio_display = ratio.quantize(RATIO_DISPLAY_QUANT, rounding=ROUND_HALF_UP)

    return {
        "total": total,
        "permanent": permanent,
        "ratio": ratio,
        "ratio_display": ratio_display,
        "conclusion": conclusion,
    }
