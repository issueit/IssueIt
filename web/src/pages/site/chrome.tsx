import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../lib/session";
import { setTheme, useAppearance, type ThemePref } from "../../lib/theme";
import { AltArrowRightIcon, MonitorIcon, MoonIcon, SunIcon } from "../../components/ui/icons";
import { Segmented } from "../../components/ui/controls";
import { AsciiField } from "./AsciiField";
import { arriveAtHash, useReveal } from "./motion";
import { company } from "./company";
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
          <Link to="/platform">Platform</Link>
          <Link to="/docs">Docs</Link>
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

type FootLink = { label: string; to: string; note?: string };

const columns: Array<{ title: string; links: FootLink[] }> = [
  {
    title: "Product",
    links: [
      { label: "Widget and hosted form", to: "/#intake" },
      { label: "Destinations", to: "/#destinations", note: "134" },
      { label: "Retries and recovery", to: "/#reliability" },
      { label: "Self-hosting", to: "/#self-host" },
      { label: "Documentation", to: "/docs" },
      { label: "Sign in", to: "/login" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "POST /v1/{project}/reports", to: "/platform#ingest" },
      { label: "window.Issueit runtime", to: "/platform#widget" },
      { label: "Webhook events", to: "/platform#webhooks" },
      { label: "Issueit-Signature (HMAC-SHA256)", to: "/platform#signatures" },
      { label: "Outbox, retries and backoff", to: "/platform#delivery" },
      { label: "Egress and SSRF rules", to: "/platform#egress" },
      { label: "Rate limits", to: "/platform#limits" },
      { label: "Error codes", to: "/platform#errors" },
      { label: "Object id prefixes", to: "/platform#ids" },
      { label: "Signed attachment links", to: "/platform#attachments" },
      { label: "GET /api/catalogue", to: "/platform#catalogue" },
      { label: "Environment variables", to: "/platform#environment" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", to: "/about" },
      { label: "Blog", to: "/blog" },
      { label: "Work for us", to: "/careers" },
      { label: "Contact", to: `mailto:${company.email.hello}` },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", to: "/legal/terms" },
      { label: "Privacy policy", to: "/legal/privacy" },
      { label: "Cookie policy", to: "/legal/cookies" },
      { label: "Report a vulnerability", to: `mailto:${company.email.security}` },
    ],
  },
];

function FootAnchor({ link }: { link: FootLink }) {
  const body = (
    <>
      {link.label}
      {link.note && <span className="foot-note tabular">{link.note}</span>}
    </>
  );
  // Landing-page sections and mail links are plain anchors; pages use the router.
  if (link.to.startsWith("mailto:") || link.to.startsWith("/#")) return <a href={link.to}>{body}</a>;
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
            {columns.map((col) => (
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
