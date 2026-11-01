import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { Logo } from "../../components/app/Logo";
import { Segmented } from "../../components/ui/controls";
import { AltArrowLeftIcon, AltArrowRightIcon, CloseIcon, HamburgerMenuIcon, MonitorIcon, MoonIcon, SunIcon } from "../../components/ui/icons";
import { appHref, docsBase, docsHref, onDocsHost } from "../../lib/hosts";
import { usePageMeta } from "../../lib/meta";
import { useUrls } from "../../lib/urls";
import { setTheme, useAppearance, type ThemePref } from "../../lib/theme";
import { company } from "../site/company";
import { hostedNav } from "../../hosted";
import { groups, legacyAnchors, neighbours, pageBySlug } from "./nav";
import { pages } from "./pages";
import { SearchButton, SearchDialog, useSearchShortcut } from "./Search";
import "./docs.css";

/**
 * The documentation platform: a page registry, a sidebar, a contents list
 * read back out of the rendered page, and search. It answers at `/docs` on
 * the app's own host and at the root of the documentation subdomain, so the
 * one build serves both.
 */

export default function Docs() {
  const { pathname, hash } = useLocation();
  const slug = useMemo(() => {
    const path = docsBase && pathname.startsWith(docsBase) ? pathname.slice(docsBase.length) : pathname;
    const trimmed = path.replace(/\/+$/, "");
    return trimmed || "/";
  }, [pathname]);

  // Old links from the single-page documentation, and from /platform before
  // the reference moved here, pointed at anchors. Send them to the page that
  // now holds that material rather than to a page with no such heading.
  const legacy = slug === "/" && hash ? legacyAnchors[hash.slice(1)] : undefined;
  if (legacy) return <Navigate to={docsHref(legacy)} replace />;

  const meta = pageBySlug.get(slug);
  const Body = pages[slug];
  if (!meta || !Body) return <NotFound slug={slug} />;

  return <Page slug={slug} />;
}

