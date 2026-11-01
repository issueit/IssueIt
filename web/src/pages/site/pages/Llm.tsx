import { useCallback, useState, type ComponentType, type CSSProperties } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BugMinimalisticIcon,
  ChartSquareIcon,
  DocumentsIcon,
  DocumentTextIcon,
  FileBracesIcon,
  FileCodeIcon,
  FileTextIcon,
  GlobalIcon,
  MagicWandIcon,
  PlugCircleIcon,
  PulseIcon,
  Routing2Icon,
} from "../../../components/ui/icons";
import { CopyButton } from "../../../components/ui/Copy";
import { DocsLink } from "../../../lib/docs-link";
import { useUrls, type Urls } from "../../../lib/urls";
import { LLM_DETAIL, LLM_ENDPOINTS, LLM_FILES, type LlmResource } from "../../../lib/llm";
import { SitePage } from "../chrome";
import { Arc } from "../home/Arc";
import "../home/home.css";

/**
 * /llm — the machine-readable half of the site, for whoever asks what is
 * here before fetching it. The documentation is published twice: as pages a
 * person reads, and as the Markdown behind them. This page is the index of
 * the second one, built from the same list the build writes into llms.txt,
 * so what it promises and what the server serves can't drift apart.
 *
 * It opens on an arc of every resource on that list, turning one at a time
 * and stopping on each to say what it is and where it lives. The page as it
 * was before this design is kept in ../legacy and served at /classic/llm.
 */

/** What the manifest reports about itself, which is also what this page counts. */
type Manifest = { generated: string; documentation: unknown[]; articles: unknown[] };

function useManifest() {
  return useQuery({
    queryKey: ["llm-manifest"],
    queryFn: async () => {
      const res = await fetch("/llm/index.json");
      if (!res.ok) throw new Error("manifest");
      return (await res.json()) as Manifest;
    },
    staleTime: Infinity,
    retry: false,
  });
}

/** A mark for each resource on the list; anything new gets the page glyph until it has one. */
const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  index: DocumentTextIcon,
  full: DocumentsIcon,
  page: FileTextIcon,
  manifest: FileBracesIcon,
  mcp: PlugCircleIcon,
  openapi: FileCodeIcon,
  intake: BugMinimalisticIcon,
  catalogue: Routing2Icon,
  plans: ChartSquareIcon,
  urls: GlobalIcon,
  health: PulseIcon,
};

const ALL = [...LLM_FILES, ...LLM_ENDPOINTS];
const ARC_ITEMS = ALL.map((r) => ({ id: r.id, label: r.title, icon: ICONS[r.id] ?? FileTextIcon }));

/** The resource the arc has stopped on: what it is, and the address to copy. */
function Focus({ resource, urls }: { resource: LlmResource; urls: Urls }) {
  const url = resource.url(urls);
  const sample = resource.example?.(urls);
  return (
    <div className="llx-focus" data-rv style={{ "--d": "180ms" } as CSSProperties}>
      <div className="llx-focus-text" key={resource.id}>
        <p>{resource.what}</p>
        {resource.post ? <code>{url}</code> : <a href={url}>{url}</a>}
      </div>
      <CopyButton text={sample ?? url} what={resource.title} />
    </div>
  );
}

function Resource({ resource, urls, index }: { resource: LlmResource; urls: Urls; index: number }) {
  const url = resource.url(urls);
  const sample = resource.example?.(urls);
  return (
    <article className="llm-res" data-rv style={{ "--d": `${(index % 2) * 70}ms` } as CSSProperties}>
      <header>
        <h3>{resource.title}</h3>
        <span className="llm-media mono">{resource.media}</span>
      </header>
      <p>{resource.what}</p>
      <div className="llm-addr">
        {resource.post ? <code className="mono">{url}</code> : <a href={url} className="mono">{url}</a>}
        <CopyButton text={sample ?? url} what={resource.title} />
      </div>
      {sample && <pre className="mono llm-sample">{sample}</pre>}
    </article>
  );
}

