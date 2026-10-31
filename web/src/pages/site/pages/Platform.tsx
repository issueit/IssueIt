import type { CSSProperties } from "react";
import { Link } from "react-router";
import {
  BoltIcon,
  Code2Icon,
  DatabaseIcon,
  KeyMinimalistic2Icon,
  LayersIcon,
  MagicWandIcon,
  Routing2Icon,
  ServerIcon,
  ShieldCheckIcon,
  StopwatchIcon,
  WidgetIcon,
} from "../../../components/ui/icons";
import { DocsLink } from "../../../lib/docs-link";
import { PageHead, SitePage } from "../chrome";

/**
 * What the Issueit platform is: the surfaces reports come in through, the
 * engine that delivers them, and the things you can build on top. The exact
 * contract — fields, headers, limits, error codes — moved to the developer
 * documentation, which this page links into rather than repeats.
 */

const STAGES = [
  { label: "Collect", text: "A widget, a hosted form or one HTTP request. Reporters never need an account." },
  { label: "Clean", text: "Attachment types sniffed from the bytes. Emails, tokens and card numbers scrubbed twice." },
  { label: "Group", text: "A fingerprint decides whether this is a new bug or the four hundredth report of an open one." },
  { label: "Store", text: "The report is written down before anything else happens to it. Now it can't be lost." },
  { label: "Deliver", text: "One queued row per destination, retried for about ten hours. A tracker being down costs you nothing." },
  { label: "Close", text: "Issueit notices the issue was closed, resolves the report, and tells whoever asked." },
];

const SURFACES = [
  {
    icon: WidgetIcon,
    title: "The widget",
    text: "One script tag, no dependencies, no cookies. It attaches the page, the browser, a screenshot and the errors from the moments before.",
    sample: "<script src=\"…/widget.js\" data-project=\"prj_…\">",
    to: "/collect/widget",
  },
  {
    icon: LayersIcon,
    title: "The hosted form",
    text: "A public page per project. For support replies, testers, native apps, a QR code on a kiosk — anywhere you can't add a script.",
    sample: "drop.issueit.app/r/prj_abc123",
    to: "/collect/form",
  },
  {
    icon: Code2Icon,
    title: "The intake API",
    text: "One POST with a JSON body. Servers, mobile apps, failing tests, CI jobs. Idempotency keys and dry runs included.",
    sample: "POST /v1/{project}/reports → 201",
    to: "/collect/intake-api",
  },
];

const ENGINE = [
  {
    icon: DatabaseIcon,
    title: "An outbox, not a queue",
    text: "One row per destination in PostgreSQL, written in the same transaction as the report. There is no broker to run and nothing to disagree with the data.",
    sample: "FOR UPDATE SKIP LOCKED · batches of 10",
  },
  {
    icon: StopwatchIcon,
    title: "Retries that mean something",
    text: "Eight attempts over about ten hours and three quarters. Credential failures stop immediately and say why, instead of waiting out the ladder.",
    sample: "30s · 2m · 10m · 30m · 1h · 3h · 6h",
  },
  {
    icon: Routing2Icon,
    title: "Routing per destination",
    text: "Filter by priority, source or environment. On-call hears about the critical ones; the tracker gets everything; the shared channel gets less of each report.",
    sample: "critical + production → PagerDuty",
  },
  {
    icon: MagicWandIcon,
    title: "Grouping that holds",
    text: "A normalised title and page, or your own fingerprint. One broken page becomes one issue with a comment as the group grows.",
    sample: "#118 · and 46 others",
  },
  {
    icon: BoltIcon,
    title: "Source maps, read late",
    text: "Minified stacks are resolved when somebody opens the report, not when it arrives — so maps uploaded after the crash still help.",
    sample: "at submitOrder (src/checkout/submit.ts:41)",
  },
  {
    icon: ShieldCheckIcon,
    title: "Signed, guarded egress",
    text: "Every webhook carries a timestamped HMAC. Addresses you type are checked before connecting, resolved once and pinned, and redirects are never followed.",
    sample: "Issueit-Signature: t=1793…,v1=9c1f…",
  },
];

const BUILD = [
  { title: "Management API", text: "Everything the dashboard does, described at /openapi.json from the router itself.", to: "/automate/management-api" },
  { title: "MCP for agents", text: "Twenty-one tools over the same API, so a coding agent can read a bug, fix it and resolve it.", to: "/automate/mcp" },
  { title: "Command line", text: "Watch reports arrive, forward webhooks to your laptop, upload source maps, fail CI when delivery is behind.", to: "/automate/cli" },
  { title: "Config as code", text: "A project's settings as a file with no ids in it, reviewed in a pull request and applied to staging and production.", to: "/automate/config" },
  { title: "Webhooks", text: "The whole report as signed JSON, with a frozen body so a retry is byte-identical.", to: "/deliver/webhooks" },
  { title: "SDKs", text: "@issueit/node for servers and @issueit/react for an error boundary that files the bug.", to: "/collect/sdks" },
];

