import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useMe } from "../../lib/session";
import { DocsLink } from "../../lib/docs-link";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { AltArrowRightIcon, BugMinimalisticIcon, CodeIcon, PulseIcon, Routing2Icon, WidgetIcon } from "../../components/ui/icons";
import { AsciiField } from "./AsciiField";
import { Footer, Nav } from "./chrome";
import { Reliability } from "./Reliability";
import { Pipeline } from "./home/Pipeline";
import { ApiStream, ContextReplay, DeliveryFeed, DevCard, RoutingFlow, WidgetFlow } from "./home/DevCards";
import { Keys } from "./home/Keys";
import { arriveAtHash, useInView, useReducedMotion, useReveal } from "./motion";
import "./site.css";
import "./home/home.css";

/**
 * The landing page. The hero shows the one thing Issueit does: a bug goes
 * in from your product and comes out in your team's own tools, with
 * Issueit as the pipe between them rather than another place to check.
 * Below it each part of the job (collecting, delivering, keeping, hosting)
 * gets a picture that moves instead of a paragraph that explains. The page as it was before
 * this design is kept in ./legacy and served at /classic.
 */

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
  const tilt = useRef<HTMLDivElement>(null);

  // The product leans back at first and straightens as the page scrolls.
  useEffect(() => {
    const t = tilt.current;
    if (!t) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        t.style.setProperty("--t", Math.min(1, window.scrollY / 520).toFixed(3));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <section id="top" className="hx">
      <div className="site-wrap hx-copy">
        <h1 className="hx-title">
          <span className="display-line">
            <Rise delay={60}>Capture a bug.</Rise>
          </span>
          <span className="display-line">
            <Rise delay={220}>Deliver it to</Rise>
            <br className="br-sm" />
            <span className="rise" style={{ ["--d" as string]: "390ms" } as CSSProperties}>
              <span>
                <Rotator />.
              </span>
            </span>
          </span>
        </h1>
        <div className="hx-row fade-up" style={{ ["--d" as string]: "620ms" } as CSSProperties}>
          <p className="hx-lead">
            Issueit isn't a bug tracker. It takes the report from your users, adds the console errors and clicks that came before it, and hands it to the tool your team already
            uses. One script tag, 135 destinations.
          </p>
          <Link to="/mcp" className="hx-news">
            <span className="hx-news-dot" />
            <b>Agents can fix them now</b>
            <span>Issueit MCP</span>
            <AltArrowRightIcon size={12} />
          </Link>
        </div>
        <div className="hero-ctas hx-ctas fade-up" style={{ ["--d" as string]: "740ms" } as CSSProperties}>
          <Link to={signedIn ? "/inbox" : "/signup"} className="btn btn--primary site-btn site-btn--lg">
            {signedIn ? "Open inbox" : "Start collecting reports"}
            <AltArrowRightIcon size={14} />
          </Link>
          <DocsLink className="btn site-btn site-btn--lg site-btn--ghost">Read the docs</DocsLink>
        </div>
      </div>
      <div className="hx-stage fade-up" style={{ ["--d" as string]: "880ms" } as CSSProperties}>
        <div ref={tilt} className="hx-tilt">
          <Pipeline />
        </div>
      </div>
    </section>
  );
}

function Head({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead: ReactNode }) {
  return (
    <div className="hx-head">
      <p className="eyebrow" data-rv>
        {eyebrow}
      </p>
      <h2 className="hx-h2" data-rv style={{ ["--d" as string]: "60ms" } as CSSProperties}>
        {title}
      </h2>
      <p className="hx-sub" data-rv style={{ ["--d" as string]: "120ms" } as CSSProperties}>
        {lead}
      </p>
    </div>
  );
}

/** A row of the tools Issueit delivers to, drifting past. */
const BRANDS = [
  "github",
  "linear",
  "slack",
  "jira",
  "discord",
  "gitlab",
  "asana",
  "notion",
  "pagerduty",
  "trello",
  "clickup",
  "zendesk",
  "intercom",
  "telegram",
  "mattermost",
  "datadog",
  "hubspot",
  "airtable",
  "googlesheets",
  "bitbucket",
  "basecamp",
  "matrix",
  "grafana",
  "n8n",
];