function Page({ slug }: { slug: string }) {
  const meta = pageBySlug.get(slug)!;
  const Body = pages[slug];
  const group = groups.find((g) => g.pages.some((p) => p.slug === slug))!;
  const { previous, next } = neighbours(slug);
  const { hash } = useLocation();
  const article = useRef<HTMLDivElement>(null);
  const headings = useHeadings(article, slug);
  const active = useActiveHeading(headings);

  const docsUrl = useUrls().docs;
  usePageMeta({
    title: slug === "/" ? "Issueit documentation" : `${meta.title} · Issueit docs`,
    description: meta.summary,
    // One address per page, even on an install that answers at both /docs and
    // a documentation subdomain, so the two don't compete in a search index.
    canonical: `${docsUrl}${slug === "/" ? "" : slug}`,
    markdown: `${docsUrl}${slug === "/" ? "/index" : slug}.md`,
  });

  // The router keeps the previous scroll position between pages. Start at the
  // top, or at the heading the address bar asked for.
  useLayoutEffect(() => {
    const id = hash.slice(1);
    const target = id && document.getElementById(id);
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [slug, hash]);

  return (
    <Frame slug={slug}>
      <article className="dp-article">
        <nav className="dp-crumbs" aria-label="Breadcrumb">
          <Link to={docsHref("/")}>Documentation</Link>
          <span aria-hidden>/</span>
          <span>{group.title}</span>
        </nav>
        <h1>{meta.title}</h1>
        <p className="dp-lead">{meta.summary}</p>
        <div ref={article} className="dp-body">
          <Body />
        </div>

        <footer className="dp-foot">
          <nav className="dp-pager" aria-label="More pages">
            {previous ? (
              <Link to={docsHref(previous.slug)} className="dp-pager-link">
                <span>
                  <AltArrowLeftIcon size={13} /> Previous
                </span>
                <strong>{previous.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link to={docsHref(next.slug)} className="dp-pager-link" data-align="end">
                <span>
                  Next <AltArrowRightIcon size={13} />
                </span>
                <strong>{next.title}</strong>
              </Link>
            ) : (
              <span />
            )}
          </nav>
          <p className="dp-help">
            Something wrong or missing on this page? <a href={`mailto:${company.email.docs}?subject=${encodeURIComponent(`Docs: ${meta.title}`)}`}>Tell us</a>, or read the{" "}
            <AppLink to="/articles/en">support articles</AppLink> for the step-by-step version.
          </p>
        </footer>
      </article>

      {headings.length > 1 && (
        <nav className="dp-toc" aria-label="On this page">
          <h2>On this page</h2>
          <ul>
            {headings.map((h) => (
              <li key={h.id} data-level={h.level}>
                <a href={`#${h.id}`} aria-current={active === h.id ? "location" : undefined}>
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </Frame>
  );
}

function NotFound({ slug }: { slug: string }) {
  usePageMeta({ title: "Not found · Issueit docs" });
  return (
    <Frame slug={slug}>
      <article className="dp-article">
        <h1>No such page</h1>
        <p className="dp-lead">
          <code className="dp-code">{slug}</code> isn't part of the documentation. It may have moved when these pages were rebuilt.
        </p>
        <div className="dp-body">
          <p>
            Try <Link to={docsHref("/")}>the introduction</Link>, press <kbd>⌘K</kbd> to search, or pick a section from the list.
          </p>
          <div className="dp-cards">
            {groups.map((g) => (
              <Link key={g.title} to={docsHref(g.pages[0].slug)} className="dp-card">
                <strong>
                  {g.title}
                  <AltArrowRightIcon size={13} />
                </strong>
                <span>{g.blurb}</span>
              </Link>
            ))}
          </div>
        </div>
      </article>
    </Frame>
  );
}

/** Out of the documentation and into the app: a router link, unless that means leaving this host. */
function AppLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  if (onDocsHost) {
    return (
      <a href={appHref(to)} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

/* --------------------------------------------------------------- the frame */

const themes: Array<{ value: ThemePref; label: React.ReactNode }> = [
  { value: "system", label: <MonitorIcon size={13} /> },
  { value: "light", label: <SunIcon size={13} /> },
  { value: "dark", label: <MoonIcon size={13} /> },
];

function Frame({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const open = useCallback(() => setSearching(true), []);
  useSearchShortcut(open);
  const { theme } = useAppearance();

  // The mobile sidebar is a sheet; moving to another page closes it.
  useEffect(() => setMenu(false), [slug]);

  return (
    <div className="dp" data-menu={menu || undefined}>
      <header className="dp-top">
        <button type="button" className="dp-menu-btn" aria-label={menu ? "Hide the contents" : "Show the contents"} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          {menu ? <CloseIcon size={16} /> : <HamburgerMenuIcon size={16} />}
        </button>
        <a href={appHref("/")} className="dp-brand" aria-label="Issueit home">
          <Logo />
        </a>
        <Link to={docsHref("/")} className="dp-wordmark">
          Docs
        </Link>
        <div className="dp-top-right">
          <SearchButton onOpen={open} />
          <nav className="dp-top-links" aria-label="Elsewhere">
            <AppLink to="/platform">Platform</AppLink>
            <AppLink to="/articles/en">Support</AppLink>
            {hostedNav.map((link) => (
              <AppLink key={link.to} to={link.to}>
                {link.label}
              </AppLink>
            ))}
          </nav>
          <Segmented ariaLabel="Theme" value={theme} onChange={setTheme} options={themes} />
          <AppLink to="/inbox" className="btn btn--primary btn--sm">
            Dashboard
          </AppLink>
        </div>
      </header>

      <div className="dp-shell">
        <Sidebar slug={slug} />
        <main className="dp-main">{children}</main>
      </div>

      {menu && <button type="button" className="dp-scrim" aria-label="Hide the contents" onClick={() => setMenu(false)} />}
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </div>
  );
}

function Sidebar({ slug }: { slug: string }) {
  return (
    <nav className="dp-side" aria-label="Documentation">
      <div className="dp-side-inner">
        {groups.map((g) => (
          <section key={g.title}>
            <h2>{g.title}</h2>
            <ul>
              {g.pages.map((p) => (
                <li key={p.slug}>
                  <Link to={docsHref(p.slug)} aria-current={p.slug === slug ? "page" : undefined}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section>
          <h2>Elsewhere</h2>
          <ul>
            <li>
              <AppLink to="/articles/en">Support articles</AppLink>
            </li>
            <li>
              <a href="/openapi.json">openapi.json</a>
            </li>
            <li>
              <AppLink to="/platform">The platform</AppLink>
            </li>
          </ul>
        </section>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------- contents list */

type Heading = { id: string; text: string; level: 2 | 3 };

/** Read back out of the rendered page, so a page's contents can't disagree with it. */
function useHeadings(root: React.RefObject<HTMLElement | null>, slug: string) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!el) return setHeadings([]);
    const found = Array.from(el.querySelectorAll<HTMLElement>("h2[id], h3[id]")).map((h) => ({
      id: h.id,
      // The anchor link inside each heading is decoration; drop it.
      text: (h.textContent ?? "").replace(/^#/, "").trim(),
      level: h.tagName === "H3" ? (3 as const) : (2 as const),
    }));
    setHeadings(found);
  }, [root, slug]);
  return headings;
}

/** The last heading that has passed under the header. */
function useActiveHeading(headings: Heading[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!headings.length) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const els = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => !!el);
      let current = els[0]?.id ?? null;
      for (const el of els) {
        if (el.getBoundingClientRect().top > 120) break;
        current = el.id;
      }
      // At the very bottom the last headings may never reach the top; count them as read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = [...els].reverse().find((el) => el.getBoundingClientRect().top < window.innerHeight);
        if (last) current = last.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [headings]);
  return active;
}
