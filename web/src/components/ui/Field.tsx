import {
  cloneElement,
  forwardRef,
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { AltArrowDownIcon, CheckIcon, MagnifierIcon } from "./icons";

/** A label, the control, then a hint or an error. Wires up ids and aria for the child. */
export function Field({
  label,
  hint,
  error,
  optional,
  action,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Something small on the right of the label, such as "Forgotten?". */
  action?: ReactNode;
  children: ReactElement<any>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <div className="flex items-baseline justify-between gap-2">
        <label className="field__label" htmlFor={id}>
          {label}
          {optional && <span className="optional"> (optional)</span>}
        </label>
        {action}
      </div>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": hint || error ? hintId : undefined,
      })}
      {error ? (
        <div className="field__error" id={hintId} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="field__hint" id={hintId}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { size_?: "sm" }>(function Input({ className, size_, ...rest }, ref) {
  return <input ref={ref} className={`input ${size_ === "sm" ? "input--sm" : ""} ${className ?? ""}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={`textarea ${className ?? ""}`} {...rest} />;
});

export type Option = {
  value: string;
  label: string;
  /** A quieter second line, for choices that need a sentence. */
  hint?: string;
  icon?: ComponentType<{ size?: number }>;
  /** Options sharing a group are shown together under its name. */
  group?: string;
  disabled?: boolean;
};

type SelectProps = {
  options: Option[];
  value?: string;
  /** Shaped like a native change event, so call sites read e.target.value. */
  onChange?: (e: { target: { value: string } }) => void;
  small?: boolean;
  className?: string;
  disabled?: boolean;
  /** Shown when nothing matches the value yet. */
  placeholder?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/** Long lists get a filter box; short ones would only be slowed down by one. */
const FILTER_FROM = 9;

/**
 * Our own dropdown rather than the browser's, so the list matches the rest of
 * the app in both themes, options can carry a hint, an icon or a group, and a
 * long list can be typed into. It answers like a native select: arrow keys and
 * Home/End move, typing jumps to a label, Enter chooses, Escape closes and
 * hands focus back.
 */
export function Select({ options, value, onChange, small, className, disabled, placeholder = "Choose…", id, name, ...aria }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const listId = useId();
  const typed = useRef({ text: "", at: 0 });

  const selected = options.find((o) => o.value === value);
  const filtering = options.length >= FILTER_FROM;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const openList = (startAt?: number) => {
    if (disabled) return;
    setQuery("");
    const i = options.findIndex((o) => o.value === value);
    setActive(startAt ?? (i >= 0 ? i : 0));
    setOpen(true);
  };

  const choose = (option: Option) => {
    if (option.disabled) return;
    setOpen(false);
    trigger.current?.focus();
    if (option.value !== value) onChange?.({ target: { value: option.value } });
  };

  // Measured against the trigger, and flipped above it when the room below runs out.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !pop.current) return;
    const r = trigger.current.getBoundingClientRect();
    const wanted = Math.min(pop.current.scrollHeight, 340);
    const below = window.innerHeight - r.bottom - 10;
    const above = r.top - 10;
    const flip = below < Math.min(wanted, 180) && above > below;
    const width = Math.max(r.width, 170);
    setPos({
      top: flip ? Math.max(8, r.top - Math.min(wanted, above) - 5) : r.bottom + 5,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(140, Math.min(wanted, flip ? above : below)),
      above: flip,
    });
  }, [open, shown.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", () => setOpen(false), { once: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Keep the active option in view, however it became active.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const step = (by: number) => {
    if (!shown.length) return;
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + by + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (!filtering && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Typeahead: letters typed in quick succession build one prefix.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 800 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  const SelectedIcon = selected?.icon;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        name={name}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !filtering && shown[active] ? `${listId}-${active}` : undefined}
        disabled={disabled}
        className={`select ${small ? "select--sm" : ""} ${className ?? ""}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        {...aria}
      >
        {SelectedIcon && <SelectedIcon size={14} />}
        <span className="select__value">{selected ? selected.label : placeholder}</span>
        <AltArrowDownIcon size={13} className="select__arrow" />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="listbox"
            data-above={pos?.above || undefined}
            style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: "hidden" }}
          >
            {filtering && (
              <div className="listbox__filter">
                <MagnifierIcon size={13} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Filter"
                  aria-label="Filter the list"
                  aria-controls={listId}
                  aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                />
              </div>
            )}
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={aria["aria-label"]}
              className="listbox__list"
            >
              {!shown.length && <div className="listbox__none">Nothing matches "{query}".</div>}
              {shown.map((o, i) => {
                const IconC = o.icon;
                const heading = o.group && o.group !== shown[i - 1]?.group;
                return (
                  <Fragment key={o.value}>
                    {heading && <div className="listbox__group">{o.group}</div>}
                    <div
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled || undefined}
                      data-active={i === active || undefined}
                      className="listbox__option"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                    >
                      {IconC && <IconC size={14} />}
                      <span className="min-w-0 flex-1">
                        <span className="listbox__label">{o.label}</span>
                        {o.hint && <span className="listbox__hint">{o.hint}</span>}
                      </span>
                      {o.value === value && <CheckIcon size={14} className="listbox__check" />}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
