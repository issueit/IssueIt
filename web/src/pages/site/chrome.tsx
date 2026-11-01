import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../lib/session";
import { setTheme, useAppearance, type ThemePref } from "../../lib/theme";
import { AltArrowRightIcon, ArrowUpIcon, MonitorIcon, MoonIcon, SunIcon } from "../../components/ui/icons";
import { Segmented } from "../../components/ui/controls";
import { AsciiField } from "./AsciiField";
import { arriveAtHash, useReveal } from "./motion";
import { company } from "./company";
import { DocsLink } from "../../lib/docs-link";
import { hostedFootColumns, hostedNav, hostedProductLinks, hostedSupportLinks } from "../../hosted";
import "./site.css";

/** Shared frame for every public page: header, background, footer. */

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="site-mark">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M11 9.5h10M16 9.5v13M11 22.5h10" pathLength={1} stroke="var(--accent-fg)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The four-pointed star that means "this is for the model, not for you". */
function Spark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 2c.5 5 2.5 7.5 8 10-5.5 2.5-7.5 5-8 10-.5-5-2.5-7.5-8-10 5.5-2.5 7.5-5 8-10z" />
    </svg>
  );
}

/** Section links point at the landing page, so they work from any page. */
const sections = [
  ["intake", "Collect"],
  ["destinations", "Deliver"],
  ["reliability", "Reliability"],
  ["self-host", "Self-host"],
] as const;

