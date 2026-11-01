import { useRef, useState, type CSSProperties } from "react";
import { BrandIcon } from "../../../components/ui/BrandIcon";
import { CameraMinimalisticIcon, CheckCircleIcon, CheckIcon, DangerCircleIcon, GlobalIcon, Routing2Icon, ShieldCheckIcon } from "../../../components/ui/icons";
import { Mark } from "../chrome";
import { useInView, useReducedMotion, useScene } from "../motion";

/**
 * The hero, and the whole idea in one picture: Issueit is the pipe, not the
 * place. On the left somebody reports a bug from inside your product. In
 * the middle Issueit stores it, adds the context, and routes it, and that is
 * all it does. On the right the bug turns up in the tools your team already
 * works in, and each time round it is a different set of them.
 */

type Kind = "tracker" | "chat" | "alert" | "ticket";
type Tool = { provider: string; name: string; where: string; kind: Kind; id: string };

const SETS: Tool[][] = [
  [
    { provider: "github", name: "GitHub", where: "acme/web", kind: "tracker", id: "#142" },
    { provider: "linear", name: "Linear", where: "Engineering", kind: "tracker", id: "ENG-381" },
    { provider: "slack", name: "Slack", where: "#bugs", kind: "chat", id: "" },
  ],
  [
    { provider: "jira", name: "Jira", where: "WEB board", kind: "tracker", id: "WEB-1207" },
    { provider: "teams", name: "Teams", where: "Engineering › Bugs", kind: "chat", id: "" },
    { provider: "pagerduty", name: "PagerDuty", where: "Checkout service", kind: "alert", id: "#4182" },
  ],
  [
    { provider: "gitlab", name: "GitLab", where: "acme/web", kind: "tracker", id: "#88" },
    { provider: "discord", name: "Discord", where: "#bug-reports", kind: "chat", id: "" },
    { provider: "zendesk", name: "Zendesk", where: "Support", kind: "ticket", id: "#20931" },
  ],
];

const TITLE = "Pay button does nothing";

const ADDED = [
  { icon: GlobalIcon, text: "Safari 18 · macOS · 1440×900" },
  { icon: DangerCircleIcon, text: "TypeError at pay.ts:42", tone: "danger" },
  { icon: Routing2Icon, text: "POST /api/pay · 502" , tone: "danger" },
  { icon: CameraMinimalisticIcon, text: "Screenshot · 14 steps" },
] as const;

/** Beats of the scene, in order. Everything on screen is derived from `step`. */
const S = {
  press: 1,
  open: 2,
  typing: 3,
  shot: 4,
  send: 5,
  stored: 6,
  added: 7, // …through added + ADDED.length - 1
  route: 7 + ADDED.length,
  tool: 8 + ADDED.length, // …and the two after it
  end: 10 + ADDED.length,
};

/**
 * The wires are drawn at the grid's own size (see --pl-h and the 56px wire
 * columns in home.css): one in to the middle, and out to the middle of each
 * of three equal cards with 10px between them.
 */
const WIRE = { w: 56, h: 440, mid: 220, out: [70, 220, 370] };

