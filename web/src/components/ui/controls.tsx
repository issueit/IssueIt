import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** 2-4 options whose labels say it all. Arrow keys move between them. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div ref={ref} className="segmented" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 2-6 options that each need a sentence. */
export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  columns = 1,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; title: ReactNode; hint?: ReactNode; icon?: ReactNode }>;
  ariaLabel: string;
  columns?: number;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="radio-card" onClick={() => onChange(o.value)}>
          {o.icon}
          <span className="min-w-0">
            <span className="radio-card__title block">{o.title}</span>
            {o.hint && <span className="radio-card__hint block">{o.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A range slider with its value beside it. */
export function Slider({ value, onChange, min, max, step = 1, label, unit = "", disabled }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; unit?: string; disabled?: boolean }) {
  return (
    <span className="slider">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider__value tabular">
        {value}
        {unit}
      </span>
    </span>
  );
}