function Brands() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useInView(ref, { margin: "0px" });
  return (
    <div ref={ref} className="hx-brands" data-live={live || undefined} data-rv>
      <div className="hx-brands-track" aria-hidden>
        {[0, 1].map((k) => (
          <div key={k} className="hx-brands-set">
            {BRANDS.map((b) => (
              <span key={b} className="hx-brand">
                <BrandIcon provider={b} size={22} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="hx-brands-note">
        <b>135 destinations</b> and your own webhook, connected with a sign-in, a token or a URL.
      </p>
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
    <div ref={ref} className="hx-term">
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
    <div ref={root} className="site site--hx">
      <AsciiField />
      <Nav />
      <main>
        <Hero signedIn={signedIn} />

        <section className="hx-sec" id="intake">
          <div className="site-wrap">
            <Head
              eyebrow="Collect"
              title={
                <>
                  Three ways in.
                  <br />
                  <span className="hx-quiet">One shape out.</span>
                </>
              }
              lead="Drop in the widget, share a hosted form or post from your own code. Reporters never need an account, and every report arrives with what happened before it."
            />
            <div className="dx-grid">
              <DevCard visual={<WidgetFlow />} icon={WidgetIcon} title="One script tag" docs="/collect/widget">
                A button in the corner and a short form. The page, the browser and a screenshot come along without anyone typing them.
              </DevCard>
              <DevCard visual={<ApiStream />} icon={CodeIcon} title="One request, no account" docs="/collect/intake-api" index={1}>
                POST a report from a server, a mobile app or a failing test. Press send above; that's the whole integration.
              </DevCard>
              <DevCard visual={<ContextReplay />} icon={BugMinimalisticIcon} title="The moments before it broke" docs="/collect/diagnostics" wide>
                Console errors, failed requests and the clicks that led up to the report, mapped to your own source and scrubbed of anything secret.
              </DevCard>
            </div>
          </div>
        </section>

        <section className="hx-sec" id="destinations">
          <div className="site-wrap">
            <Head
              eyebrow="Deliver"
              title={
                <>
                  Lands where your team
                  <br />
                  <span className="hx-quiet">already works.</span>
                </>
              }
              lead="Route by priority, source or environment, so a critical bug reaches the people on call and a typo waits for Monday."
            />
            <div className="dx-grid">
              <DevCard visual={<RoutingFlow />} icon={Routing2Icon} title="Rules, not inboxes" docs="/deliver/routing">
                Each destination takes the reports its rules match. One report can open an issue, post to chat and page somebody at once.
              </DevCard>
              <DevCard visual={<DeliveryFeed />} icon={PulseIcon} title="Every delivery, on the record" docs="/deliver/failures" index={1}>
                What went where, what it said back and what is still waiting. A tool that's down is a delay, not a lost bug.
              </DevCard>
            </div>
            <Brands />
          </div>
        </section>

        <Reliability />

        <section className="hx-sec hx-keys">
          <div className="site-wrap hx-keys-wrap">
            <div className="hx-keys-copy">
              <h2 data-rv>
                It isn't about another tool.
                <span> It's about never losing the bug somebody took the time to report.</span>
              </h2>
              <Link to={signedIn ? "/inbox" : "/signup"} className="btn btn--primary site-btn hx-keys-cta" data-rv style={{ ["--d" as string]: "100ms" } as CSSProperties}>
                {signedIn ? "Open inbox" : "Get started"}
                <AltArrowRightIcon size={13} />
              </Link>
              <p className="hx-keys-hint" data-rv style={{ ["--d" as string]: "160ms" } as CSSProperties}>
                Nothing new for your team to check.
              </p>
            </div>
            <Keys />
          </div>
        </section>

        <section className="hx-sec" id="self-host">
          <div className="site-wrap">
            <div className="hx-host" data-rv>
              <div className="hx-host-copy">
                <p className="eyebrow">Self-host</p>
                <h2 className="hx-h2">
                  Runs on your
                  <br />
                  <span className="hx-quiet">own server.</span>
                </h2>
                <p className="hx-sub">One container and PostgreSQL. Migrations run on start, and reports, files and credentials stay on hardware you control.</p>
                <ul className="hx-host-list">
                  <li>Integration credentials encrypted at rest</li>
                  <li>Split hosting for the dashboard, intake and widget</li>
                  <li>Token connections when you'd rather skip OAuth</li>
                </ul>
                <DocsLink to="/self-host/install" className="text-link">
                  Self-hosting guide
                  <AltArrowRightIcon size={13} />
                </DocsLink>
              </div>
              <Terminal />
            </div>
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
              <DocsLink className="btn site-btn site-btn--lg site-btn--ghost">Read the docs</DocsLink>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