/** What a delivered bug looks like inside each kind of tool. */
function ToolCard({ tool, on, index }: { tool: Tool; on: boolean; index: number }) {
  return (
    <div className="pl-tool" data-on={on || undefined} data-kind={tool.kind} style={{ "--i": index } as CSSProperties}>
      <header>
        <BrandIcon provider={tool.provider} size={13} />
        <b>{tool.name}</b>
        <span>{tool.where}</span>
        <i className="pl-tool-ok">
          <CheckIcon size={11} />
        </i>
      </header>
      {tool.kind === "chat" ? (
        <div className="pl-msg">
          <span className="pl-msg-av">
            <Mark size={16} />
          </span>
          <div>
            <p className="pl-msg-who">
              Issueit <em>app</em>
            </p>
            <p className="pl-msg-text">
              New bug: <b>{TITLE} on Safari</b>
            </p>
            <p className="pl-msg-meta">acme.app/checkout · TypeError at pay.ts:42</p>
          </div>
        </div>
      ) : (
        <div className="pl-issue">
          <p className="pl-issue-title">
            <span className="pl-issue-state" data-kind={tool.kind} />
            {TITLE} on Safari
            <span className="pl-issue-id mono">{tool.id}</span>
          </p>
          <p className="pl-issue-meta">
            {tool.kind === "alert" ? (
              <>
                <span className="pl-label pl-label--hot">Triggered</span> High urgency · paged on-call
              </>
            ) : tool.kind === "ticket" ? (
              <>
                <span className="pl-label">Open</span> Requester ana@acme.app
              </>
            ) : (
              <>
                <span className="pl-label">bug</span> console error · 2 failed requests · screenshot
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export function Pipeline() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const visible = useInView(root, { margin: "0px" });
  const [step, setStep] = useState(reduced ? S.end : 0);
  const [typed, setTyped] = useState(reduced ? TITLE.length : 0);
  const [set, setSet] = useState(0);
  const [fading, setFading] = useState(false);

  useScene(visible && !reduced, async (wait) => {
    setFading(false);
    setStep(0);
    setTyped(0);
    await wait(700);
    setStep(S.press);
    await wait(900);
    setStep(S.open);
    await wait(500);
    setStep(S.typing);
    for (let i = 1; i <= TITLE.length; i++) {
      setTyped(i);
      await wait(34 + Math.random() * 46);
    }
    await wait(300);
    setStep(S.shot);
    await wait(650);
    setStep(S.send);
    await wait(700);
    for (let n = S.stored; n <= S.end; n++) {
      setStep(n);
      await wait(n < S.route ? 380 : n === S.route ? 650 : 420);
    }
    await wait(3600);
    setFading(true);
    await wait(520);
    setSet((v) => (v + 1) % SETS.length);
  });

  const at = (n: number) => reduced || step >= n;
  const tools = SETS[set];
  const sent = at(S.send);

  return (
    <div ref={root} className="pl" data-fading={fading || undefined}>
      <p className="sr-only">
        A bug is reported from inside a product, passes through Issueit, which adds the browser, console errors, failed requests and a screenshot, and arrives in GitHub, Linear and Slack.
      </p>
      <div className="pl-cols" aria-hidden>
        <p className="pl-cap">
          <span>1</span> Your app
        </p>
        <p className="pl-cap pl-cap--mid">
          <span>2</span> Issueit
        </p>
        <p className="pl-cap">
          <span>3</span> Your team's tools
        </p>
      </div>

      <div className="pl-grid" aria-hidden>
        {/* ---- 1: the product, where the bug happens */}
        <div className="pl-app" data-cap="1  Your app">
          <div className="pl-chrome">
            <span className="demo-lights">
              <i />
              <i />
              <i />
            </span>
            <span className="pl-url">
              <span>https://</span>acme.app/checkout
            </span>
          </div>
          <div className="pl-page">
            <p className="pl-page-h">Checkout</p>
            <div className="pl-row">
              <span>Annual plan</span>
              <span>£40.00</span>
            </div>
            <div className="pl-row">
              <span>VAT</span>
              <span>£8.00</span>
            </div>
            <div className="pl-card-field" />
            <span className="pl-pay" data-pressed={(at(S.press) && !at(S.open)) || undefined} data-stuck={at(S.press) || undefined}>
              <i className="pl-spin" />
              Pay £48.00
            </span>
          </div>

          <div className="pl-widget" data-open={(at(S.open) && !at(S.added + 2)) || undefined} data-sent={sent || undefined}>
            <div className="pl-form">
              <p className="pl-form-h">Report a bug</p>
              <div className="pl-input">
                {TITLE.slice(0, typed)}
                {at(S.typing) && !at(S.shot) && <i className="wf-caret" />}
              </div>
              <div className="pl-attach" data-on={at(S.shot) || undefined}>
                <CameraMinimalisticIcon size={11} /> screenshot.png
              </div>
              <span className="pl-send">Send</span>
            </div>
            <div className="pl-sent">
              <CheckCircleIcon size={16} />
              Sent. Thank you.
            </div>
          </div>
          <span className="pl-launcher" data-hidden={(at(S.open) && !at(S.added + 2)) || undefined}>
            Report a bug
          </span>
        </div>

        {/* ---- the wire in */}
        <svg className="pl-wire" viewBox={`0 0 ${WIRE.w} ${WIRE.h}`} preserveAspectRatio="none">
          <path d={`M0 ${WIRE.mid} H${WIRE.w}`} className="pl-wire-base" />
          <path d={`M0 ${WIRE.mid} H${WIRE.w}`} className="pl-wire-live" data-on={sent || undefined} pathLength={1} />
        </svg>

        {/* ---- 2: Issueit, which only passes it on */}
        <div className="pl-mid" data-cap="2  Issueit" data-on={at(S.stored) || undefined}>
          <div className="pl-mid-head">
            <Mark size={18} />
            <b>Issueit</b>
            <span className="pl-mid-state">{at(S.end) ? "Delivered" : at(S.stored) ? "Working" : "Listening"}</span>
          </div>
          <ul className="pl-steps">
            <li data-on={at(S.stored) || undefined}>
              <ShieldCheckIcon size={13} />
              Stored before anything is sent
            </li>
            {ADDED.map((a, i) => (
              <li key={a.text} data-on={at(S.added + i) || undefined} data-tone={"tone" in a ? a.tone : undefined}>
                <a.icon size={13} />
                <span className="pl-plus">+</span>
                {a.text}
              </li>
            ))}
          </ul>
          <p className="pl-route" data-on={at(S.route) || undefined}>
            <Routing2Icon size={13} />
            Routed to {tools.length} tools
          </p>
          <p className="pl-note">Nothing to log into. Nothing to triage here.</p>
        </div>

        {/* ---- the wires out */}
        <svg className="pl-wire" viewBox={`0 0 ${WIRE.w} ${WIRE.h}`} preserveAspectRatio="none">
          {WIRE.out.map((y, i) => {
            const d = `M0 ${WIRE.mid} C ${WIRE.w * 0.55} ${WIRE.mid}, ${WIRE.w * 0.45} ${y}, ${WIRE.w} ${y}`;
            return (
              <g key={y}>
                <path d={d} className="pl-wire-base" />
                <path d={d} className="pl-wire-live" data-on={at(S.route) || undefined} pathLength={1} style={{ transitionDelay: `${i * 140}ms` }} />
              </g>
            );
          })}
        </svg>

        {/* ---- 3: where the team already works */}
        <div className="pl-tools" data-cap="3  Your team's tools" key={set}>
          {tools.map((tool, i) => (
            <ToolCard key={tool.provider} tool={tool} on={at(S.tool + i)} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
