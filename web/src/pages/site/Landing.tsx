import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useMe } from "../../lib/session";
import { AltArrowRightIcon, CameraMinimalisticIcon, KeyMinimalistic2Icon, RefreshIcon, ShieldCheckIcon, SquareArrowRightUpIcon, UsersGroupRoundedIcon } from "../../components/ui/icons";
import { HeroDemo } from "./HeroDemo";
import { Intake } from "./Intake";
import { Routing } from "./Routing";
import { Reliability } from "./Reliability";
import { AsciiField } from "./AsciiField";
import { Footer, Nav } from "./chrome";
import { IntegrationWall } from "./IntegrationWall";
import { arriveAtHash, useInView, useReducedMotion, useReveal, useScrollProgress } from "./motion";
import "./site.css";

/* ------------------------------------------------------------------ pieces */

/** Splits a line into words that rise into place one after another. */
function Rise({ children, delay = 0, step = 55 }: { children: string; delay?: number; step?: number }) {
  return (
    <>
      {children.split(" ").map((w, i) => (
        <Fragment key={i}>
          <span className="rise" style={{ ["--d" as string]: `${delay + i * step}ms` } as CSSProperties}>
            <span>{w}</span>
          </span>{" "}
        </Fragment>
      ))}
    </>
  );
}

const ROTATE = ["GitHub", "Linear", "Slack", "Jira", "Teams", "Asana", "Zendesk", "PagerDuty", "Notion", "Telegram", "GitLab", "Discord", "Trello", "your webhook"];

