import { useState } from "react";
import type { Diagnostics as DiagnosticsData } from "../../lib/types";
import { Segmented } from "../../components/ui/controls";

type Tab = "console" | "network" | "steps";

/** "4.2s", "3m": how long before sending each entry happened. */
const ago = (ms: number) => (ms < 1000 ? "0s" : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 3_600_000)}h`);

const failed = (status: number | null) => status === null || status >= 400;

/** What the widget saw on the page before the report was sent: newest last, as it happened. */
export function Diagnostics({ data }: { data: DiagnosticsData }) {
  const consoleRows = data.console ?? [];
  const network = data.network ?? [];
  const steps = data.steps ?? [];
  const errors = consoleRows.filter((c) => c.level === "error").length;
  const failures = network.filter((n) => failed(n.status)).length;
  const first: Tab = consoleRows.length ? "console" : network.length ? "network" : "steps";
  const [tab, setTab] = useState<Tab>(first);
  const [open, setOpen] = useState<number | null>(null);
  if (!consoleRows.length && !network.length && !steps.length) return null;

  const options: Array<{ value: Tab; label: string }> = [];
  if (consoleRows.length) options.push({ value: "console", label: errors ? `Console · ${errors} ${errors === 1 ? "error" : "errors"}` : `Console · ${consoleRows.length}` });
  if (network.length) options.push({ value: "network", label: failures ? `Requests · ${failures} failed` : `Requests · ${network.length}` });
  if (steps.length) options.push({ value: "steps", label: `Steps · ${steps.length}` });

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="section-title !mb-0">Before reporting</h3>
        {options.length > 1 && (
          <Segmented<Tab>
            ariaLabel="Diagnostics"
            value={tab}
            onChange={(v) => {
              setTab(v);
              setOpen(null);
            }}
            options={options}
          />
        )}
      </div>
      {options.length === 1 && <p className="text-xs text-text-3 mb-1.5">{options[0].label}</p>}
      <div className="diag" role="list">
        {tab === "console" &&
          consoleRows.map((c, i) => (
            <div key={i} role="listitem" className="diag__row" data-tone={c.level === "error" ? "danger" : c.level === "warn" ? "warning" : undefined}>
              <span className="diag__time">-{ago(c.t)}</span>
              <span className="diag__body">
                <button type="button" className="diag__line" aria-expanded={c.stack ? open === i : undefined} disabled={!c.stack} onClick={() => setOpen(open === i ? null : i)}>
                  {c.message}
                </button>
                {c.stack && open === i && <pre className="diag__stack">{c.stack}</pre>}
              </span>
            </div>
          ))}
        {tab === "network" &&
          network.map((n, i) => (
            <div key={i} role="listitem" className="diag__row" data-tone={failed(n.status) ? "danger" : undefined}>
              <span className="diag__time">-{ago(n.t)}</span>
              <span className="diag__body diag__line">
                <span className="diag__method">{n.method}</span> {n.url}
              </span>
              <span className="diag__status" title={n.error}>
                {n.status ?? "failed"}
              </span>
              <span className="diag__ms">{n.ms} ms</span>
            </div>
          ))}
        {tab === "steps" &&
          steps.map((s, i) => (
            <div key={i} role="listitem" className="diag__row">
              <span className="diag__time">-{ago(s.t)}</span>
              <span className="diag__body diag__line">
                <span className="text-text-3">{s.kind === "navigate" ? "Went to" : s.kind === "input" ? "Changed" : "Clicked"}</span> {s.label}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
