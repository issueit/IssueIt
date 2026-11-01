import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { AltArrowRightIcon, CheckCircleIcon, ChecklistMinimalisticIcon } from "../../components/ui/icons";
import { usePageMeta } from "../../lib/meta";
import { Footer, Nav } from "../site/chrome";
import { company } from "../site/company";
import { AsciiField } from "../site/AsciiField";
import { articleBySlug, isLocale } from "./articles";
import { Elsewhere } from "./Support";
import { categoryTitle } from "./types";
import "../site/site.css";
import "./support.css";

/**
 * One support article. The frame around the words is deliberately
 * conventional: breadcrumb, what it applies to, when it was last checked,
 * the contents, the steps, and then whether it helped — because somebody
 * arriving from a search engine mid-problem shouldn't have to learn a new
 * layout first.
 */

export default function ArticlePage() {
  const { locale, slug } = useParams();
  if (!isLocale(locale)) return <Navigate to={`/articles/en/${slug ?? ""}`} replace />;
  const article = slug ? articleBySlug.get(slug) : undefined;
  if (!article) return <Missing slug={slug} />;
  return <Shown slug={article.slug} />;
}

function Shown({ slug }: { slug: string }) {
  const article = articleBySlug.get(slug)!;
  const body = useRef<HTMLDivElement>(null);
  const headings = useHeadings(body, slug);
  const related = (article.related ?? []).map((s) => articleBySlug.get(s)).filter((a): a is NonNullable<typeof a> => !!a);

  usePageMeta({
    title: `${article.title} - Issueit support`,
    description: article.summary,
    canonical: `${window.location.origin}/articles/en/${article.slug}`,
    markdown: `${window.location.origin}/articles/en/${article.slug}.md`,
  });
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  return (
    <Frame>
      <article className="kb-article">
        <nav className="kb-crumbs" aria-label="Breadcrumb">
          <Link to="/articles/en">Support</Link>
          <span aria-hidden>/</span>
          <span>{categoryTitle(article.category)}</span>
        </nav>

        <h1>{article.title}</h1>
        <p className="kb-summary">{article.summary}</p>

        <dl className="kb-applies">
          <div>
            <dt>Applies to</dt>
            <dd>{article.appliesTo.join(" · ")}</dd>
          </div>
          <div>
            <dt>Article</dt>
            <dd className="mono">{article.id}</dd>
          </div>
          <div>
            <dt>Last reviewed</dt>
            <dd>{article.updated}</dd>
          </div>
        </dl>

        {headings.length > 1 && (
          <nav className="kb-inthis" aria-label="In this article">
            <h2>
              <ChecklistMinimalisticIcon size={14} />
              In this article
            </h2>
            <ol>
              {headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div ref={body} className="kb-body">
          {article.body()}
        </div>

        <Helpful slug={article.slug} id={article.id} />

        {related.length > 0 && (
          <section className="kb-related" aria-label="Related articles">
            <h2>Related articles</h2>
            <ul>
              {related.map((a) => (
                <li key={a.slug}>
                  <Link to={`/articles/en/${a.slug}`}>
                    {a.title}
                    <AltArrowRightIcon size={12} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Elsewhere />
      </article>
    </Frame>
  );
}

function Missing({ slug }: { slug?: string }) {
  usePageMeta({ title: "Article not found - Issueit support" });
  return (
    <Frame>
      <article className="kb-article">
        <nav className="kb-crumbs" aria-label="Breadcrumb">
          <Link to="/articles/en">Support</Link>
        </nav>
        <h1>We can't find that article</h1>
        <p className="kb-summary">
          {slug ? (
            <>
              There's no article at <code className="kb-code">{slug}</code>. It may have been renamed when these pages were rewritten.
            </>
          ) : (
            "That address is incomplete."
          )}
        </p>
        <div className="kb-body">
          <p>
            Search from <Link to="/articles/en">the support home page</Link>, which lists every article by topic.
          </p>
        </div>
        <Elsewhere />
      </article>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="site site--page">
      <AsciiField />
      <Nav />
      <main>
        <div className="site-wrap kb-wrap">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

/**
 * "Was this helpful?" The answer is kept in this browser and nothing is sent
 * anywhere, because an article that promises to send feedback and doesn't
 * would be worse than one that asks for none. The no case offers the two
 * things that actually help.
 */
function Helpful({ slug, id }: { slug: string; id: string }) {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  useEffect(() => setAnswer(null), [slug]);

  if (answer === "yes") {
    return (
      <section className="kb-helpful" data-answered>
        <p>
          <CheckCircleIcon size={15} />
          Good. Thanks for saying so.
        </p>
      </section>
    );
  }

  if (answer === "no") {
    return (
      <section className="kb-helpful" data-answered>
        <p>Sorry. Two things that might get you further:</p>
        <ul>
          <li>
            <a href={`mailto:${company.email.support}?subject=${encodeURIComponent(`Article ${id}`)}`}>Write to us</a> and say what you expected to happen — quoting {id} tells us which page let you
            down.
          </li>
          <li>
            Search again from <Link to="/articles/en">the support home page</Link>, in the words you'd use rather than ours.
          </li>
        </ul>
      </section>
    );
  }

  return (
    <section className="kb-helpful">
      <p>Was this article helpful?</p>
      <div>
        <button type="button" className="btn btn--sm" onClick={() => setAnswer("yes")}>
          Yes
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setAnswer("no")}>
          No
        </button>
      </div>
    </section>
  );
}

type Heading = { id: string; text: string };

/** Read out of the rendered article, so the contents can't disagree with it. */
function useHeadings(root: React.RefObject<HTMLElement | null>, slug: string) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!el) return setHeadings([]);
    setHeadings(Array.from(el.querySelectorAll<HTMLElement>("h2[id]")).map((h) => ({ id: h.id, text: (h.textContent ?? "").trim() })));
  }, [root, slug]);
  return headings;
}
