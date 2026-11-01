import type { CSSProperties } from "react";
import { Link, Navigate, useParams } from "react-router";
import { AltArrowLeftIcon, AltArrowRightIcon } from "../../../components/ui/icons";
import { PageHead, SitePage } from "../chrome";
import { Article } from "../prose";
import { posts } from "./posts";

export default function Blog() {
  const { slug } = useParams();
  if (slug) return <PostPage slug={slug} />;
  const [first, ...rest] = posts;

  return (
    <SitePage title="Blog">
      <PageHead
        eyebrow="Blog"
        title={
          <>
            Notes from the pipe
            <br />
            <span className="text-text-3">between users and developers.</span>
          </>
        }
        lead="How Issueit is built, what broke, and what we measured when we fixed it."
      />
      <section className="site-wrap blog">
        <Link to={`/blog/${first.slug}`} className="blog-lead" data-rv>
          <span className="blog-meta">
            <span className="blog-tag">{first.tag}</span>
            {first.date} · {first.minutes} min read
          </span>
          <h2>{first.title}</h2>
          <p>{first.summary}</p>
          <span className="blog-more">
            Read the post
            <AltArrowRightIcon size={13} />
          </span>
        </Link>
        <ul className="blog-list">
          {rest.map((p, i) => (
            <li key={p.slug} data-rv style={{ "--d": `${i * 70}ms` } as CSSProperties}>
              <Link to={`/blog/${p.slug}`}>
                <span className="blog-meta">
                  <span className="blog-tag">{p.tag}</span>
                  {p.date} · {p.minutes} min read
                </span>
                <h3>{p.title}</h3>
                <p>{p.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </SitePage>
  );
}

function PostPage({ slug }: { slug: string }) {
  const i = posts.findIndex((p) => p.slug === slug);
  if (i < 0) return <Navigate to="/blog" replace />;
  const post = posts[i];
  const newer = posts[i - 1];
  const older = posts[i + 1];

  return (
    <SitePage title={post.title}>
      <PageHead eyebrow={`Blog · ${post.tag}`} title={post.title} lead={post.summary}>
        <p className="blog-byline fade-up" style={{ "--d": "240ms" } as CSSProperties}>
          {post.date} · {post.minutes} min read · Issueit engineering
        </p>
      </PageHead>
      <Article key={post.slug}>{post.body()}</Article>
      <nav className="site-wrap blog-pager" aria-label="More posts">
        {older ? (
          <Link to={`/blog/${older.slug}`}>
            <span>
              <AltArrowLeftIcon size={13} /> Older
            </span>
            {older.title}
          </Link>
        ) : (
          <span />
        )}
        {newer ? (
          <Link to={`/blog/${newer.slug}`} data-align="end">
            <span>
              Newer <AltArrowRightIcon size={13} />
            </span>
            {newer.title}
          </Link>
        ) : (
          <Link to="/blog" data-align="end">
            <span>
              All posts <AltArrowRightIcon size={13} />
            </span>
            Back to the blog
          </Link>
        )}
      </nav>
    </SitePage>
  );
}
