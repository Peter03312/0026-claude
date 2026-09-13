"""API 集成测试：真实 PostgreSQL + 真实 HTTP，覆盖边界、无效试验与持久化。"""
from __future__ import annotations

from decimal import Decimal

import httpx
import pytest


def submit(client: httpx.Client, i: str, p: str, r: str):
    return client.post("/api/submissions", json={"initial": i, "peak": p, "released": r})


def count(client: httpx.Client) -> int:
    return len(client.get("/api/submissions").json())


# ---------- 有效提交与算式 ----------

def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_valid_submission_persists_and_returns_steps(client):
    assert count(client) == 0
    resp = submit(client, "100.00", "110.00", "100.50")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["id"] == 1
    assert body["initial"] == "100.00"
    assert body["peak"] == "110.00"
    assert body["released"] == "100.50"
    assert body["total"] == "10.00"
    assert body["permanent"] == "0.50"
    assert body["ratio_display"] == "5.0000"
    assert body["conclusion"] == "PASS"
    assert "created_at" in body
    # 比率字符串保真，未舍入值也落库
    assert Decimal(body["ratio"]) == Decimal("5")
    assert count(client) == 1


def test_decimals_serialize_as_strings_no_float(client):
    body = submit(client, "0.10", "100.20", "10.11").json()
    for key in ("initial", "peak", "released", "total", "permanent", "ratio", "ratio_display"):
        assert isinstance(body[key], str), f"{key} 必须以字符串传输"
    assert body["total"] == "100.10"
    assert body["permanent"] == "10.01"


def test_list_orders_newest_first(client):
    submit(client, "0.00", "10.00", "0.00")
    submit(client, "0.00", "20.00", "1.00")
    rows = client.get("/api/submissions").json()
    assert [r["id"] for r in rows] == [2, 1]


# ---------- 10% 边界（未舍入判定） ----------

def test_exactly_ten_percent_passes(client):
    resp = submit(client, "0.00", "10.00", "1.00")
    assert resp.status_code == 201
    assert resp.json()["ratio_display"] == "10.0000"
    assert resp.json()["conclusion"] == "PASS"


def test_closest_2dp_pair_around_limit(client):
    """两位小数读数下最贴近 10% 边界的一对（最大量程 999.99）：

    - 永久 99.99 mL：比率 9.9990999…%  -> 显示 9.9991，PASS
    - 永久 100.00 mL：比率 10.0001000…% -> 显示 10.0001，FAIL
    结论由未舍入值决定，显示值仅作展示。
    """
    under = submit(client, "0.00", "999.99", "99.99").json()
    assert under["ratio_display"] == "9.9991"
    assert Decimal(under["ratio"]) < Decimal("10")
    assert under["conclusion"] == "PASS"

    over = submit(client, "0.00", "999.99", "100.00").json()
    assert over["ratio_display"] == "10.0001"
    assert Decimal(over["ratio"]) > Decimal("10")
    assert over["conclusion"] == "FAIL"


def test_smallest_2dp_step_over_limit_fails(client):
    # 100 -> 110，永久量 1.01 mL（两位小数下越界的最小步距），比率 10.1%。
    body = submit(client, "100.00", "110.00", "101.01").json()
    assert body["conclusion"] == "FAIL"
    assert body["ratio_display"] == "10.1000"


def test_just_under_limit_passes(client):
    # 19.99/200*100 = 9.995 -> 显示 9.9950 -> PASS
    body = submit(client, "0.00", "200.00", "19.99").json()
    assert body["ratio_display"] == "9.9950"
    assert body["conclusion"] == "PASS"


def test_full_permanent_fails_but_valid(client):
    body = submit(client, "1.00", "2.00", "2.00").json()
    assert body["ratio_display"] == "100.0000"
    assert body["conclusion"] == "FAIL"


def test_full_recovery_passes(client):
    body = submit(client, "5.00", "8.00", "5.00").json()
    assert body["ratio_display"] == "0.0000"
    assert body["conclusion"] == "PASS"


# ---------- 试验无效：不落库、不产生比率 ----------

@pytest.mark.parametrize(
    "i,p,r",
    [
        ("10.00", "10.00", "10.00"),   # 峰值 == 初始
        ("10.00", "9.00", "9.50"),     # 峰值 < 初始
        ("10.00", "20.00", "9.99"),    # 卸压 < 初始
        ("10.00", "20.00", "20.01"),   # 卸压 > 峰值
    ],
)
def test_invalid_test_422_and_not_persisted(client, i, p, r):
    before = count(client)
    resp = submit(client, i, p, r)
    assert resp.status_code == 422
    err = resp.json()["error"]
    assert err["code"] == "TEST_INVALID"
    assert "无效" in err["message"]
    assert count(client) == before


# ---------- 字段校验 ----------

@pytest.mark.parametrize(
    "i,p,r,bad_field",
    [
        ("-0.01", "10.00", "5.00", "initial"),    # 低于 0.00
        ("0.00", "1000.00", "5.00", "peak"),      # 高于 999.99
        ("0.00", "10.00", "1000.00", "released"), # 超上限
        ("1.234", "10.00", "5.00", "initial"),    # 超过两位小数
        ("abc", "10.00", "5.00", "initial"),      # 非数字
        ("1e2", "10.00", "5.00", "initial"),      # 科学计数法不接受
        ("NaN", "10.00", "5.00", "initial"),      # 非有限数
        ("", "10.00", "5.00", "initial"),         # 缺失/空
    ],
)
def test_field_validation_422_and_not_persisted(client, i, p, r, bad_field):
    before = count(client)
    resp = submit(client, i, p, r)
    assert resp.status_code == 422
    err = resp.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert bad_field in err["fields"]
    assert count(client) == before


def test_trailing_zero_third_place_accepted(client):
    # 1.230 规范化为 1.23，是合法两位读数
    body = submit(client, "1.230", "11.230", "1.230").json()
    assert body["initial"] == "1.230" or body["initial"].startswith("1.23")


def test_missing_field_422(client):
    resp = client.post("/api/submissions", json={"initial": "0.00", "peak": "10.00"})
    assert resp.status_code == 422
    assert resp.json()["error"]["fields"] == ["released"]


def test_extra_field_rejected(client):
    resp = client.post(
        "/api/submissions",
        json={"initial": "0.00", "peak": "10.00", "released": "0.00", "x": 1},
    )
    assert resp.status_code == 422


def test_boundary_values_0_and_999_99_accepted(client):
    body = submit(client, "0.00", "999.99", "0.00").json()
    assert body["total"] == "999.99"
    assert body["conclusion"] == "PASS"


def test_string_decimals_not_coerced_to_float(client):
    # 0.29 这类二进制不可精确实数必须按字符串精确存储与计算
    body = submit(client, "0.00", "0.29", "0.29").json()
    assert body["permanent"] == "0.29"
    assert body["total"] == "0.29"
    assert body["conclusion"] == "FAIL"  # 100%
