import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { AltArrowRightIcon, BookMinimalisticIcon, ChatRoundLineIcon, DocumentTextIcon, MagnifierIcon } from "../../components/ui/icons";
import { DocsLink } from "../../lib/docs-link";
import { usePageMeta } from "../../lib/meta";
import { PageHead, SitePage } from "../site/chrome";
import { company } from "../site/company";
import { articles, inCategory, isLocale, popular, searchArticles } from "./articles";
import { categories } from "./types";
import "./support.css";

/**
 * The support centre: /articles/en. Articles are browsed by what somebody is
 * trying to do, searched by whatever they'd type, and every address carries
 * its locale so a translation is a new folder rather than a new scheme.
 */

export default function Support() {
  const { locale } = useParams();
  if (!locale) return <Navigate to="/articles/en" replace />;
  if (!isLocale(locale)) return <Navigate to="/articles/en" replace />;
  return <Index />;
}

function Index() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchArticles(query), [query]);
  usePageMeta({
    title: "Issueit support",
    description: "Step-by-step help for collecting bug reports with Issueit: setting up a project, sending reports to your tracker, and fixing what isn't working.",
    canonical: `${window.location.origin}/articles/en`,
  });

  return (
    <SitePage title="Support">
      <PageHead
        eyebrow="Support"
        title={
          <>
            How can we help?
            <br />
            <span className="text-text-3">{articles.length} articles, written to be followed.</span>
          </>
        }
        lead="Each one covers a single job, with the steps in order. If you'd rather read about fields, headers and error codes, the developer documentation is the other half of this."
      >
        <div className="kb-find">
          <MagnifierIcon size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search support articles"
            aria-label="Search support articles"
            autoComplete="off"
            type="search"
          />
        </div>
      </PageHead>

      <div className="site-wrap kb-home">
        {query ? (
          <section className="kb-results" aria-label="Search results">
            <h2>
              {results.length} {results.length === 1 ? "article" : "articles"} for “{query}”
            </h2>
            {results.length ? (
              <ul className="kb-list">
                {results.map((a) => (
                  <li key={a.slug}>
                    <Link to={`/articles/en/${a.slug}`}>
                      <strong>{a.title}</strong>
                      <span>{a.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kb-empty">
                Nothing matches that. Try fewer words, or the name of what you're looking at — "widget", "GitHub", "password". The{" "}
                <DocsLink>developer documentation</DocsLink> covers fields, headers and error codes, and you can always{" "}
                <a href={`mailto:${company.email.support}`}>write to us</a>.
              </p>
            )}
          </section>
        ) : (
          <>
            <section aria-label="Popular articles">
              <h2 className="kb-section-title">Most read</h2>
              <ul className="kb-list kb-list--numbered">
                {popular.map((a) => (
                  <li key={a.slug}>
                    <Link to={`/articles/en/${a.slug}`}>
                      <strong>{a.title}</strong>
                      <span>{a.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="All topics">
              <h2 className="kb-section-title">Browse by topic</h2>
              <div className="kb-cats">
                {categories.map((c) => {
                  const list = inCategory(c.id);
                  if (!list.length) return null;
                  return (
                    <section key={c.id} className="kb-cat">
                      <h3>{c.title}</h3>
                      <p>{c.blurb}</p>
                      <ul>
                        {list.map((a) => (
                          <li key={a.slug}>
                            <Link to={`/articles/en/${a.slug}`}>
                              {a.title}
                              <AltArrowRightIcon size={12} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <Elsewhere />
      </div>
    </SitePage>
  );
}

/** The three other places an answer might be, named rather than hinted at. */
export function Elsewhere() {
  return (
    <section className="kb-elsewhere" aria-label="More help">
      <h2>Not here?</h2>
      <div>
        <DocsLink className="kb-else">
          <BookMinimalisticIcon size={17} />
          <strong>Developer documentation</strong>
          <span>Every field, header, limit and error code, with examples you can copy.</span>
        </DocsLink>
        <a href="/openapi.json" className="kb-else">
          <DocumentTextIcon size={17} />
          <strong>openapi.json</strong>
          <span>The management API described from the router itself, for generating a client.</span>
        </a>
        <a href={`mailto:${company.email.support}`} className="kb-else">
          <ChatRoundLineIcon size={17} />
          <strong>Write to us</strong>
          <span>
            {company.email.support} — quote the article number if you were reading one, and tell us what you expected to happen.
          </span>
        </a>
      </div>
    </section>
  );
}