const READING = [
  [
    "Fetch it, don't remember it",
    "Everything here is public, unauthenticated and not rate limited for reading. Whatever you were trained on is older than this file, and the product moved.",
  ],
  ["Start narrow", "llms.txt is a page a line. Follow the one or two that answer the question; llms-full.txt is there for when you'd rather have all of it at once."],
  ["Quote and link", "Take what you need and point back at the page it came from. The .md and the page it mirrors are the same words, so either address is a fair citation."],
  ["Samples are real", "Addresses in the Markdown are this install's own, filled in when the file is served — so a snippet copied out of it runs against the right host."],
  ["Say when you're unsure", "If a page doesn't answer it, the support articles are written for the same questions from the other direction, and support@issueit.app is a person."],
  ["Doing, not reading", "To act rather than answer — read a report, fix it, resolve it — connect the MCP server instead. It carries the diagnostics a page can't."],
] as const;

export default function Llm() {
  const urls = useUrls();
  const manifest = useManifest();
  const [active, setActive] = useState(0);
  const select = useCallback((i: number) => setActive(i), []);
  const index = `${urls.marketing}/llms.txt`;
  const prompt = `Read ${index} and the pages it points to, then add Issueit bug reporting to this project.`;

  return (
    <SitePage title="For machines">
      <header className="llx-head site-wrap">
        <div className="fade-up">
          <Arc items={ARC_ITEMS} active={active} onSelect={select} label="Machine-readable resources" />
        </div>
        <p className="eyebrow fade-up" style={{ "--d": "60ms" } as CSSProperties}>
          <MagicWandIcon size={14} /> Machine-readable
        </p>
        <h1 className="llx-title fade-up" style={{ "--d": "120ms" } as CSSProperties}>
          The documentation, <span className="hx-quiet">written out for machines.</span>
        </h1>
        <p className="llx-lead fade-up" style={{ "--d": "200ms" } as CSSProperties}>
          Every documentation page and every support article is published twice: once as a page, once as the Markdown behind it.{" "}
          {manifest.data ? (
            <>
              Right now that's {manifest.data.documentation.length} pages and {manifest.data.articles.length} articles, rewritten on every deploy.
            </>
          ) : (
            <>Rewritten on every deploy, alongside a JSON manifest and a <Link to="/mcp">set of tools</Link> for an agent that would rather act than read.</>
          )}
        </p>
        <Focus resource={ALL[active]} urls={urls} />
        <div className="llx-dots" role="tablist" aria-label="Resources">
          {ALL.map((r, i) => (
            <button key={r.id} type="button" aria-label={r.title} aria-current={i === active} onClick={() => setActive(i)} />
          ))}
        </div>
        <div className="llm-start llx-start" data-rv style={{ "--d": "240ms" } as CSSProperties}>
          <div className="llm-prompt">
            <span className="mono">{prompt}</span>
            <CopyButton text={prompt} what="prompt" />
          </div>
        </div>
      </header>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              <DocumentTextIcon size={14} /> The files
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              The same prose, with nothing to render.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Not a summary of the documentation and not a second copy of it that rots — the pages themselves, rendered to Markdown from the same source the browser gets, every time Issueit is
              built.
            </p>
          </div>
          <div className="llm-grid">
            {LLM_FILES.map((resource, i) => (
              <Resource key={resource.id} resource={resource} urls={urls} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              <PlugCircleIcon size={14} /> The endpoints
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              And for when reading isn't the job.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Filing a bug takes one request and no account. Everything else — reading reports with their console errors, fixing them, resolving them, setting a project up — is an account token
              away, through the API or the <Link to="/mcp">MCP server</Link>.
            </p>
          </div>
          <div className="llm-grid">
            {LLM_ENDPOINTS.map((resource, i) => (
              <Resource key={resource.id} resource={resource} urls={urls} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              <GlobalIcon size={14} /> If you're reading this for somebody
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Six things worth knowing.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              {LLM_DETAIL}
            </p>
          </div>
          <ul className="plat-trust">
            {READING.map(([title, text], i) => (
              <li key={title} data-rv style={{ "--d": `${(i % 3) * 60}ms` } as CSSProperties}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="hero-ctas llm-ctas" data-rv>
            <DocsLink className="btn btn--primary site-btn site-btn--lg">Read the documentation</DocsLink>
            <Link to="/mcp" className="btn site-btn site-btn--lg site-btn--ghost">
              Connect an agent
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
