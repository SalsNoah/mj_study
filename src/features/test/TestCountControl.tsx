import { useId, useState } from 'react';
import { clampTestCount } from '@/domain/quiz';

function readInteger(text: string): number | null {
  const normalized = text.normalize('NFKC').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) ? number : null;
}

export function TestCountControl({ value, max, onChange, onValidityChange }: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const id = useId();
  const count = clampTestCount(value, max);
  const min = max > 0 ? 1 : 0;
  const [draft, setDraft] = useState(String(count));
  const [showError, setShowError] = useState(false);
  const parsed = readInteger(draft);
  const valid = parsed !== null && parsed >= min && parsed <= max;
  const stepFrom = parsed === null ? count : clampTestCount(parsed, max);
  const change = (next: number) => {
    const normalized = clampTestCount(next, max);
    setDraft(String(normalized));
    setShowError(false);
    onChange(normalized);
    onValidityChange(true);
  };
  const normalize = () => {
    if (parsed !== null) change(parsed);
    else setShowError(true);
  };

  return (
    <div className="test-count">
      <label className="test-count__label" htmlFor={id}>問題数</label>
      <div className="test-count__controls">
        <input
          id={id}
          type="text"
          role="spinbutton"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft}
          disabled={max === 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={valid ? parsed : undefined}
          aria-valuetext={valid ? undefined : `${draft || '未入力'}（未確定）`}
          aria-invalid={!valid}
          aria-describedby={`${id}-range${!valid && showError ? ` ${id}-error` : ''}`}
          onChange={(event) => {
            const text = event.target.value;
            const next = readInteger(text);
            const nextValid = next !== null && next >= min && next <= max;
            setDraft(text);
            setShowError(false);
            onValidityChange(nextValid);
            if (nextValid) onChange(next);
          }}
          onBlur={normalize}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              normalize();
              return;
            }
            const next = event.key === 'ArrowUp' ? stepFrom + 1
              : event.key === 'ArrowDown' ? stepFrom - 1
                : event.key === 'Home' ? min
                  : event.key === 'End' ? max
                    : undefined;
            if (next === undefined) return;
            event.preventDefault();
            change(next);
          }}
        />
        <span aria-hidden="true">問</span>
        <button type="button" aria-label="問題数を増やす" disabled={max === 0 || (valid && stepFrom >= max)}
          onClick={() => change(stepFrom + 1)}>△</button>
        <button type="button" aria-label="問題数を減らす" disabled={max === 0 || (valid && stepFrom <= min)}
          onClick={() => change(stepFrom - 1)}>▽</button>
      </div>
      <small className="hint test-count__range" id={`${id}-range`}>{max > 0 ? `1〜${max} 問` : '対象 0 問'}</small>
      {!valid && showError && <small className="error test-count__error" id={`${id}-error`}>
        {draft.trim() === '' ? '問題数を入力してください。' : `${min}〜${max}の整数を入力してください。`}
      </small>}
    </div>
  );
}
