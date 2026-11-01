import { useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { BrandIcon } from "../../../components/ui/BrandIcon";
import { AltArrowDownIcon, AltArrowRightIcon, CameraMinimalisticIcon, CheckCircleIcon, DangerCircleIcon, PauseIcon, RestartIcon } from "../../../components/ui/icons";
import { DocsLink } from "../../../lib/docs-link";
import { useInView, useReducedMotion, useScene } from "../motion";

/**
 * Feature cards in the shape of a product page that shows rather than
 * tells: a live picture on top, a sentence underneath. Each picture is a
 * small scene that runs while it is on screen and stops when it isn't.
 */

export function DevCard({
  visual,
  icon: Icon,
  title,
  children,
  docs,
  wide,
  index = 0,
}: {
  visual: ReactNode;
  icon: ComponentType<{ size?: number }>;
  title: string;
  children: ReactNode;
  docs?: string;
  wide?: boolean;
  index?: number;
}) {
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <article className="dx-card" data-wide={wide || undefined} data-rv style={{ "--d": `${(index % 2) * 90}ms` } as CSSProperties} onPointerMove={onMove}>
      <div className="dx-visual">{visual}</div>
      <div className="dx-body">
        <Icon size={18} />
        <h3>{title}</h3>
        <p>{children}</p>
        {docs && (
          <DocsLink to={docs} className="dx-more">
            Learn more
            <AltArrowRightIcon size={12} />
          </DocsLink>
        )}
      </div>
    </article>
  );
}

/** Runs `scene` on a loop while the element is on screen, unless motion is reduced. */
function useLive<T extends Element>(ref: React.RefObject<T | null>) {
  const reduced = useReducedMotion();
  const visible = useInView(ref, { margin: "0px" });
  return { run: visible && !reduced, reduced };
}

/* ------------------------------------------------------------ the API */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz0123456789";
const reportId = () => `rep_${Array.from({ length: 14 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("")}`;
const SEED = ["rep_4f9k2m8q1x0c7v", "rep_0ec9m834c7a446", "rep_13359f77a6e43h", "rep_c3be18b80e457a", "rep_9k2n4f7q0x8c1v"];

type Line = { id: string; key: number };

