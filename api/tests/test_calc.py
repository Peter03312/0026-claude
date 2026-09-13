"""calc.evaluate 的单元测试：Decimal 精度、边界与“防舍入”判定。"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.calc import PASS_LIMIT_PERCENT, TestInvalid, evaluate


def test_basic_formula_pass():
    # 总膨胀 10.00 mL，永久膨胀 0.50 mL -> 5%，放行
    out = evaluate(Decimal("100.00"), Decimal("110.00"), Decimal("100.50"))
    assert out["total"] == Decimal("10.00")
    assert out["permanent"] == Decimal("0.50")
    assert out["ratio"] == Decimal("5")
    assert out["ratio_display"] == Decimal("5.0000")
    assert out["conclusion"] == "PASS"


def test_exactly_ten_percent_is_pass():
    # 未舍入比率恰好 10.00% -> 放行（含等号）
    out = evaluate(Decimal("0.00"), Decimal("10.00"), Decimal("1.00"))
    assert out["ratio"] == Decimal("10")
    assert out["ratio_display"] == Decimal("10.0000")
    assert out["conclusion"] == "PASS"


def test_exactly_ten_percent_with_nonzero_initial():
    out = evaluate(Decimal("200.00"), Decimal("220.00"), Decimal("202.00"))
    assert out["total"] == Decimal("20.00")
    assert out["permanent"] == Decimal("2.00")
    assert out["conclusion"] == "PASS"


def test_just_above_ten_percent_is_fail():
    # 100.00 -> 110.00 -> 101.00：比率 10.0000...1%，显示四舍五入为 10.0000，
    # 但未舍入值高于 10%，必须 FAIL（防舍入陷阱核心用例）。
    out = evaluate(
        Decimal("100.00"), Decimal("110.00"), Decimal("100.00") + Decimal("1.0000001")
    )
    assert out["ratio"] > Decimal("10")
    assert out["ratio_display"] == Decimal("10.0000")
    assert out["conclusion"] == "FAIL"


def test_just_below_ten_percent_is_pass():
    # 未舍入略低于 10% 但四位小数显示为 9.9999 或 10.0000 都应 PASS
    out = evaluate(
        Decimal("100.00"), Decimal("110.00"), Decimal("100.9999999")
    )
    assert out["ratio"] < Decimal("10")
    assert out["conclusion"] == "PASS"


def test_no_binary_float_artifacts():
    # 0.1 + 0.2 风格的输入若为字符串则精确：10% 边界不被二进制误差带偏
    out = evaluate(Decimal("0.00"), Decimal("100.00"), Decimal("10.00"))
    assert out["ratio"] == Decimal("10")
    assert out["conclusion"] == "PASS"


def test_zero_permanent_is_pass():
    out = evaluate(Decimal("50.00"), Decimal("60.00"), Decimal("50.00"))
    assert out["permanent"] == Decimal("0.00")
    assert out["ratio"] == Decimal("0")
    assert out["ratio_display"] == Decimal("0.0000")
    assert out["conclusion"] == "PASS"


def test_full_recovery_boundary_allowed():
    # 卸压值等于初始值（完全恢复）是闭区间端点，试验有效且 PASS
    out = evaluate(Decimal("1.00"), Decimal("2.00"), Decimal("1.00"))
    assert out["conclusion"] == "PASS"


def test_full_permanent_boundary_allowed():
    # 卸压值等于峰值（100% 永久膨胀）是闭区间端点，试验有效但 FAIL
    out = evaluate(Decimal("1.00"), Decimal("2.00"), Decimal("2.00"))
    assert out["ratio"] == Decimal("100")
    assert out["ratio_display"] == Decimal("100.0000")
    assert out["conclusion"] == "FAIL"


def test_ratio_display_uses_half_up_four_places():
    # 2/3*100 = 66.66666... -> 66.6667（ROUND_HALF_UP）
    out = evaluate(Decimal("0.00"), Decimal("3.00"), Decimal("2.00"))
    assert out["ratio_display"] == Decimal("66.6667")
    assert out["ratio"] != out["ratio_display"]


def test_peak_must_be_greater_than_initial_equal_invalid():
    with pytest.raises(TestInvalid, match="峰值"):
        evaluate(Decimal("10.00"), Decimal("10.00"), Decimal("10.00"))


def test_peak_less_than_initial_invalid():
    with pytest.raises(TestInvalid, match="峰值"):
        evaluate(Decimal("10.00"), Decimal("9.00"), Decimal("9.50"))


def test_released_below_initial_invalid():
    with pytest.raises(TestInvalid, match="卸压"):
        evaluate(Decimal("10.00"), Decimal("20.00"), Decimal("9.99"))


def test_released_above_peak_invalid():
    with pytest.raises(TestInvalid, match="卸压"):
        evaluate(Decimal("10.00"), Decimal("20.00"), Decimal("20.01"))


def test_invalid_returns_no_ratio_fields():
    with pytest.raises(TestInvalid):
        evaluate(Decimal("5.00"), Decimal("5.00"), Decimal("5.00"))


def test_large_range_values_stay_exact_fail():
    # 99.99901 / 999.99 * 100 = 10.000001…%：未舍入略超 -> FAIL，
    # 四位小数显示仍为 10.0000，结论只能由未舍入值决定。
    out = evaluate(Decimal("0.00"), Decimal("999.99"), Decimal("99.99901"))
    assert out["total"] == Decimal("999.99")
    assert out["permanent"] == Decimal("99.99901")
    assert out["ratio_display"] == Decimal("10.0000")
    assert out["conclusion"] == "FAIL"


def test_large_range_values_stay_exact_pass():
    # 99.99899 / 999.99 * 100 = 9.999999…%：未舍入未超 -> PASS，
    # 四位小数显示同样是 10.0000——只看显示值会错放/错杀。
    out = evaluate(Decimal("0.00"), Decimal("999.99"), Decimal("99.99899"))
    assert out["ratio_display"] == Decimal("10.0000")
    assert out["conclusion"] == "PASS"


def test_limit_constant_is_decimal_ten():
    assert PASS_LIMIT_PERCENT == Decimal("10.00")
