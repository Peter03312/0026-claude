/** 前后端共享的数据形状。所有数值均为字符串形式的十进制数，禁止转成 number。 */

export type ReadingName = "initial" | "peak" | "released";

export type Readings = Record<ReadingName, string>;

export type Conclusion = "PASS" | "FAIL";

export interface SubmissionOut {
  id: number;
  /** 原始读数（mL，最多两位小数） */
  initial: string;
  peak: string;
  released: string;
  /** 逐步算式所需的派生量，均由后端 Decimal 计算得到 */
  total: string;
  permanent: string;
  /** 未舍入比率（%）——唯一判定依据 */
  ratio: string;
  /** 四位小数显示比率（%），仅用于展示，不得用于判定 */
  ratio_display: string;
  conclusion: Conclusion;
  created_at: string;
}

export type ApiErrorCode = "TEST_INVALID" | "VALIDATION_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields: ReadingName[] | string[];
  };
}