/** The destination in the headline, rolling through every one Issueit supports. */
function Rotator() {
  const reduced = useReducedMotion();
  const [{ cur, prev }, setPair] = useState({ cur: 0, prev: -1 });
  const [width, setWidth] = useState<number>();
  const measure = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setPair((p) => ({ cur: (p.cur + 1) % ROTATE.length, prev: p.cur })), 2400);
    return () => clearInterval(t);
  }, [reduced]);

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    document.fonts?.ready.then(update);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [cur]);

  return (
    <span className="rotator" style={{ width }}>
      <span ref={measure} className="rotator-measure" aria-hidden>
        {ROTATE[cur]}
      </span>
      {prev >= 0 && (
        <span key={`out-${prev}`} className="rotator-word rotator-word--out" aria-hidden>
          {ROTATE[prev]}
        </span>
      )}
      <span key={cur} className="rotator-word" data-first={prev < 0 || undefined} aria-hidden>
        {ROTATE[cur]}
      </span>
      <span className="sr-only">your tools</span>
    </span>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLSpanElement>(null);

  // Tilt flattens over the first stretch of scroll; spotlight follows the pointer.
  useEffect(() => {
    const el = ref.current;
    const t = tilt.current;
    if (!el || !t) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        t.style.setProperty("--t", Math.min(1, window.scrollY / 420).toFixed(3));
      });
    };
    // Moves the glow itself, so the browser shifts a layer rather than repainting the hero.
    const onMove = (e: PointerEvent) => {
      const g = glow.current;
      if (!g) return;
      const r = el.getBoundingClientRect();
      g.style.transform = `translate3d(${(e.clientX - r.left - r.width * 0.5).toFixed(0)}px, ${(e.clientY - r.top - r.height * 0.18).toFixed(0)}px, 0)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <section ref={ref} id="top" className="hero">
      <div className="hero-glow" aria-hidden>
        <span ref={glow} />
      </div>
      <div className="site-wrap hero-copy">
        <a href="#reliability" className="hero-pill" style={{ ["--d" as string]: "0ms" } as CSSProperties}>
          <span className="live-dot" />
          Stored first, delivered with retries
          <AltArrowRightIcon size={12} />
        </a>
        <h1 className="display">
          <span className="display-line">
            <Rise delay={80}>Capture a bug.</Rise>
          </span>
          <span className="display-line">
            <Rise delay={260}>Deliver it to</Rise>
            <br className="br-sm" />
            <span className="rise" style={{ ["--d" as string]: "430ms" } as CSSProperties}>
              <span>
                <Rotator />.
              </span>
            </span>
          </span>
          <span className="display-line display-line--quiet">
            <Rise delay={520}>Get out of the way.</Rise>
          </span>
        </h1>
        <p className="hero-lead fade-up" style={{ ["--d" as string]: "760ms" } as CSSProperties}>
          Issueit collects bug reports from a widget, a hosted form or the REST API, adds the context a developer needs, and files them where your team already works. It isn't another tracker to
          check.
        </p>
        <div className="hero-ctas fade-up" style={{ ["--d" as string]: "880ms" } as CSSProperties}>
          {signedIn ? (
            <Link to="/inbox" className="btn btn--primary site-btn site-btn--lg">
              Open inbox
              <AltArrowRightIcon size={14} />
            </Link>
          ) : (
            <Link to="/signup" className="btn btn--primary site-btn site-btn--lg">
              Start collecting reports
              <AltArrowRightIcon size={14} />
            </Link>
          )}
          <Link to="/docs" className="btn site-btn site-btn--lg site-btn--ghost">
            Read the docs
          </Link>
        </div>
      </div>
      <div className="hero-stage fade-up" style={{ ["--d" as string]: "1000ms" } as CSSProperties}>
        <div ref={tilt} className="hero-tilt">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead: ReactNode }) {
  return (
    <div className="sec-head">
      <p className="eyebrow" data-rv>
        {eyebrow}
      </p>
      <h2 className="h2" data-rv style={{ ["--d" as string]: "60ms" } as CSSProperties}>
        {title}
      </h2>
      <p className="lead" data-rv style={{ ["--d" as string]: "120ms" } as CSSProperties}>
        {lead}
      </p>
    </div>
  );
}

const MANIFESTO =
  "Most bug tools want to become the place your team lives. Issueit doesn't. It takes the report, adds the context a developer needs, hands it to the tools you already use, and then gets out of the way.";

/** Words brighten as the paragraph scrolls through the middle of the screen. */
function Manifesto() {
  const ref = useRef<HTMLElement>(null);
  useScrollProgress(ref);
  const words = MANIFESTO.split(" ");
  return (
    <section ref={ref} className="manifesto">
      <div className="site-wrap">
        <p className="manifesto-text" aria-label={MANIFESTO}>
          {words.map((w, i) => (
            <span
              key={i}
              aria-hidden
              style={
                {
                  ["--i" as string]: (i / words.length).toFixed(4),
                } as CSSProperties
              }
            >
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

const DETAILS = [
  {
    icon: CameraMinimalisticIcon,
    title: "Context, captured",
    text: "Page, browser, viewport, screen and language arrive with every report, along with screenshots and files.",
    sample: "Safari 18 · macOS · 1440×900 · en-GB",
  },
  {
    icon: RefreshIcon,
    title: "A live inbox",
    text: "New reports and delivery results appear as they happen, over server-sent events. Nothing polls.",
    sample: "● Listening · 3 delivered",
  },
  {
    icon: KeyMinimalistic2Icon,
    title: "Keys that know their place",
    text: "The project id is public. Secret keys are for servers, and Issueit refuses them from a browser.",
    sample: "sk_live_••••••••••••3f9a",
  },
  {
    icon: ShieldCheckIcon,
    title: "Signed webhooks",
    text: "Every webhook carries a timestamped HMAC signature, so you can trust what arrives and reject replays.",
    sample: "Issueit-Signature: t=1793…,v1=9c1f…",
  },
  {
    icon: SquareArrowRightUpIcon,
    title: "Built to take abuse",
    text: "Rate limits per address, project and key. Attachments are checked by their bytes, not their names.",
    sample: "429 · Try again in 42 seconds",
  },
  {
    icon: UsersGroupRoundedIcon,
    title: "For the whole team",
    text: "Organisations, invitations and roles, with each project's usage and storage in one place.",
    sample: "4 members · 3 projects · 1,204 reports",
  },
];

function Details() {
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div className="detail-grid">
      {DETAILS.map((d, i) => (
        <article key={d.title} className="detail" data-rv style={{ ["--d" as string]: `${(i % 3) * 80}ms` } as CSSProperties} onPointerMove={onMove}>
          <d.icon size={18} className="detail-icon" />
          <h3>{d.title}</h3>
          <p>{d.text}</p>
          <span className="detail-sample mono">{d.sample}</span>
        </article>
      ))}
    </div>
  );
}

const TERMINAL: Array<[kind: "cmd" | "out" | "ok", text: string]> = [
  ["cmd", "cp .env.example .env"],
  ["cmd", "docker compose up -d --build"],
  ["ok", "Container issueit-db-1   Healthy"],
  ["ok", "Container issueit-app-1  Started"],
  ["cmd", "curl -s localhost:8380/health"],
  ["out", '{"ok":true}'],
];
const TERMINAL_TEXT = TERMINAL.map(([, t]) => t).join("\n");

/** Commands type out; their output appears whole, the way a real terminal does it. */
function Terminal() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -25% 0px" });
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) return setLine(TERMINAL.length);
    let l = 0;
    let c = 0;
    let t = 0;
    const tick = () => {
      if (l >= TERMINAL.length) return;
      const [kind, text] = TERMINAL[l];
      if (kind === "cmd" && c < text.length) {
        c += 1;
        setChars(c);
        t = window.setTimeout(tick, 26 + Math.random() * 48);
        return;
      }
      l += 1;
      c = 0;
      setLine(l);
      setChars(0);
      const next = TERMINAL[l]?.[0];
      t = window.setTimeout(tick, kind === "cmd" ? (next === "cmd" ? 420 : 900) : next === "cmd" ? 600 : 240);
    };
    t = window.setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [inView, reduced]);

  const current = TERMINAL[line];
  return (
    <div ref={ref} className="term" data-rv>
      <div className="intake-file">
        <span className="demo-lights" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="mono">~/issueit</span>
      </div>
      <pre className="mono" aria-label={TERMINAL_TEXT}>
        {TERMINAL.slice(0, line).map(([kind, text], i) => (
          <div key={i} className={`term-line term-line--${kind}`} aria-hidden>
            {kind === "cmd" && <span className="term-prompt">$</span>}
            {kind === "ok" && <span className="term-ok">✔</span>}
            {text}
          </div>
        ))}
        {(!current || current[0] === "cmd") && (
          <div className="term-line" aria-hidden>
            <span className="term-prompt">$</span>
            {current?.[1].slice(0, chars)}
            <span className="caret" data-done={!current || chars === 0 || undefined} />
          </div>
        )}
      </pre>
    </div>
  );
}

const MARQUEE = [
  ["critical", "Checkout spinner never stops"],
  ["high", "Dark mode flashes white on load"],
  ["medium", "Export ignores the date filter"],
  ["low", "Tooltip clipped on small screens"],
  ["high", "Password reset link expired instantly"],
  ["medium", "Avatar upload rotates photos"],
  ["low", "Typo on the pricing page"],
  ["critical", "Webhook signature mismatch after deploy"],
  ["medium", "Search loses focus after typing"],
  ["high", "Invoice PDF missing VAT number"],
] as const;

function Marquee({ reverse }: { reverse?: boolean }) {
  const items = reverse ? [...MARQUEE].reverse() : MARQUEE;
  return (
    <div className="marquee" data-reverse={reverse || undefined} aria-hidden>
      <div className="marquee-track">
        {[0, 1].map((k) => (
          <div key={k} className="marquee-set">
            {items.map(([p, t]) => (
              <span key={t} className="marquee-item" data-p={p}>
                <i />
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const me = useMe();
  const signedIn = !!me.data;
  useReveal(root);

  // Arriving from another page at /#section: the browser looked for it before it existed.
  useLayoutEffect(() => arriveAtHash(), []);

  useEffect(() => {
    document.title = "Issueit - capture a bug, deliver it, get out of the way";
    return () => {
      document.title = "Issueit";
    };
  }, []);

  return (
    <div ref={root} className="site">
      <AsciiField />
      <Nav />
      <main>
        <Hero signedIn={signedIn} />

        <section className="sec" id="intake">
          <div className="site-wrap">
            <SectionHead
              eyebrow="Collect"
              title={
                <>
                  Three ways in.
                  <br />
                  One shape out.
                </>
              }
              lead="Drop in the widget, share a hosted form or post from your own code. Reporters never need an account, and every report arrives in the same shape."
            />
            <Intake />
          </div>
        </section>

        <section className="sec" id="destinations">
          <div className="site-wrap">
            <SectionHead
              eyebrow="Deliver"
              title={
                <>
                  Lands where your team
                  <br />
                  already works.
                </>
              }
              lead="More than 130 destinations, connected with a sign-in, a token or a webhook URL. Route by priority, source or environment, so a critical bug reaches the right people first."
            />
            <Routing />
            <IntegrationWall />
          </div>
        </section>

        <Reliability />

        <Manifesto />

        <section className="sec">
          <div className="site-wrap">
            <SectionHead eyebrow="Details" title="The small things, done properly." lead="The parts nobody demos, and everybody notices when they're missing." />
            <Details />
          </div>
        </section>

        <section className="sec" id="self-host">
          <div className="site-wrap selfhost">
            <div className="selfhost-copy">
              <p className="eyebrow" data-rv>
                Self-host
              </p>
              <h2 className="h2" data-rv>
                Runs on your
                <br />
                own server.
              </h2>
              <p className="lead" data-rv>
                One container and PostgreSQL. Migrations run on start, and reports, files and credentials stay on hardware you control.
              </p>
              <ul className="selfhost-list" data-rv>
                <li>Integration credentials encrypted at rest</li>
                <li>Split hosting for the dashboard, intake and widget</li>
                <li>Token connections when you'd rather skip OAuth</li>
              </ul>
              <Link to="/docs#self-hosting" className="text-link" data-rv>
                Self-hosting guide
                <AltArrowRightIcon size={13} />
              </Link>
            </div>
            <Terminal />
          </div>
        </section>

        <section className="closing">
          <Marquee />
          <Marquee reverse />
          <div className="site-wrap closing-copy">
            <h2 className="display display--sm" data-rv>
              Your users found the bug.
              <br />
              <span className="text-text-3">Let them tell you.</span>
            </h2>
            <div className="hero-ctas" data-rv style={{ ["--d" as string]: "120ms" } as CSSProperties}>
              <Link to={signedIn ? "/inbox" : "/signup"} className="btn btn--primary site-btn site-btn--lg">
                {signedIn ? "Open inbox" : "Create your first project"}
                <AltArrowRightIcon size={14} />
              </Link>
              <Link to="/docs" className="btn site-btn site-btn--lg site-btn--ghost">
                Read the docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
