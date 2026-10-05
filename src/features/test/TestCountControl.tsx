import { useId } from 'react';
import { clampTestCount } from '@/domain/quiz';

export function TestCountControl({ value, max, onChange }: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const count = clampTestCount(value, max);
  const min = max > 0 ? 1 : 0;
  const change = (next: number) => onChange(clampTestCount(next, max));

  return (
    <div className="test-count">
      <label className="test-count__label" htmlFor={id}>問題数</label>
      <div className="test-count__controls">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={count}
          disabled={max === 0}
          aria-describedby={`${id}-range`}
          onChange={(event) => change(event.target.valueAsNumber)}
          onKeyDown={(event) => {
            const next = event.key === 'ArrowUp' ? count + 1
              : event.key === 'ArrowDown' ? count - 1
                : event.key === 'Home' ? min
                  : event.key === 'End' ? max
                    : undefined;
            if (next === undefined) return;
            event.preventDefault();
            change(next);
          }}
        />
        <span aria-hidden="true">問</span>
        <button type="button" aria-label="問題数を増やす" disabled={count >= max}
          onClick={() => change(count + 1)}>△</button>
        <button type="button" aria-label="問題数を減らす" disabled={count <= min}
          onClick={() => change(count - 1)}>▽</button>
      </div>
      <small className="hint test-count__range" id={`${id}-range`}>対象 {max} 問まで</small>
    </div>
  );
}
