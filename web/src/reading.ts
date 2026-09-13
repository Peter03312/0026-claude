import type { ReadingName, Readings } from "./types";

export type { ReadingName };

/** 读数字面量规则：0.00 ~ 999.99，最多两位小数；允许省略小数位（如 "7"）。 */
const READING_RE = /^(?:\d{1,3})(?:\.\d{1,2})?$/;

export const READING_MIN = "0.00";
export const READING_MAX = "999.99";

export const READING_LABELS: Record<ReadingName, string> = {
  initial: "初始读数",
  peak: "保压峰值读数",
  released: "卸压稳定读数",
};

export const EMPTY_READINGS: Readings = { initial: "", peak: "", released: "" };

/**
 * 校验单条读数。返回错误消息；合法时返回 null。
 * 仅做形态与范围拦截，**不做任何业务计算**（计算一律在后端 Decimal 中完成）。
 */
export function validateReading(raw: string): string | null {
  const value = raw.trim();
  if (value === "") {
    return "请输入读数";
  }
  if (!READING_RE.test(value)) {
    return "读数必须是 0.00 至 999.99 之间、最多两位小数的数字";
  }
  // 字符串形式的十进制比较，杜绝 Number 浮点/精度问题。
  const [intPart, fracPart = ""] = value.split(".");
  const canonical = intPart.padStart(3, "0") + "." + fracPart.padEnd(2, "0");
  if (canonical > "999.99") {
    return "读数必须不高于 999.99";
  }
  return null;
}

/** 校验整组读数，返回字段 -> 错误消息映射（空对象表示全部通过本地形态校验）。 */
export function validateReadings(readings: Readings): Partial<Record<ReadingName, string>> {
  const errors: Partial<Record<ReadingName, string>> = {};
  (Object.keys(READING_LABELS) as ReadingName[]).forEach((name) => {
    const message = validateReading(readings[name]);
    if (message) errors[name] = message;
  });
  return errors;
}
