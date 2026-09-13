import { describe, expect, it } from "vitest";
import { validateReading, validateReadings } from "./reading";

describe("validateReading", () => {
  it.each([
    "0.00",
    "0",
    "7",
    "7.5",
    "12.34",
    "999.99",
    "100.00",
    "  100.00  ", // 前后空格由调用方 trim 后仍合法
  ])("接受合法读数 %s", (value) => {
    expect(validateReading(value)).toBeNull();
  });

  it.each([
    ["", "请输入读数"],
    ["   ", "请输入读数"],
    ["-1.00", "两位小数"],
    ["1000", "999.99"],
    ["1000.00", "999.99"],
    ["999.999", "999.99"],
    ["999.995", "999.99"],
    ["1.234", "两位小数"],
    ["0.123", "两位小数"],
    ["abc", "两位小数"],
    ["1.2.3", "两位小数"],
    ["NaN", "两位小数"],
    ["Infinity", "两位小数"],
    ["1e2", "两位小数"],
  ])("拒绝非法读数 %j -> %s", (value, expectedFragment) => {
    const message = validateReading(value);
    expect(message).not.toBeNull();
    expect(message).toContain(expectedFragment);
  });

  it("不接受使用 number 语义可能通过的千位写法", () => {
    expect(validateReading("1,000")).not.toBeNull();
  });
});

describe("validateReadings", () => {
  it("三字段都合法时返回空错误映射", () => {
    expect(
      validateReadings({ initial: "0.00", peak: "999.99", released: "500.00" }),
    ).toEqual({});
  });

  it("逐字段返回错误", () => {
    const errors = validateReadings({
      initial: "1.234",
      peak: "",
      released: "1000.00",
    });
    expect(errors.initial).toContain("两位小数");
    expect(errors.peak).toBe("请输入读数");
    expect(errors.released).toContain("999.99");
  });
});
