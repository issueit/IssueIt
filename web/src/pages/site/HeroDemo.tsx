import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { BugMinimalisticIcon, CameraMinimalisticIcon, CheckCircleIcon, CloseIcon, PaperclipIcon } from "../../components/ui/icons";
import { useInView, useReducedMotion, useScene } from "./motion";

/**
 * The hero scene: someone hits a broken button, reports it with the widget,
 * and the report is delivered to three tools. It plays on its own; click
 * into the form to write your own report and send it through.
 */

type Dest = "waiting" | "sending" | "done";
type Mode = "auto" | "user" | "userSend";

const DESTS = [
  { provider: "github", name: "GitHub Issues", target: "acme/web", result: (n: number) => `Issue #${n + 100} opened` },
  { provider: "linear", name: "Linear", target: "Engineering", result: (n: number) => `ENG-${n + 339} created` },
  { provider: "discord", name: "Discord", target: "#bugs", result: () => "Posted" },
] as const;

const SCRIPT = {
  title: "Pay button does nothing on Safari",
  desc: "Clicked Pay twice. Card is valid, no error shown.",
};

type State = {
  cursor: { x: number; y: number; on: boolean };
  clicks: number;
  paying: boolean;
  panel: boolean;
  title: string;
  desc: string;
  shot: boolean;
  sending: boolean;
  sent: boolean;
  packet: number;
  report: boolean;
  chips: number;
  dests: Dest[];
  fading: boolean;
};

const initial: State = {
  cursor: { x: 120, y: 330, on: false },
  clicks: 0,
  paying: false,
  panel: false,
  title: "",
  desc: "",
  shot: false,
  sending: false,
  sent: false,
  packet: 0,
  report: false,
  chips: 0,
  dests: ["waiting", "waiting", "waiting"],
  fading: false,
};

const finished: State = {
  ...initial,
  title: SCRIPT.title,
  desc: SCRIPT.desc,
  shot: true,
  report: true,
  chips: 6,
  dests: ["done", "done", "done"],
};