export function Nav() {
  const me = useMe();
  const signedIn = !!me.data;
  const home = useLocation().pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="nav" data-scrolled={scrolled || undefined}>
      <div className="nav-inner">
        {home ? (
          <a href="#top" className="nav-brand" aria-label="Issueit, back to top">
            <Mark />
            Issueit
          </a>
        ) : (
          <Link to="/" className="nav-brand" aria-label="Issueit home">
            <Mark />
            Issueit
          </Link>
        )}
        <nav className="nav-links" aria-label="Sections">
          {sections.map(([id, label]) => (
            <a key={id} href={`${home ? "" : "/"}#${id}`}>
              {label}
            </a>
          ))}
          {hostedNav.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
          <Link to="/platform">Platform</Link>
          <Link to="/mcp">MCP</Link>
          <DocsLink>Docs</DocsLink>
          <Link to="/articles/en">Support</Link>
        </nav>
        <div className="nav-actions">
          {signedIn ? (
            <Link to="/inbox" className="btn btn--primary btn--sm site-btn">
              Open inbox
              <AltArrowRightIcon size={13} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn--quiet btn--sm">
                Sign in
              </Link>
              <Link to="/signup" className="btn btn--primary btn--sm site-btn">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export type FootLink = { label: string; to: string; note?: string; docs?: true };
export type FootColumn = { title: string; links: FootLink[] };

const columns: FootColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Widget and hosted form", to: "/#intake" },
      { label: "Destinations", to: "/#destinations", note: "134" },
      { label: "Retries and recovery", to: "/#reliability" },
      { label: "Self-hosting", to: "/#self-host" },
      { label: "The platform", to: "/platform" },
      { label: "MCP for agents", to: "/mcp" },
      { label: "Documentation", to: "/", docs: true },
      { label: "Sign in", to: "/login" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Quickstart", to: "/quickstart", docs: true },
      { label: "POST /v1/{project}/reports", to: "/reference/intake", docs: true },
      { label: "window.Issueit runtime", to: "/collect/widget-api", docs: true },
      { label: "Webhook events", to: "/reference/webhook-events", docs: true },
      { label: "Issueit-Signature (HMAC-SHA256)", to: "/deliver/signatures", docs: true },
      { label: "Outbox, retries and backoff", to: "/deliver/outbox", docs: true },
      { label: "MCP server for agents", to: "/automate/mcp", docs: true },
      { label: "Command line", to: "/automate/cli", docs: true },
      { label: "Rate limits", to: "/reference/limits", docs: true },
      { label: "Error codes", to: "/reference/errors", docs: true },
      { label: "Environment variables", to: "/reference/environment", docs: true },
      { label: "openapi.json", to: "/openapi.json" },
      { label: "llms.txt", to: "/llms.txt" },
      { label: "Docs for machines", to: "/llm" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Support articles", to: "/articles/en" },
      { label: "Add the report button", to: "/articles/en/add-the-bug-report-button-to-your-website" },
      { label: "Reports aren't arriving", to: "/articles/en/reports-are-not-reaching-your-issue-tracker" },
      { label: "Too many reports for one bug", to: "/articles/en/stop-getting-hundreds-of-reports-for-one-bug" },
      { label: "Run Issueit yourself", to: "/articles/en/install-issueit-on-your-own-server" },
    ],
  },
];

/** The product's own columns, plus the ones the hosted service brings with it. */
const footColumns: FootColumn[] = [
  ...columns.map((col) =>
    col.title === "Product"
      ? { ...col, links: [...col.links, ...hostedProductLinks] }
      : col.title === "Support"
        ? { ...col, links: [...col.links, ...hostedSupportLinks] }
        : col,
  ),
  ...hostedFootColumns,
];

function FootAnchor({ link }: { link: FootLink }) {
  const body = (
    <>
      {link.label}
      {link.note && <span className="foot-note tabular">{link.note}</span>}
    </>
  );
  if (link.docs) return <DocsLink to={link.to}>{body}</DocsLink>;
  // Landing-page sections, files and mail links are plain anchors; pages use the router.
  if (link.to.startsWith("mailto:") || link.to.startsWith("/#") || /\.[a-z]+$/.test(link.to)) return <a href={link.to}>{body}</a>;
  return <Link to={link.to}>{body}</Link>;
}

/** Reads the server's own health check, so the dot means something. */
function Status() {
  const health = useQuery({
    queryKey: ["site-health"],
    queryFn: async () => (await fetch("/health")).ok,
    refetchInterval: 60_000,
    retry: false,
  });
  const state = health.isPending ? "checking" : health.data ? "up" : "down";
  return (
    <a href="/health" className="foot-status" data-state={state}>
      <i aria-hidden />
      {state === "up" ? "All systems running" : state === "down" ? "Can't reach the service" : "Checking status"}
    </a>
  );
}

const themes: Array<{ value: ThemePref; label: ReactNode }> = [
  {
    value: "system",
    label: (
      <>
        <MonitorIcon size={13} />
        <span className="sr-only">System theme</span>
      </>
    ),
  },
  {
    value: "light",
    label: (
      <>
        <SunIcon size={13} />
        <span className="sr-only">Light theme</span>
      </>
    ),
  },
  {
    value: "dark",
    label: (
      <>
        <MoonIcon size={13} />
        <span className="sr-only">Dark theme</span>
      </>
    ),
  },
];

export function Footer() {
  const { theme } = useAppearance();
  return (
    <footer className="foot">
      <div className="site-wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <span className="nav-brand">
              <Mark size={20} />
              Issueit
            </span>
            <p>Capture a bug. Deliver it to the developer. Get out of the way.</p>
            <Status />
          </div>
          <nav className="foot-cols" aria-label="Footer">
            {footColumns.map((col) => (
              <div key={col.title} className="foot-col" data-col={col.title.toLowerCase()}>
                <h2>{col.title}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <FootAnchor link={l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="foot-word" aria-hidden data-rv>
          {"Issueit".split("").map((ch, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties}>
              {ch}
            </span>
          ))}
        </div>

        <div className="foot-agent">
          <Link to="/llm" className="foot-ai">
            <Spark />
            Hey AI, learn about us
          </Link>
          <button type="button" className="foot-up" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            Back to top
            <ArrowUpIcon size={14} />
          </button>
        </div>

        <div className="foot-base">
          <span>
            © 2026 {company.name}. <span className="foot-quiet">Reports are stored before they're delivered, and never lost to a failed delivery.</span>
          </span>
          <Segmented ariaLabel="Theme" value={theme} onChange={setTheme} options={themes} />
        </div>
      </div>
    </footer>
  );
}

/** A public page: same header, background and footer as the landing page. */
export function SitePage({ title, children }: { title: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useReveal(root);

  useEffect(() => {
    document.title = `${title} - Issueit`;
    return () => {
      document.title = "Issueit";
    };
  }, [title]);

  // The router keeps the old scroll position between pages; start at the top, or at the linked section.
  // Only on a new page: links within the page keep their smooth scroll.
  useLayoutEffect(() => arriveAtHash(), [pathname]);

  return (
    <div ref={root} className="site site--page">
      <AsciiField />
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

/** The opening of a page: a label, a headline and a sentence or two. */
export function PageHead({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head site-wrap">
      <p className="eyebrow fade-up">{eyebrow}</p>
      <h1 className="display display--sm fade-up" style={{ "--d": "80ms" } as CSSProperties}>
        {title}
      </h1>
      {lead && (
        <p className="lead fade-up" style={{ "--d": "160ms" } as CSSProperties}>
          {lead}
        </p>
      )}
      {children}
    </header>
  );
}
