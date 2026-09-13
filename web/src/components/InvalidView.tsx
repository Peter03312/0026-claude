interface InvalidViewProps {
  message: string;
}

/**
 * 试验无效面板：峰值不大于初始值，或卸压值不在 [初始值, 峰值] 区间。
 * 后端不落库、不产生比率；本面板同样不显示任何比率或结论。
 */
export function InvalidView({ message }: InvalidViewProps) {
  return (
    <section className="panel invalid" aria-live="polite" data-testid="invalid-panel">
      <div className="result-head">
        <h2>试验无效</h2>
        <span className="badge badge-invalid" data-testid="conclusion">
          无效 INVALID
        </span>
      </div>
      <p className="invalid-message" data-testid="invalid-message">
        {message}
      </p>
      <p className="invalid-note">
        本次读数组合整次无效：未保存记录，也不产生永久膨胀率。
        请核对三次读数后重新提交。
      </p>
      <p className="invalid-rule">
        有效条件：保压峰值读数必须大于初始读数；卸压稳定读数必须位于初始读数与保压峰值读数之间（含两端）。
      </p>
    </section>
  );
}