/** Offset of `el` inside `stage`, in layout pixels, so a tilted parent doesn't skew it. */
function offsetWithin(el: HTMLElement, stage: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function visitorContext() {
  const ua = navigator.userAgent;
  const browser =
    (/Edg\/(\d+)/.exec(ua) && `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`) ||
    (/Firefox\/(\d+)/.exec(ua) && `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`) ||
    (/Chrome\/(\d+)/.exec(ua) && `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`) ||
    (/Version\/(\d+).*Safari/.exec(ua) && `Safari ${/Version\/(\d+)/.exec(ua)![1]}`) ||
    "Your browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Your system";
  return [browser, os, `${innerWidth}×${innerHeight}`, navigator.language, location.host];
}

const SCRIPTED_CONTEXT = ["Safari 18", "macOS", "1440×900", "en-GB", "acme.app/checkout"];

/** Earlier reports, already delivered, so the inbox looks lived in. */
const EARLIER = [
  ["Avatar upload rotates photos", "2h ago"],
  ["Search loses focus after typing", "yesterday"],
  ["Tooltip clipped on small screens", "2d ago"],
];

export function HeroDemo() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pay = useRef<HTMLButtonElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const titleEl = useRef<HTMLInputElement>(null);
  const descEl = useRef<HTMLTextAreaElement>(null);
  const shotEl = useRef<HTMLButtonElement>(null);
  const sendEl = useRef<HTMLButtonElement>(null);

  const reduced = useReducedMotion();
  const visible = useInView(root, { margin: "0px" });
  const [mode, setMode] = useState<Mode>("auto");
  const [s, setS] = useState<State>(initial);
  const [context, setContext] = useState(SCRIPTED_CONTEXT);
  const number = useRef(42);
  const set = (patch: Partial<State> | ((s: State) => Partial<State>)) => setS((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));

  useEffect(() => {
    if (reduced) setS(finished);
  }, [reduced]);

  async function moveTo(ref: RefObject<HTMLElement | null>, wait: (ms: number) => Promise<void>, ms = 750) {
    const el = ref.current;
    const st = stage.current;
    if (!el || !st) return;
    const { x, y } = offsetWithin(el, st);
    set({ cursor: { x: x + el.offsetWidth * 0.55, y: y + el.offsetHeight * 0.62, on: true } });
    await wait(ms);
  }

  async function click(wait: (ms: number) => Promise<void>) {
    set((p) => ({ clicks: p.clicks + 1 }));
    await wait(180);
  }

  async function type(field: "title" | "desc", text: string, wait: (ms: number) => Promise<void>) {
    for (let i = 1; i <= text.length; i++) {
      set({ [field]: text.slice(0, i) });
      await wait(text[i - 1] === " " ? 70 : 28 + Math.random() * 46);
    }
  }

  /** From Send onwards: the part of the story both modes share. */
  async function deliver(wait: (ms: number) => Promise<void>) {
    set({ sending: true });
    await wait(650);
    set((p) => ({ sending: false, sent: true, packet: p.packet + 1 }));
    await wait(700);
    set({ report: true });
    for (let i = 1; i <= 6; i++) {
      await wait(110);
      set({ chips: i });
    }
    for (let i = 0; i < 3; i++) {
      await wait(160);
      set((p) => ({ dests: p.dests.map((d, j) => (j === i ? "sending" : d)) }));
    }
    for (let i = 0; i < 3; i++) {
      await wait(i === 0 ? 520 : 360);
      set((p) => ({ dests: p.dests.map((d, j) => (j === i ? "done" : d)) }));
    }
  }

  async function reset(wait: (ms: number) => Promise<void>) {
    set({ fading: true });
    await wait(500);
    number.current += 1;
    setS((p) => ({ ...initial, packet: p.packet, clicks: p.clicks, cursor: { ...p.cursor, on: false } }));
    await wait(450);
  }

  useScene(
    visible && !reduced && mode === "auto",
    async (wait) => {
      setContext(SCRIPTED_CONTEXT);
      await wait(700);
      await moveTo(pay, wait, 900);
      await click(wait);
      set({ paying: true });
      await wait(1100);
      set({ paying: false });
      await wait(500);
      await moveTo(launcher, wait, 800);
      await click(wait);
      set({ panel: true });
      await wait(420);
      await moveTo(titleEl, wait, 520);
      await click(wait);
      await type("title", SCRIPT.title, wait);
      await wait(250);
      await moveTo(descEl, wait, 420);
      await click(wait);
      await type("desc", SCRIPT.desc, wait);
      await wait(200);
      await moveTo(shotEl, wait, 520);
      await click(wait);
      set({ shot: true });
      await wait(500);
      await moveTo(sendEl, wait, 520);
      await click(wait);
      await deliver(wait);
      set((p) => ({ cursor: { ...p.cursor, on: false } }));
      await wait(3400);
      await reset(wait);
    },
    [mode],
  );

  useScene(
    visible && mode === "userSend",
    async (wait) => {
      await deliver(wait);
      await wait(5200);
      await reset(wait);
      setMode("auto");
      await wait(60_000);
    },
    [mode],
  );

  const takeOver = () => {
    if (mode !== "auto" && !(mode === "userSend" && s.sent)) return;
    setMode("user");
    setContext(visitorContext());
    setS((p) => ({ ...initial, packet: p.packet, clicks: p.clicks, panel: true }));
    requestAnimationFrame(() => titleEl.current?.focus());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode !== "user" || !s.title.trim()) return;
    setMode("userSend");
  };

  const editable = mode === "user";
  const delivered = s.dests.filter((d) => d === "done").length;

  return (
    <div ref={root} className="demo" data-fading={s.fading || undefined}>
      {/* The product being reported on */}
      <div className="demo-browser">
        <div className="demo-chrome" aria-hidden>
          <span className="demo-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="demo-url">
            <span className="text-text-4">https://</span>acme.app/checkout
          </span>
        </div>
        <div ref={stage} className="demo-stage">
          <div className="demo-checkout" aria-hidden>
            <div className="demo-sk" style={{ width: 92 }} />
            <div className="demo-h">Checkout</div>
            <div className="demo-line">
              <span>Annual plan</span>
              <span className="tabular">£40.00</span>
            </div>
            <div className="demo-line">
              <span>VAT</span>
              <span className="tabular">£8.00</span>
            </div>
            <div className="demo-line demo-line--total">
              <span>Total</span>
              <span className="tabular">£48.00</span>
            </div>
            <div className="demo-card">
              <span className="demo-sk" style={{ width: 34, height: 10 }} />
              <span className="mono text-text-3">•••• 4242</span>
            </div>
            <button ref={pay} type="button" tabIndex={-1} className="demo-pay" data-busy={s.paying || undefined}>
              {s.paying ? <span className="spinner" /> : "Pay £48.00"}
            </button>
          </div>

          <button ref={launcher} type="button" className="demo-launcher" data-hidden={s.panel || undefined} onClick={takeOver} aria-label="Try the report widget">
            <BugMinimalisticIcon size={14} />
            Report a bug
          </button>

          {s.panel && (
            <form className="demo-panel" onSubmit={submit} onPointerDown={() => mode === "auto" && takeOver()}>
              {s.sent ? (
                <div className="demo-done">
                  <CheckCircleIcon size={26} />
                  <strong>Thanks, it's on its way</strong>
                  <p>Report #{number.current} reached the team.</p>
                </div>
              ) : (
                <>
                  <div className="demo-panel-head">
                    <span>Report a bug</span>
                    <CloseIcon size={14} className="text-text-3" />
                  </div>
                  <label className="demo-field">
                    <span>Title</span>
                    <input
                      ref={titleEl}
                      value={s.title}
                      readOnly={!editable}
                      maxLength={80}
                      placeholder={editable ? "What went wrong?" : ""}
                      onChange={(e) => set({ title: e.target.value })}
                      onFocus={() => mode === "auto" && takeOver()}
                    />
                  </label>
                  <label className="demo-field">
                    <span>
                      What happened <span className="text-text-4">optional</span>
                    </span>
                    <textarea ref={descEl} value={s.desc} readOnly={!editable} rows={2} maxLength={160} onChange={(e) => set({ desc: e.target.value })} />
                  </label>
                  <div className="demo-row">
                    <button ref={shotEl} type="button" className="demo-btn" tabIndex={editable ? 0 : -1} onClick={() => editable && set({ shot: true })}>
                      <CameraMinimalisticIcon size={13} />
                      Screenshot
                    </button>
                    <button type="button" className="demo-btn" tabIndex={-1}>
                      <PaperclipIcon size={13} />
                      Attach
                    </button>
                  </div>
                  {s.shot && (
                    <div className="demo-file">
                      <span className="demo-thumb" />
                      <span className="truncate">screenshot-2026-10-30.png</span>
                      <span className="text-text-4 tabular">182 KB</span>
                    </div>
                  )}
                  <div className="demo-foot">
                    <span>Page and browser details are included.</span>
                    <button ref={sendEl} type="submit" className="demo-send" disabled={editable && !s.title.trim()} tabIndex={editable ? 0 : -1}>
                      {s.sending ? <span className="spinner" /> : "Send"}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          <span className="demo-cursor" data-on={s.cursor.on || undefined} style={{ transform: `translate(${s.cursor.x}px, ${s.cursor.y}px)` }} aria-hidden>
            <span key={s.clicks} className="demo-ripple" data-go={s.clicks > 0 || undefined} />
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M1.5 1.5v15.2l4.1-3.9 2.7 6.1 2.6-1.1-2.6-6h5.9L1.5 1.5z" fill="var(--text)" stroke="var(--bg)" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>

      {/* The wire between them */}
      <div className="demo-wire" aria-hidden>
        <span className="demo-wire-line" />
        {s.packet > 0 && <span key={s.packet} className="demo-packet" />}
      </div>

      {/* Where it lands */}
      <div className="demo-side">
        <div className="demo-side-head">
          <span className="live-dot" />
          <span>Inbox</span>
          <span className="ml-auto text-text-4 tabular">{delivered ? `${delivered} of 3 delivered` : "Listening"}</span>
        </div>

        <div className="demo-list">
          <div className="demo-new" data-on={s.report || undefined}>
            <div className="demo-new-clip">
              <div className="demo-report" data-on={s.report || undefined}>
                <div className="flex items-center gap-2">
                  <span className="text-text-4 tabular mono">#{number.current}</span>
                  <span className="demo-report-title truncate">{s.title || SCRIPT.title}</span>
                </div>
                {s.desc && <p className="demo-report-desc">{s.desc}</p>}
                <div className="demo-chips">
                  {[...context, ...(s.shot ? ["1 screenshot"] : [])].map((c, i) => (
                    <span key={c + i} className="demo-chip" data-on={i < s.chips || undefined}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {EARLIER.map(([title, when], i) => (
            <div key={title} className="demo-older">
              <span className="mono tabular text-text-4">#{number.current - 1 - i}</span>
              <span className="truncate">{title}</span>
              <span className="demo-older-when">{when}</span>
            </div>
          ))}
        </div>

        <div className="demo-dests">
          <div className="demo-dests-title">Delivered to</div>
          {DESTS.map((d, i) => (
            <div key={d.provider} className="demo-dest" data-state={s.dests[i]}>
              <BrandIcon provider={d.provider} size={14} framed />
              <div className="min-w-0 flex-1">
                <div className="demo-dest-name">{d.name}</div>
                <div className="demo-dest-target mono">{d.target}</div>
              </div>
              <span className="demo-status">
                <i />
                {s.dests[i] === "done" ? d.result(number.current) : s.dests[i] === "sending" ? "Sending" : "Waiting"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="demo-hint" data-on={mode === "auto" || undefined}>
        Click the form to send your own.
      </p>
    </div>
  );
}