/** POST a report, get an id back. The button really sends another one. */
export function ApiStream() {
  const ref = useRef<HTMLDivElement>(null);
  const { run } = useLive(ref);
  const key = useRef(SEED.length);
  const [lines, setLines] = useState<Line[]>(() => SEED.map((id, i) => ({ id, key: SEED.length - i })));
  const [pressed, setPressed] = useState(0);

  const send = () => {
    key.current += 1;
    const k = key.current;
    setLines((ls) => [{ id: reportId(), key: k }, ...ls].slice(0, 7));
  };

  useScene(run, async (wait) => {
    await wait(1500 + Math.random() * 900);
    send();
  });

  return (
    <div ref={ref} className="api">
      <div className="api-bar">
        <span className="api-status">201 Created</span>
        <span className="api-route mono">
          POST /v1/acme/reports
          <AltArrowDownIcon size={11} />
        </span>
        <button
          type="button"
          className="api-send"
          data-pressed={pressed || undefined}
          onClick={() => {
            send();
            setPressed((p) => p + 1);
          }}
          onAnimationEnd={() => setPressed(0)}
        >
          Send
        </button>
      </div>
      <div className="api-lines mono" aria-live="off">
        {lines.map((l, row) => (
          <div key={l.key} className="api-line" style={{ "--row": row } as CSSProperties}>
            <span className="api-code">HTTP 201:</span> {"{ "}
            <span className="api-k">"report_id"</span>: <span className="api-v">"{l.id}"</span>
            {" }"}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the widget */

const WIDGET_TITLE = "Export ignores the date filter";

/** The widget on somebody's page: open, write, attach, send. */
export function WidgetFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const { run, reduced } = useLive(ref);
  const [s, setS] = useState({ open: reduced, typed: reduced ? WIDGET_TITLE.length : 0, shot: reduced, sent: false, pressing: false });
  const set = (p: Partial<typeof s>) => setS((prev) => ({ ...prev, ...p }));

  useScene(run, async (wait) => {
    set({ open: false, typed: 0, shot: false, sent: false, pressing: false });
    await wait(900);
    set({ open: true });
    await wait(700);
    for (let i = 1; i <= WIDGET_TITLE.length; i++) {
      set({ typed: i });
      await wait(38 + Math.random() * 50);
    }
    await wait(450);
    set({ shot: true });
    await wait(900);
    set({ pressing: true });
    await wait(160);
    set({ pressing: false, sent: true });
    await wait(2300);
    set({ open: false });
    await wait(700);
  });

  return (
    <div ref={ref} className="wf" aria-hidden>
      <div className="wf-page">
        <span className="wf-sk" style={{ width: "38%" }} />
        <span className="wf-sk wf-sk--lg" style={{ width: "62%" }} />
        <span className="wf-sk" style={{ width: "80%" }} />
        <span className="wf-sk" style={{ width: "72%" }} />
        <div className="wf-table">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} />
          ))}
        </div>
      </div>
      <div className="wf-panel" data-open={s.open || undefined} data-sent={s.sent || undefined}>
        <div className="wf-form">
          <p className="wf-label">What went wrong?</p>
          <div className="wf-input">
            {WIDGET_TITLE.slice(0, s.typed)}
            {s.open && !s.sent && s.typed < WIDGET_TITLE.length && <i className="wf-caret" />}
          </div>
          <div className="wf-attach" data-on={s.shot || undefined}>
            <CameraMinimalisticIcon size={12} />
            screenshot.png
            <span>attached</span>
          </div>
          <div className="wf-actions">
            <span className="wf-ctx">Chrome 131 · Windows · /exports</span>
            <span className="wf-send" data-pressing={s.pressing || undefined}>
              Send
            </span>
          </div>
        </div>
        <div className="wf-done">
          <CheckCircleIcon size={18} />
          <b>Sent. Thank you.</b>
          <span>We'll email you when it's fixed.</span>
        </div>
      </div>
      <span className="wf-launcher" data-open={s.open || undefined}>
        Report a bug
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ diagnostics */

const EVENTS = [
  { at: -14.2, kind: "click", text: "click", detail: 'button "Annual plan"' },
  { at: -9.8, kind: "net", text: "GET /api/cart", detail: "200 · 82 ms" },
  { at: -6.3, kind: "click", text: "input", detail: "#card-number" },
  { at: -4.1, kind: "click", text: "click", detail: 'button "Pay £40.00"' },
  { at: -4.0, kind: "fail", text: "POST /api/pay", detail: "502 · 1.2 s" },
  { at: -3.9, kind: "error", text: "TypeError", detail: "session.token is undefined · pay.ts:42" },
  { at: -1.6, kind: "click", text: "click", detail: 'button "Pay £40.00"' },
  { at: 0, kind: "sent", text: "Report sent", detail: "with 14 steps attached" },
] as const;
const SPAN = 15;

/** What happened before somebody pressed send, replayed on a timeline. */
export function ContextReplay() {
  const ref = useRef<HTMLDivElement>(null);
  const { run, reduced } = useLive(ref);
  const [cur, setCur] = useState(reduced ? EVENTS.length - 1 : -1);

  useScene(run, async (wait) => {
    setCur(-1);
    await wait(600);
    for (let i = 0; i < EVENTS.length; i++) {
      setCur(i);
      await wait(i === EVENTS.length - 1 ? 3200 : 820);
    }
  });

  const head = cur < 0 ? 0 : (EVENTS[cur].at + SPAN) / SPAN;
  return (
    <div ref={ref} className="cr" aria-hidden>
      <div className="cr-track">
        <div className="cr-ticks">
          {EVENTS.map((e, i) => (
            <i key={i} data-k={e.kind} data-on={i <= cur || undefined} style={{ left: `${((e.at + SPAN) / SPAN) * 100}%` }} />
          ))}
        </div>
        <span className="cr-head" style={{ "--x": head } as CSSProperties} data-moving={cur >= 0 || undefined} />
        <div className="cr-scale mono">
          <span>-15s</span>
          <span>-10s</span>
          <span>-5s</span>
          <span>sent</span>
        </div>
      </div>
      <ol className="cr-rows mono">
        {EVENTS.map((e, i) => (
          <li key={i} data-k={e.kind} data-on={i <= cur || undefined} data-cur={i === cur || undefined}>
            <span className="cr-at">{e.at === 0 ? "0.0s" : `${e.at.toFixed(1)}s`}</span>
            <span className="cr-kind">{e.text}</span>
            <span className="cr-detail">{e.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------ routing */

const RULES = [
  { when: "priority is critical", provider: "pagerduty", to: "PagerDuty" },
  { when: "source is widget", provider: "linear", to: "Linear" },
  { when: "environment is production", provider: "slack", to: "Slack · #bugs" },
] as const;

const INCOMING = [
  { title: "Checkout spinner never stops", p: "critical", match: [0, 1, 2] },
  { title: "Avatar upload rotates photos", p: "medium", match: [1, 2] },
  { title: "Nightly import failed on staging", p: "high", match: [] as number[] },
  { title: "Webhook signature mismatch", p: "critical", match: [0, 2] },
] as const;

/** Reports drop in; the rules they match light up, and so do the tools they reach. */
export function RoutingFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const { run, reduced } = useLive(ref);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"in" | "match" | "out">(reduced ? "match" : "in");

  useScene(run, async (wait) => {
    for (let n = 0; n < INCOMING.length; n++) {
      setI(n);
      setPhase("in");
      await wait(700);
      setPhase("match");
      await wait(2000);
      setPhase("out");
      await wait(420);
    }
  });

  const r = INCOMING[i];
  const matched = (k: number) => phase !== "in" && (r.match as readonly number[]).includes(k);
  return (
    <div ref={ref} className="rf" aria-hidden>
      <div className="rf-report" key={i} data-phase={phase}>
        <i data-p={r.p} />
        {r.title}
        <span className="rf-p">{r.p}</span>
      </div>
      <ul className="rf-rules">
        {RULES.map((rule, k) => (
          <li key={rule.to} data-on={matched(k) || undefined} style={{ "--k": k } as CSSProperties}>
            <span className="rf-when mono">
              <span className="rf-if">if</span> {rule.when}
            </span>
            <span className="rf-line" />
            <span className="rf-to">
              <BrandIcon provider={rule.provider} size={13} />
              {rule.to}
              <CheckCircleIcon size={13} />
            </span>
          </li>
        ))}
      </ul>
      <p className="rf-none mono" data-on={(phase !== "in" && r.match.length === 0) || undefined}>
        No rule matched · kept in the inbox
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ delivery feed */

type FeedItem = {
  state: "delivered" | "retrying" | "paused";
  time: string;
  provider: string;
  name: string;
  verb: string;
  what: string;
  extra: [string, string, string, string];
};

const FEED: FeedItem[] = [
  { state: "delivered", time: "Oct 31 11:14:48", provider: "github", name: "GitHub Issues", verb: "as", what: "acme/web#142", extra: ["in", "380 ms", "on attempt", "1"] },
  { state: "retrying", time: "Oct 31 11:14:46", provider: "webhook", name: "Your webhook", verb: "with", what: "502 Bad Gateway", extra: ["attempt", "3", "next in", "10 min"] },
  { state: "delivered", time: "Oct 31 11:14:41", provider: "linear", name: "Linear", verb: "as", what: "ENG-381", extra: ["after", "4 attempts", "over", "42 min"] },
  { state: "paused", time: "Oct 31 11:13:02", provider: "jira", name: "Jira", verb: "with", what: "401 Unauthorized", extra: ["waiting for", "a new token", "kept", "6 reports"] },
  { state: "delivered", time: "Oct 31 11:12:57", provider: "discord", name: "Discord", verb: "in", what: "#bugs", extra: ["in", "210 ms", "on attempt", "1"] },
];

const STATE = {
  delivered: { label: "Delivered", icon: CheckCircleIcon },
  retrying: { label: "Retrying", icon: RestartIcon },
  paused: { label: "Paused", icon: PauseIcon },
} as const;

function FeedEntry({ item }: { item: FeedItem }) {
  const S = STATE[item.state];
  return (
    <li className="feed-item" data-s={item.state}>
      <span className="feed-icon">{item.state === "paused" ? <DangerCircleIcon size={15} /> : <S.icon size={15} />}</span>
      <div>
        <p className="feed-top">
          <span className="feed-badge">{S.label}</span>
          <span className="feed-time mono">{item.time}</span>
        </p>
        <p className="feed-line">
          to{" "}
          <span className="feed-chip">
            <BrandIcon provider={item.provider} size={12} />
            {item.name}
          </span>{" "}
          {item.verb} <span className="feed-chip">{item.what}</span>
        </p>
        <p className="feed-line">
          {item.extra[0]} <span className="feed-chip">{item.extra[1]}</span> {item.extra[2]} <span className="feed-chip">{item.extra[3]}</span>
        </p>
      </div>
    </li>
  );
}

/** Every delivery, as it happens: a slow scroll through the log. */
export function DeliveryFeed() {
  const ref = useRef<HTMLDivElement>(null);
  const { run } = useLive(ref);
  return (
    <div ref={ref} className="feed" data-run={run || undefined} aria-hidden>
      <div className="feed-track">
        {[0, 1].map((k) => (
          <ol key={k} className="feed-set">
            {FEED.map((item, i) => (
              <FeedEntry key={i} item={item} />
            ))}
          </ol>
        ))}
      </div>
    </div>
  );
}
