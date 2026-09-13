import type { SubmissionOut } from "../types";

interface HistoryListProps {
  items: SubmissionOut[];
  latestId: number | null;
}

/** 已保存的有效提交记录（无效试验不落库，故此处只会出现 PASS/FAIL）。 */
export function HistoryList({ items, latestId }: HistoryListProps) {
  return (
    <section className="panel history" data-testid="history-panel">
      <h2>已保存的有效提交</h2>
      {items.length === 0 ? (
        <p className="empty-history" data-testid="history-empty">
          暂无有效提交记录。无效试验不会出现在这里。
        </p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>初始</th>
              <th>峰值</th>
              <th>卸压</th>
              <th>总膨胀量(mL)</th>
              <th>永久膨胀量(mL)</th>
              <th>未舍入比率(%)</th>
              <th>显示比率(%)</th>
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                data-testid={`history-row-${item.id}`}
                className={item.id === latestId ? "latest" : undefined}
              >
                <td>{item.id}</td>
                <td>{item.initial}</td>
                <td>{item.peak}</td>
                <td>{item.released}</td>
                <td>{item.total}</td>
                <td>{item.permanent}</td>
                <td>{item.ratio}</td>
                <td>{item.ratio_display}</td>
                <td>
                  <span className={`mini-badge badge-${item.conclusion.toLowerCase()}`}>
                    {item.conclusion === "PASS" ? "放行" : "不放行"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
