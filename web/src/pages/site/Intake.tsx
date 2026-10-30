import { useRef, useState } from "react";
import { BugMinimalisticIcon, Code2Icon, GlobalIcon, WidgetIcon } from "../../components/ui/icons";
import { useInView, useTyping } from "./motion";

/** Three ways a report comes in, each typed out beside what it produces. */

type Seg = [cls: string, text: string];

const WAYS = [
  {
    id: "widget",
    icon: WidgetIcon,
    label: "Widget",
    blurb: "One script tag. A button in the corner and a short form.",
    file: "index.html",
    code: [
      ["p", "<"],
      ["k", "script"],
      ["n", "\n  "],
      ["a", "src"],
      ["p", '="'],
      ["s", "https://cdn.issueit.app/widget.js"],
      ["p", '"'],
      ["n", "\n  "],
      ["a", "data-project"],
      ["p", '="'],
      ["s", "prj_7f3k2m"],
      ["p", '"'],
      ["n", "\n  "],
      ["a", "defer"],
      ["n", "\n"],
      ["p", "></"],
      ["k", "script"],
      ["p", ">"],
    ] as Seg[],
  },
  {
    id: "form",
    icon: GlobalIcon,
    label: "Hosted form",
    blurb: "A link for support replies, emails and help menus. Nothing to install.",
    file: "Share this link",
    code: [
      ["s", "https://issueit.app/r/"],
      ["k", "prj_7f3k2m"],
    ] as Seg[],
  },
  {
    id: "api",
    icon: Code2Icon,
    label: "REST API",
    blurb: "Post from your server, your CLI or your crash handler.",
    file: "terminal",
    code: [
      ["k", "curl"],
      ["a", " -X POST "],
      ["s", "https://drop.issueit.app/v1/prj_7f3k2m/reports"],
      ["p", " \\"],
      ["n", "\n  "],
      ["a", "-H "],
      ["s", '"Authorization: Bearer sk_live_…"'],
      ["p", " \\"],
      ["n", "\n  "],
      ["a", "-d "],
      ["s", '\'{ "title": "Export times out",'],
      ["n", "\n        "],
      ["s", '"priority": "high", "environment": "production" }\''],
    ] as Seg[],
  },
] as const;

function Code({ segs, n }: { segs: readonly Seg[]; n: number }) {
  let left = n;
  return (
    <>
      {segs.map(([cls, text], i) => {
        if (left <= 0) return null;
        const shown = text.slice(0, left);
        left -= text.length;
        return (
          <span key={i} className={`tk-${cls}`}>
            {shown}
          </span>
        );
      })}
    </>
  );
}

function Preview({ way, ready }: { way: string; ready: boolean }) {
  if (way === "widget")
    return (
      <div className="pv pv-page" data-ready={ready || undefined}>
        <div className="pv-sk" style={{ width: "38%" }} />
        <div className="pv-sk pv-sk--lg" style={{ width: "72%" }} />
        <div className="pv-sk" style={{ width: "60%" }} />
        <div className="pv-sk" style={{ width: "66%" }} />
        <div className="pv-widget">
          <div className="pv-widget-title">Report a bug</div>
          <div className="pv-input" />
          <div className="pv-input pv-input--tall" />
          <div className="pv-widget-send">Send</div>
        </div>
        <span className="pv-launcher">
          <BugMinimalisticIcon size={12} />
          Report a bug
        </span>
      </div>
    );
  if (way === "form")
    return (
      <div className="pv pv-form" data-ready={ready || undefined}>
        <div className="pv-form-card">
          <div className="pv-form-org">Acme</div>
          <div className="pv-form-title">Report a bug</div>
          <div className="pv-label">Title</div>
          <div className="pv-input" />
          <div className="pv-label">What happened</div>
          <div className="pv-input pv-input--tall" />
          <div className="pv-widget-send">Send report</div>
          <div className="pv-form-foot">Collected by Issueit</div>
        </div>
      </div>
    );
  return (
    <div className="pv pv-json" data-ready={ready || undefined}>
      <div className="pv-status">
        <i />
        201 Created <span className="text-text-4">· 84 ms</span>
      </div>
      <pre className="mono">
        <span className="tk-p">{"{"}</span>
        {"\n  "}
        <span className="tk-a">"success"</span>
        <span className="tk-p">: </span>
        <span className="tk-k">true</span>
        <span className="tk-p">,</span>
        {"\n  "}
        <span className="tk-a">"report_id"</span>
        <span className="tk-p">: </span>
        <span className="tk-s">"rep_9x2kq7m4"</span>
        <span className="tk-p">,</span>
        {"\n  "}
        <span className="tk-a">"message"</span>
        <span className="tk-p">: </span>
        <span className="tk-s">"Report received"</span>
        {"\n"}
        <span className="tk-p">{"}"}</span>
      </pre>
    </div>
  );
}

export function Intake() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -20% 0px" });
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const way = WAYS[active];
  const full = way.code.reduce((n, [, t]) => n + t.length, 0);
  const typed = useTyping(way.code.map(([, t]) => t).join(""), inView, { speed: way.id === "form" ? 38 : 16, delay: 250 });
  const done = typed >= full;

  return (
    <div ref={ref} className="intake" data-rv>
      <div className="intake-tabs" role="tablist" aria-label="Ways to collect reports">
        {WAYS.map((w, i) => (
          <button
            key={w.id}
            role="tab"
            type="button"
            aria-selected={i === active}
            className="intake-tab"
            onClick={() => {
              setActive(i);
              setManual(true);
            }}
          >
            <span className="intake-tab-head">
              <w.icon size={16} />
              {w.label}
            </span>
            <span className="intake-tab-blurb">{w.blurb}</span>
            {!manual && i === active && (
              <span
                key={`${active}-${inView}`}
                className="intake-progress"
                style={{ animationPlayState: inView ? "running" : "paused" }}
                onAnimationEnd={() => setActive((a) => (a + 1) % WAYS.length)}
              />
            )}
          </button>
        ))}
      </div>

      <div className="intake-stage" role="tabpanel" aria-label={way.label}>
        <div className="intake-code">
          <div className="intake-file">
            <span className="demo-lights" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="mono">{way.file}</span>
          </div>
          <pre className="mono" aria-label={way.code.map(([, t]) => t).join("")}>
            <code aria-hidden>
              <Code segs={way.code} n={typed} />
              <span className="caret" data-done={done || undefined} />
            </code>
          </pre>
        </div>
        <div className="intake-preview" key={way.id}>
          <Preview way={way.id} ready={done} />
        </div>
      </div>
    </div>
  );
}
