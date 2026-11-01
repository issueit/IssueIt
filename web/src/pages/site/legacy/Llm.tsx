import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { DocumentTextIcon, GlobalIcon, MagicWandIcon, PlugCircleIcon } from "../../../components/ui/icons";
import { CopyButton } from "../../../components/ui/Copy";
import { DocsLink } from "../../../lib/docs-link";
import { useUrls, type Urls } from "../../../lib/urls";
import { LLM_DETAIL, LLM_ENDPOINTS, LLM_FILES, type LlmResource } from "../../../lib/llm";
import { PageHead, SitePage } from "../chrome";

/**
 * /llm — the machine-readable half of the site, for whoever asks what is
 * here before fetching it. The documentation is published twice: as pages a
 * person reads, and as the Markdown behind them. This page is the index of
 * the second one, built from the same list the build writes into llms.txt,
 * so what it promises and what the server serves can't drift apart.
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

export default function ClassicLlm() {
  const urls = useUrls();
  const manifest = useManifest();
  const index = `${urls.marketing}/llms.txt`;
  const prompt = `Read ${index} and the pages it points to, then add Issueit bug reporting to this project.`;

  return (
    <SitePage title="For machines">
      <PageHead
        eyebrow="Machine-readable"
        title={
          <>
            The documentation,
            <br />
            <span className="text-text-3">written out for machines.</span>
          </>
        }
        lead={
          <>
            Every documentation page and every support article is published twice: once as a page, once as the Markdown behind it. There is an index in the llms.txt convention, the whole corpus in
            one file, a JSON manifest, and a <Link to="/mcp">set of tools</Link> for an agent that would rather act than read.
          </>
        }
      >
        <div className="llm-start" data-rv style={{ "--d": "240ms" } as CSSProperties}>
          <div className="llm-start-row">
            <MagicWandIcon size={15} />
            <a href={index} className="mono">
              {index}
            </a>
            <CopyButton text={index} what="address" />
          </div>
          <p>
            {manifest.data ? (
              <>
                {manifest.data.documentation.length} documentation pages and {manifest.data.articles.length} support articles, rewritten on every deploy. This copy was written {manifest.data.generated}.
              </>
            ) : (
              <>The index of everything below: every page and article, each with a line on what it covers and where its Markdown is.</>
            )}
          </p>
          <div className="llm-prompt">
            <span className="mono">{prompt}</span>
            <CopyButton text={prompt} what="prompt" />
          </div>
        </div>
      </PageHead>

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
