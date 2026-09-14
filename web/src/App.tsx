import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, listSubmissions, submitReadings } from "./api";
import { InvalidView } from "./components/InvalidView";
import { HistoryList } from "./components/HistoryList";
import { ReadingForm } from "./components/ReadingForm";
import { ResultView } from "./components/ResultView";
import { EMPTY_READINGS, validateReadings, type ReadingName } from "./reading";
import type { Readings, SubmissionOut } from "./types";

function normalizeReadings(r: Readings): Readings {
  return {
    initial: r.initial.trim(),
    peak: r.peak.trim(),
    released: r.released.trim(),
  };
}

export default function App() {
  const [readings, setReadings] = useState<Readings>(EMPTY_READINGS);
  const [result, setResult] = useState<SubmissionOut | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<ReadingName, string>>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SubmissionOut[]>([]);

  // 请求序号：每次编辑或新提交都会产生新的序号；只有“当前序号”的响应
  // 才能写入结论。提交发出后、响应返回前若检验员改了读数，旧响应到达时
  // 序号已失效，直接丢弃，杜绝旧数据结论重新冒出。
  const requestSeq = useRef(0);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await listSubmissions());
    } catch {
      // 历史加载失败不阻断判定流程
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // 任一读数改变：立即让在途请求失效，并清除上一次结论（成功记录与无效
  // 提示都清除）；必须重新提交后才能形成新记录。
  const handleFieldChange = (name: ReadingName, value: string) => {
    requestSeq.current += 1;
    setReadings((prev) => ({ ...prev, [name]: value }));
    setResult(null);
    setInvalidMessage(null);
    setRequestError(null);
    // 在途响应已因本次编辑作废，无需继续显示“提交中”
    setSubmitting(false);
    setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async () => {
    const errors = validateReadings(readings);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    const seq = ++requestSeq.current;
    // 记录本次提交对应的读数（异步闭包之外固定下来），响应回来时核对
    const submitted = normalizeReadings(readings);

    setSubmitting(true);
    setRequestError(null);
    setInvalidMessage(null);
    setResult(null);

    const isCurrent = () => requestSeq.current === seq;

    try {
      const saved = await submitReadings(submitted);
      // 双保险：响应必须仍属当前序号，且其原读数与当前输入一致，才显示结论。
      const currentInput = normalizeReadings(readings);
      if (!isCurrent()) {
        // 在途期间读数被改过：旧结论不显示；记录已在库中，仅静默刷新历史。
        void refreshHistory();
        return;
      }
      if (
        saved.initial !== currentInput.initial ||
        saved.peak !== currentInput.peak ||
        saved.released !== currentInput.released
      ) {
        // 理论上不应发生（输入未变则读数相同），作为防御性丢弃。
        return;
      }
      setResult(saved);
      await refreshHistory();
    } catch (error) {
      if (!isCurrent()) {
        // 已被编辑取代的在途请求报错，同样不写任何结论。
        return;
      }
      if (error instanceof ApiRequestError) {
        if (error.code === "TEST_INVALID") {
          // 试验无效：无比率、无记录、无结论。
          setInvalidMessage(error.message);
        } else {
          setRequestError(error.message);
          // 服务端字段错误回写到对应输入框
          const serverFieldErrors: Partial<Record<ReadingName, string>> = {};
          for (const field of error.fields) {
            if (field === "initial" || field === "peak" || field === "released") {
              serverFieldErrors[field] = error.message;
            }
          }
          if (Object.keys(serverFieldErrors).length > 0) {
            setFormErrors(serverFieldErrors);
          }
        }
      } else {
        setRequestError("无法连接判定服务，请稍后重试。");
      }
    } finally {
      if (isCurrent()) {
        setSubmitting(false);
      }
    }
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>气瓶水套耐压试验 · 永久膨胀率判定</h1>
        <p className="subtitle">
          检验员按 mL 录入初始、保压峰值、卸压稳定三次读数；判定一律使用
          <strong> 未舍入 </strong>永久膨胀率与 10.00% 比较，四位小数仅为显示值。
        </p>
      </header>

      <section className="panel entry">
        <h2>读数录入</h2>
        <ReadingForm
          readings={readings}
          errors={formErrors}
          submitting={submitting}
          onFieldChange={handleFieldChange}
          onSubmit={() => void handleSubmit()}
        />
        {requestError ? (
          <p className="request-error" role="alert" data-testid="request-error">
            {requestError}
          </p>
        ) : null}
      </section>

      {invalidMessage ? <InvalidView message={invalidMessage} /> : null}
      {result ? <ResultView result={result} /> : null}

      {!result && !invalidMessage ? (
        <section className="panel placeholder" data-testid="placeholder">
          <h2>判定区域</h2>
          <p>
            提交有效读数后，此处显示原始读数、逐步算式、四位小数永久膨胀率及
            <strong> 唯一结论</strong>；读数组合无效时只显示“试验无效”，不产生比率。
          </p>
        </section>
      ) : null}

      <HistoryList items={history} latestId={result?.id ?? null} />
    </main>
  );
}
