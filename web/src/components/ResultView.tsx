import type { SubmissionOut } from "../types";

interface ResultViewProps {
  result: SubmissionOut;
}

const CONCLUSION_TEXT: Record<SubmissionOut["conclusion"], string> = {
  PASS: "放行（未舍入永久膨胀率 ≤ 10.00%）",
  FAIL: "不放行（未舍入永久膨胀率 > 10.00%）",
};

/**
 * 有效提交的结果面板：原读数、逐步算式、四位小数比率与唯一结论。
 * 所有数字原样展示后端返回的十进制字符串，前端不做任何重算。
 */
export function ResultView({ result }: ResultViewProps) {
  return (
    <section
      className={`panel result result-${result.conclusion.toLowerCase()}`}
      aria-live="polite"
      data-testid="result-panel"
      data-conclusion={result.conclusion}
    >
      <div className="result-head">
        <h2>判定结果</h2>
        <span className={`badge badge-${result.conclusion.toLowerCase()}`} data-testid="conclusion">
          {result.conclusion === "PASS" ? "放行 PASS" : "不放行 FAIL"}
        </span>
      </div>

      <table className="readings-table">
        <caption>原始读数（mL）</caption>
        <thead>
          <tr>
            <th>初始读数</th>
            <th>保压峰值读数</th>
            <th>卸压稳定读数</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-testid="show-initial">{result.initial}</td>
            <td data-testid="show-peak">{result.peak}</td>
            <td data-testid="show-released">{result.released}</td>
          </tr>
        </tbody>
      </table>

      <ol className="steps" data-testid="steps">
        <li>
          总膨胀量 = 保压峰值读数 − 初始读数 = {result.peak} − {result.initial} ={" "}
          <strong data-testid="step-total">{result.total} mL</strong>
        </li>
        <li>
          永久膨胀量 = 卸压稳定读数 − 初始读数 = {result.released} − {result.initial} ={" "}
          <strong data-testid="step-permanent">{result.permanent} mL</strong>
        </li>
        <li>
          永久膨胀率 = 永久膨胀量 ÷ 总膨胀量 × 100 = {result.permanent} ÷ {result.total} × 100
          <ul className="ratio-lines">
            <li>
              未舍入比率（唯一判定依据）：
              <strong data-testid="ratio-raw">{result.ratio}%</strong>
            </li>
            <li>
              四位小数显示比率（不作判定）：
              <strong data-testid="ratio-display">{result.ratio_display}%</strong>
            </li>
          </ul>
        </li>
      </ol>

      <p className="conclusion-text" data-testid="conclusion-text">
        唯一结论：{CONCLUSION_TEXT[result.conclusion]}
      </p>
      <p className="record-meta">
        记录编号 #{result.id}，保存时间 {new Date(result.created_at).toLocaleString("zh-CN")}
      </p>
    </section>
  );
}