const TRUST = [
  ["Keys that know their place", <>The project id is public and can only create a report. Secret keys are refused from a browser. Account tokens carry scopes and never exceed their owner's role.</>],
  ["Narrow by design", "Typed values, request bodies, headers and cookies are never recorded. Query string values are replaced with their names."],
  ["Scrubbed twice", "In the browser before anything is held in memory, and again on the server — so a pattern added later protects what arrives next."],
  ["Deleted on a schedule", "Screenshots and recordings go when retention says; the report keeps its title, page and status."],
  ["Everything recorded", "Every state-changing request, by a person or a token, is in the audit log: who, what, which token, from where."],
  ["Yours to run", "One container and PostgreSQL. The self-hosted edition is AGPL, with every feature on and your own limits."],
] as const;

export default function Platform() {
  return (
    <SitePage title="Platform">
      <PageHead
        eyebrow="Platform"
        title={
          <>
            One pipeline between
            <br />
            <span className="text-text-3">your users and your code.</span>
          </>
        }
        lead={
          <>
            Issueit collects bug reports, adds the context that makes them fixable, and delivers them to the tools you already use — reliably enough that you can stop thinking about it. This is what
            the platform is made of. For fields, headers and error codes, read the <DocsLink>developer documentation</DocsLink>.
          </>
        }
      />

      <div className="site-wrap">
        <ol className="plat-flow">
          {STAGES.map((s, i) => (
            <li key={s.label} data-rv style={{ "--d": `${i * 60}ms` } as CSSProperties}>
              <span className="plat-flow-step mono">{String(i + 1).padStart(2, "0")}</span>
              <strong>{s.label}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Collect
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Three ways in, one shape out.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Whichever surface a report arrives through, it carries the same fields and follows the same rules — so routing, grouping and delivery don't care where it came from.
            </p>
          </div>
          <div className="detail-grid">
            {SURFACES.map((s, i) => (
              <article key={s.title} className="detail" data-rv style={{ "--d": `${i * 80}ms` } as CSSProperties}>
                <s.icon size={18} className="detail-icon" />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <DocsLink to={s.to} className="plat-link">
                  Read the documentation
                </DocsLink>
                <span className="detail-sample mono">{s.sample}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Deliver
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              The part that has to be boring.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Over 130 destinations — trackers, chat, help desks, on-call, email, spreadsheets, queues, your own endpoint — behind one engine that never loses a report to somebody else's bad
              afternoon.
            </p>
          </div>
          <div className="detail-grid">
            {ENGINE.map((d, i) => (
              <article key={d.title} className="detail" data-rv style={{ "--d": `${(i % 3) * 80}ms` } as CSSProperties}>
                <d.icon size={18} className="detail-icon" />
                <h3>{d.title}</h3>
                <p>{d.text}</p>
                <span className="detail-sample mono">{d.sample}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Build on it
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Everything the dashboard can do, you can do.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              There is no second, lesser public API. The dashboard, the command line, the MCP server and your own scripts all go through the same endpoints, with the same scope rules.
            </p>
          </div>
          <ul className="plat-build">
            {BUILD.map((b, i) => (
              <li key={b.title} data-rv style={{ "--d": `${(i % 3) * 70}ms` } as CSSProperties}>
                <DocsLink to={b.to}>
                  <strong>{b.title}</strong>
                  <span>{b.text}</span>
                </DocsLink>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Trust
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              A bug report is somebody's data.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              It arrives with a screenshot of their screen and a list of what their browser just did. The design decisions that follow from that aren't optional extras.
            </p>
          </div>
          <ul className="plat-trust">
            {TRUST.map(([title, text], i) => (
              <li key={title} data-rv style={{ "--d": `${(i % 3) * 60}ms` } as CSSProperties}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Run it
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Hosted, or entirely yours.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              The same codebase both ways. One variable decides whether plans exist; nothing is held back from the edition you run yourself except the token-based integration catalogue.
            </p>
          </div>
          <div className="plat-editions">
            <article data-rv>
              <h3>
                <ServerIcon size={17} />
                Self-hosted
              </h3>
              <p>One container and PostgreSQL. Every feature on, limits from your own environment, retention you decide, AGPL-3.0.</p>
              <DocsLink to="/self-host/install" className="plat-link">
                How to install it
              </DocsLink>
            </article>
            <article data-rv style={{ "--d": "80ms" } as CSSProperties}>
              <h3>
                <KeyMinimalistic2Icon size={17} />
                Hosted
              </h3>
              <p>We run it, back it up and keep it current. Plans by monthly report allowance, with a trial that doesn't ask for a card.</p>
              <Link to="/pricing" className="plat-link">
                See the plans
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap plat-next">
          <h2 className="h2" data-rv>
            Read the rest properly.
          </h2>
          <div className="plat-next-links" data-rv style={{ "--d": "80ms" } as CSSProperties}>
            <DocsLink to="/quickstart" className="btn btn--primary site-btn">
              Quickstart
            </DocsLink>
            <DocsLink to="/how-it-works" className="btn">
              How Issueit works
            </DocsLink>
            <DocsLink to="/reference/intake" className="btn">
              API reference
            </DocsLink>
            <Link to="/articles/en" className="btn btn--quiet">
              Support articles
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
