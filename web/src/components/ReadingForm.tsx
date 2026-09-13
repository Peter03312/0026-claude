import { READING_LABELS, type ReadingName } from "../reading";
import type { Readings } from "../types";

interface ReadingFormProps {
  readings: Readings;
  errors: Partial<Record<ReadingName, string>>;
  submitting: boolean;
  onFieldChange: (name: ReadingName, value: string) => void;
  onSubmit: () => void;
}

const FIELDS: ReadingName[] = ["initial", "peak", "released"];

export function ReadingForm({
  readings,
  errors,
  submitting,
  onFieldChange,
  onSubmit,
}: ReadingFormProps) {
  return (
    <form
      aria-label="气瓶读数录入"
      onSubmit={(event) => {
        event.preventDefault();
        if (!submitting) onSubmit();
      }}
      noValidate
    >
      <div className="field-grid">
        {FIELDS.map((name) => (
          <div className="field" key={name}>
            <label htmlFor={`field-${name}`}>{READING_LABELS[name]}</label>
            <div className="input-wrap">
              <input
                id={`field-${name}`}
                data-testid={`input-${name}`}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? `error-${name}` : undefined}
                value={readings[name]}
                placeholder="0.00"
                onChange={(event) => onFieldChange(name, event.target.value)}
              />
              <span className="unit">mL</span>
            </div>
            {errors[name] ? (
              <p className="field-error" id={`error-${name}`} data-testid={`error-${name}`}>
                {errors[name]}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <button type="submit" disabled={submitting} data-testid="submit-button">
        {submitting ? "提交中…" : "提交并判定"}
      </button>
      <p className="hint">读数范围 0.00–999.99 mL，最多两位小数。</p>
    </form>
  );
}
