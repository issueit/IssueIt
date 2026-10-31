import type { ReactNode } from "react";
import { Link } from "react-router";
import { CodeBlock } from "../components/ui/Copy";
import { Logo } from "../components/app/Logo";
import { BrandIcon } from "../components/ui/BrandIcon";
import { categoryLabels, useCatalogue } from "../features/integrations/categories";
import type { ProviderCategory } from "../lib/types";

const origin = window.location.origin;

const sections = [
  ["start", "Getting started"],
  ["widget", "Widget"],
  ["form", "Hosted form"],
  ["api", "REST API"],
  ["keys", "Keys and security"],
  ["agents", "Agents and tooling"],
  ["triage", "Triage"],
  ["notifications", "Notifications"],
  ["duplicates", "Duplicates"],
  ["releases", "Releases and source maps"],
  ["reporters", "Emails to reporters"],
  ["integrations", "Integrations"],
  ["webhooks", "Webhooks"],
  ["accounts", "Accounts and access"],
  ["retention", "What's kept"],
  ["self-hosting", "Self-hosting"],
] as const;

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-semibold mt-12 mb-3 scroll-mt-6">
      {children}
    </h2>
  );
}
const P = ({ children }: { children: ReactNode }) => <p className="text-md text-text-2 mb-3 leading-relaxed">{children}</p>;
const C = ({ children }: { children: ReactNode }) => <code className="mono text-text text-[0.88em] bg-surface-3 rounded px-1 py-px">{children}</code>;

function Table({ rows, head }: { head: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="list mb-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-3">
            {head.map((h) => (
              <th key={h} className="font-medium px-3 py-2 border-b border-divider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-divider first:border-t-0 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? "whitespace-nowrap" : "text-text-2"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const verify = `import crypto from "node:crypto";

// Use the raw request body, before any JSON parsing.
export function verifyIssueit(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${timestamp}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const payload = `{
  "id": "evt_8k2m1q9x0c4v7b",
  "type": "report.created",
  "created_at": "2026-10-30T09:12:44.120Z",
  "data": {
    "report": {
      "id": "rep_xyz789",
      "number": 42,
      "title": "Login button does not work",
      "description": "Clicking login does nothing.",
      "status": "new",
      "priority": "medium",
      "source": "widget",
      "environment": "production",
      "page_url": "https://example.com/login",
      "browser": "Chrome 141",
      "context": { "os": "macOS", "viewport": "1440×900", "language": "en-GB" },
      "reporter": { "email": "sam@example.com", "name": null },
      "metadata": { "user_id": "user_123" },
      "diagnostics": {
        "console": [{ "t": 4210, "level": "error", "message": "TypeError: Cannot read properties of undefined (reading 'id')", "stack": "at submit (login.js:41:12)" }],
        "network": [{ "t": 4380, "method": "POST", "url": "/api/session", "status": 500, "ms": 182 }],
        "steps": [{ "t": 4500, "kind": "click", "label": "button \"Log in\"" }]
      },
      "group": null,
      "attachments": [
        { "id": "att_…", "filename": "screenshot.png", "content_type": "image/png", "size_bytes": 182311, "url": "…signed link…" }
      ],
      "project": { "id": "prj_abc123", "name": "Website" },
      "dashboard_url": "${origin}/inbox/rep_xyz789",
      "created_at": "2026-10-30T09:12:43.981Z",
      "updated_at": "2026-10-30T09:12:43.981Z"
    }
  }
}`;

const ORIGINALS = new Set(["github", "linear", "clickup", "trello", "discord", "slack", "notion", "jira", "gitlab", "webhook"]);

/** Everything else, connected with a token, key or webhook URL, grouped by kind. */
function Catalogue() {
  const catalogue = useCatalogue();
  const rest = (catalogue.data ?? []).filter((p) => !ORIGINALS.has(p.id));
  if (!rest.length) return null;
  const groups = (Object.keys(categoryLabels) as ProviderCategory[]).map((c) => [c, rest.filter((p) => p.category === c)] as const).filter(([, list]) => list.length);
  return (
    <>
      <P>Plus {rest.length} more, each connected with a token, key or webhook URL from that service. Services that take a project, board or channel ask for it when you add the destination.</P>
      <div className="list mb-4 divide-y divide-divider">
        {groups.map(([c, list]) => (
          <div key={c} className="px-3 py-2.5 flex flex-col gap-1.5">
            <span className="text-xs text-text-3 font-medium">{categoryLabels[c].plural}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
              {list.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 text-text-2" title={p.summary}>
                  <BrandIcon provider={p.id} name={p.name} size={12} />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Docs() {
  return (
    <div className="min-h-full">
      <header className="border-b border-border-subtle">
        <div className="max-w-[1080px] mx-auto px-5 h-14 flex items-center gap-4">
          <Link to="/">
            <Logo />
          </Link>
          <span className="text-text-3 text-sm">Documentation</span>
          <Link to="/inbox" className="ml-auto btn btn--sm">
            Open dashboard
          </Link>
        </div>
      </header>
      <div className="max-w-[1080px] mx-auto px-5 flex gap-10">
        <nav className="hidden md:block w-[180px] shrink-0 sticky top-0 self-start pt-10" aria-label="On this page">
          <ul className="flex flex-col gap-1 text-sm">
            {sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block py-1 text-text-3 hover:text-text">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 min-w-0 max-w-[720px] pb-24">
          <h1 id="start" className="text-2xl font-semibold mt-10 mb-3">
            Getting started
          </h1>
          <P>Issueit collects bug reports from your product and delivers them to the tools you already use. It isn't an issue tracker: capture a bug, deliver it, get out of the way.</P>
          <ol className="list-decimal pl-5 text-md text-text-2 mb-3 flex flex-col gap-1.5">
            <li>Create a project in the dashboard. You get a project id, a widget snippet, a hosted form and an API endpoint.</li>
            <li>Collect reports with any of the three. Reporters never need an account.</li>
            <li>Add destinations under the project's Integrations tab. New reports are stored first, then delivered in the background with retries.</li>
          </ol>

          <H2 id="widget">Widget</H2>
          <P>Add the script to every page where people should be able to report a bug. It draws a small button in the corner and a short form.</P>
          <CodeBlock code={`<script\n  src="${origin}/widget.js"\n  data-project="prj_abc123"\n  defer\n></script>`} what="snippet" />
          <div className="h-3" />
          <P>
            The widget sends the page address, browser, viewport, language and time zone with each report, and says so in the form. People can attach files and, where the browser allows, take a
            screenshot after granting permission.
          </P>
          <P>
            It also keeps the last 40 console errors and warnings, requests and steps (clicks, page changes and which fields changed) in the visitor's browser, and sends them with a report so you can
            see what happened just before. Typed values, request bodies, headers and query string values are never recorded, and emails, tokens and card numbers are removed. Each kind can be turned
            off in the widget's settings, the person reporting can untick it, and <C>data-capture="off"</C> stops all recording on a page.
          </P>
          <Table
            head={["Option", "What it does"]}
            rows={[
              [<C>data-project</C>, "Required. The project id."],
              [
                <C>data-theme</C>,
                <>
                  Overrides the project's theme: <C>auto</C>, <C>light</C> or <C>dark</C>.
                </>,
              ],
              [
                <C>data-mode="inline"</C>,
                <>
                  Draws the form inside the element matched by <C>data-target</C> instead of a floating button.
                </>,
              ],
              [
                <C>data-source</C>,
                <>
                  Labels where reports came from. Defaults to <C>widget</C>.
                </>,
              ],
              [
                <C>data-capture="off"</C>,
                "Never records console messages, requests or steps on this page.",
              ],
            ]}
          />
          <P>
            The script exposes a small API on <C>window.Issueit</C>:
          </P>
          <CodeBlock
            what="example"
            code={`Issueit.identify({ email: user.email, name: user.name }); // skips the email field
Issueit.setMetadata({ user_id: user.id, plan: "pro" });      // attached to every report
document.querySelector("#report-bug").onclick = () => Issueit.open();`}
          />

          <H2 id="form">Hosted form</H2>
          <P>
            Every project has a public page at <C>{`${origin}/r/{project_id}`}</C>. It's the same form as the widget, so it follows the project's widget settings.
          </P>

          <H2 id="api">REST API</H2>
          <CodeBlock code={`POST ${origin}/v1/{project_id}/reports`} what="endpoint" />
          <div className="h-3" />
          <P>
            Send JSON, or <C>multipart/form-data</C> with a <C>report</C> field holding the JSON and one or more <C>attachments</C> files. JSON requests can include attachments as base64.
          </P>
          <Table
            head={["Field", "Notes"]}
            rows={[
              [<C>title</C>, "Required. Up to 200 characters."],
              [<C>description</C>, "Up to 20,000 characters."],
              [
                <C>severity</C>,
                <>
                  Or <C>priority</C>. <C>low</C>, <C>medium</C>, <C>high</C> or <C>critical</C>. Defaults to medium.
                </>,
              ],
              [
                <C>source</C>,
                <>
                  A short label such as <C>website</C> or <C>ios</C>. Routing rules can filter on it.
                </>,
              ],
              [
                <C>environment</C>,
                <>
                  For example <C>production</C>. Routing rules can filter on it.
                </>,
              ],
              [<C>page_url</C>, "A full URL."],
              [<C>browser</C>, "Free text."],
              [
                <C>email</C>,
                <>
                  Reporter's email, or <C>{`reporter: { email, name }`}</C>.
                </>,
              ],
              [<C>metadata</C>, "Any JSON object up to 16 KB."],
              [
                <C>fingerprint</C>,
                <>
                  Your own grouping key, such as an error's name and location. Reports with the same one are grouped as <a href="#duplicates" className="underline underline-offset-2">duplicates</a>.
                </>,
              ],
              [
                <C>notify</C>,
                <>
                  <C>true</C> if the reporter asked for <a href="#reporters" className="underline underline-offset-2">emails about the report</a>. Needs an email address.
                </>,
              ],
              [
                <C>diagnostics</C>,
                <>
                  Optional <C>{`{ console, network, steps }`}</C> lists, in the shape shown under webhooks. <C>t</C> is milliseconds before the report was sent.
                </>,
              ],
              [
                <C>release</C>,
                <>
                  Which build this happened on, so a minified stack can be read through that build's{" "}
                  <a href="#releases" className="underline underline-offset-2">source maps</a>.
                </>,
              ],
              [
                <C>attachments</C>,
                <>
                  Up to 5 files of 10 MB: <C>{`[{ filename, data }]`}</C> with base64 data.
                </>,
              ],
            ]}
          />
          <CodeBlock
            what="example"
            code={`curl -X POST ${origin}/v1/prj_abc123/reports \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "Login button does not work", "severity": "medium", "page_url": "https://example.com/login" }'

# 201 Created
{ "success": true, "report_id": "rep_xyz789", "message": "Report received", "duplicate": false }`}
          />
          <div className="h-3" />
          <P>Errors use the same shape with a readable message:</P>
          <CodeBlock code={`{ "success": false, "error": { "code": "invalid_request", "message": "title: Add a short title." } }`} what="example" />
          <div className="h-3" />
          <Table
            head={["Status", "Meaning"]}
            rows={[
              ["400", "The request didn't validate. The message names the field."],
              ["401", "The secret key isn't valid for this project."],
              ["403", "Public reports are off, or the site isn't in the project's allowed sites."],
              ["413", "The body or an attachment is too large."],
              ["415", "An attachment isn't a supported type. Images, video, PDFs, text and zips are accepted; SVG and HTML aren't."],
              [
                "429",
                <>
                  Too many reports. Wait for <C>Retry-After</C> seconds.
                </>,
              ],
            ]}
          />
          <P>Public requests are limited per visitor and per project. Requests with a secret key have their own, higher limit.</P>

          <P>
            <strong className="text-text font-medium">Sending the same report twice.</strong> Send an <C>Idempotency-Key</C> header (or an <C>idempotency_key</C> field) and a repeat files
            nothing new: you get the first report's id back, with <C>replayed: true</C> and an <C>idempotent-replay</C> header. Safe for a queue that delivers at least once, or a retry after a
            timeout.
          </P>
          <P>
            <strong className="text-text font-medium">Checking before you commit.</strong> Add <C>?dry_run=1</C> and Issueit validates the report, scrubs it, works out its fingerprint and tells
            you which destinations would receive it and whether it would join an existing group — then stores nothing. It's the way to test a fingerprint or a routing rule without filling your
            inbox with test bugs.
          </P>
          <CodeBlock
            code={`curl -X POST "${origin}/v1/prj_abc123/reports?dry_run=1" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Order #4821 failed to save", "page_url": "https://shop.example.com/orders/4821/edit"}'

# {"dry_run": true, "fingerprint": "t:…", "duplicate_of": {"number": 118, …},
#  "destinations": [{"name": "acme/web", "would_deliver": false, "why": "…"}], …}`}
            what="example"
          />

          <H2 id="keys">Keys and security</H2>
          <P>
            The <strong className="text-text font-medium">project id</strong> is public. It only says which project a report is for; it can't read anything. Limit which sites may use it under the
            project's Settings → Allowed sites.
          </P>
          <P>
            <strong className="text-text font-medium">Secret keys</strong> (<C>sk_live_…</C>) are for servers. Send one as <C>Authorization: Bearer sk_live_…</C>. Requests from a browser with a secret
            key are refused, because a key in a web page is a leaked key. Rotate or revoke keys under the project's API keys tab.
          </P>
          <P>
            <strong className="text-text font-medium">Short-lived tokens</strong> (<C>it_…</C>) let a single-page app send reports while the project stays closed to everyone else. Your server
            mints one with its secret key and hands it to the browser; it lasts up to an hour and only works for that project.
          </P>
          <CodeBlock
            code={`// On your server, for a signed-in visitor:
const res = await fetch("${origin}/v1/prj_abc123/token?seconds=600", {
  method: "POST",
  headers: { authorization: \`Bearer \${process.env.ISSUEIT_SECRET_KEY}\` },
});
const { token } = await res.json();   // give this to the page`}
            what="example"
          />
          <div className="h-3" />
          <P>
            <strong className="text-text font-medium">Account tokens</strong> (<C>ak_live_…</C>) are different again: they reach the management API — the same one the dashboard uses — and carry
            scopes saying what they may do. Create them under Settings → Account tokens. A token can be fenced to some projects, is shown once, and can never mint or revoke another token.
          </P>

          <H2 id="agents">Agents and tooling</H2>
          <P>
            A bug report carries the console errors, requests and steps captured in the moments before it was sent, which is usually enough to find the fault in the code. The Issueit MCP server hands
            that to a coding agent, so it can read a report, fix it and mark it resolved.
          </P>
          <P>
            Create an account token under Settings → Account tokens, choose what it may do, then add it to your agent. The agent preset can read reports, resolve them, and look at everything else
            without changing it.
          </P>
          <CodeBlock code={`claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… -- npx -y @issueit/mcp`} what="command" />
          <div className="h-3" />
          <P>
            Self-hosting? Add <C>--env ISSUEIT_URL={origin}</C>. Issueit also speaks MCP over HTTP at <C>POST {origin}/mcp</C> with the same token as a bearer header, for clients that connect to a
            remote server rather than running one.
          </P>
          <Table
            head={["Tool", "What it does"]}
            rows={[
              [<C>get_report</C>, "One report in full: what they said, the console errors with stacks, the requests the page made, the clicks, the attachments, and where it was delivered."],
              [<C>search_reports</C>, "Find reports by project, status, priority, text, date or failed delivery."],
              [<C>resolve_report</C>, "Mark a bug fixed once the fix is shipped, which also emails everyone who asked to hear."],
              [<C>setup_project</C>, "Create a project and get the snippet for your framework, in one call."],
              [<C>diagnose_install</C>, "Check a project before launch: has anything arrived, is anyone being told, is delivery healthy."],
              [<C>create_destination</C>, <>Point a project at a tracker, a channel or a webhook, then <C>test_destination</C> to prove it works.</>],
              [<C>list_deliveries</C>, <>Why a report never reached the tracker, and <C>retry_delivery</C> to try again.</>],
            ]}
          />
          <P>
            The whole management API is described at <C>{origin}/openapi.json</C>, generated from the router itself, with the scope each endpoint needs. Anything a token lacks comes back as a plain
            refusal naming the scope.
          </P>
          <P>
            Every change, by a person or a token, is recorded under Settings → Audit log: who, what, which token and from where.
          </P>

          <h3 className="text-md font-semibold mt-7 mb-2">The command line</h3>
          <CodeBlock code={`npx issueit login\nnpx issueit init          # creates the project, writes .issueit.json, prints the snippet\nnpx issueit tail          # watch reports arrive`} what="commands" />
          <div className="h-3" />
          <P>
            <C>issueit login</C> shows a code you approve in the dashboard, so no token is ever typed into a terminal. In CI, set <C>ISSUEIT_TOKEN</C> instead and skip signing in.
          </P>
          <Table
            head={["Command", "What it does"]}
            rows={[
              [<C>issueit ls</C>, <>List reports. <C>issueit show 14</C> prints one in full, with its console errors and steps.</>],
              [<C>issueit tail</C>, "Watch reports arrive, one line each."],
              [
                <C>issueit listen</C>,
                <>
                  Forwards reports to a URL on your machine, signed exactly as a real webhook: <C>--forward http://localhost:3000/hooks</C>. Build a receiver without deploying it.
                </>,
              ],
              [<C>issueit file "…"</C>, "File a bug from a failing test or a git hook. A description can be piped in."],
              [<C>issueit doctor</C>, "Checks the project: has anything arrived, is anyone being told, is delivery healthy."],
              [<C>issueit health</C>, "Queue depth and failures. Exits non-zero when delivery is behind, so CI can fail on it."],
            ]}
          />

          <h3 className="text-md font-semibold mt-7 mb-2">Settings in your repository</h3>
          <P>
            <C>issueit pull</C> writes a project's settings — widget, allowed sites, rules, destinations — to a JSON file with no ids in it. Commit it, review changes in a pull request, and{" "}
            <C>issueit push</C> applies it. Destinations are matched by name and connections by account, so one file works for staging and production.
          </P>
          <CodeBlock code={`issueit pull                      # write issueit.config.json\nissueit push --dry-run            # show what would change\nissueit push --prune              # apply, removing what the file doesn't mention`} what="commands" />

          <h3 className="text-md font-semibold mt-7 mb-2">Watching the pipeline</h3>
          <P>
            <C>GET /api/orgs/current/health</C> answers the question an alert should ask: not "is the server up" but "how old is the oldest thing still waiting". It returns{" "}
            <C>ok</C>, <C>degraded</C> or <C>behind</C>, with the reasons. Set <C>METRICS_TOKEN</C> and <C>{`${origin}/metrics`}</C> serves the same in Prometheus format for the whole install.
          </P>

          <H2 id="triage">Triage</H2>
          <P>
            Issueit isn't an issue tracker — that's what your destinations are for — but a report has to be dealt with by somebody, so the inbox does the few things that take.
          </P>
          <Table
            head={["This", "Does that"]}
            rows={[
              ["Assign", "Puts someone's name on a report. Filter the inbox by Assigned to me to see yours."],
              ["Notes", "What you tried and what it turned out to be. Internal: never delivered anywhere, never shown to the reporter."],
              ["Choose several", <>The checkbox on each row, or <C>x</C>. Shift-click picks a run of them. Then resolve, close, assign or delete the lot.</>],
              ["Keyboard", <><C>j</C> and <C>k</C> move, <C>e</C> resolves, <C>m</C> assigns to you, <C>x</C> chooses, <C>Enter</C> opens.</>],
              ["Search", "Matches the title, the description, the reporter's address, or a report id pasted whole."],
            ]}
          />
          <P>
            Every change can be undone from the toast that follows it, and resolving a report emails the reporters who asked to hear, however many of them reported the same thing.
          </P>

          <H2 id="notifications">Notifications</H2>
          <P>
            A pipeline nobody is told about is one you have to remember to check. Settings › Notifications is per person and per organisation, so you can take everything from
            your own project and nothing from a colleague's.
          </P>
          <Table
            head={["Email", "When"]}
            rows={[
              ["A report arrived", "Off, critical only (the default), high and above, or everything. A duplicate joining an open bug never emails anyone: you were told about that one already."],
              ["A destination was paused", "Issueit stops sending to a destination whose deliveries keep failing. Reports are still collected; nothing is leaving. Once a day per destination at most."],
              ["Digest", "Daily or weekly: what arrived, what was resolved, what's stuck. Nothing is sent on a quiet day. Send yourself one from that page to see it."],
              ["You're near the allowance", "Hosted plans only, to owners, once a month at 80% and again when reports start being turned away."],
            ]}
          />
          <P>
            All of it needs a mail server on the install (<C>SMTP_URL</C>). Without one the page says so and nothing is sent.
          </P>

          <H2 id="duplicates">Duplicates</H2>
          <P>
            When a report has the same title on the same page as a report that's still open, it joins that report instead of being delivered again. Titles are compared without case, punctuation or
            numbers, and pages without their query string or ids, so <C>/orders/812/edit</C> and <C>/orders/97/edit</C> count as the same page. Send a <C>fingerprint</C> to group your own way.
          </P>
          <P>
            The first report is delivered as usual. As more join it, GitHub, GitLab, Linear and Jira issues get a comment at 2, 3, 5, 10, 25, 50 and 100 reports and so on, and webhooks can subscribe
            to <C>report.duplicate</C>. Once the first report is resolved or closed, the next match starts a new group, so a bug that comes back is noticed. Grouping can be turned off in the
            project's settings, and any report can be separated from its group or added to another.
          </P>

          <P>
            A project's <strong className="text-text font-medium">Rules</strong> tab changes how duplicates are recognised: patterns removed from the title before comparing (so{" "}
            <C>order #\d+</C> stops two orders failing the same way counting as two bugs), comparing only the first few path segments, or ignoring the page entirely. The same tab adds your own
            redaction patterns on top of the built-in ones. Both are tried against this project's last hundred reports before you save them, so you can see exactly what would merge and what
            would be removed.
          </P>

          <H2 id="releases">Releases and source maps</H2>
          <P>
            A minified stack is no use to anyone. Tell Issueit which build a report came from and give it that build's source maps, and the stack is read back into your own files when someone
            opens the report — so maps uploaded after a crash still help.
          </P>
          <CodeBlock code={`npx issueit sourcemaps upload dist --release "$GIT_SHA" --prefix assets`} what="command" />
          <div className="h-3" />
          <P>
            <C>--prefix</C> is the path the browser sees, so <C>dist/app.js</C> served at <C>/assets/app.js</C> needs <C>--prefix assets</C>. Then send the same value as <C>release</C> with
            every report. Uploading the same file again replaces it, so a deploy that runs twice is harmless.
          </P>
          <P>
            A report's console entries then carry both: <C>stack</C> as the browser saw it, and <C>original</C> read through the maps. Nothing is thrown away, in case a map turns out to be the
            wrong one.
          </P>

          <H2 id="reporters">Emails to reporters</H2>
          <P>
            Turn on reporter emails in a project's settings and the form offers a tick box under the email field. People who tick it get a receipt when they send the report and a note when it's
            fixed. "Fixed" means the report was resolved in Issueit or its GitHub, GitLab, Linear or Jira issue was closed as done: Issueit checks those trackers every few minutes. Everyone who
            reported the same bug hears, once each.
          </P>
          <P>
            Emails carry the project's logo and brand name, only the report's title, and a link to stop emails about that report. They're sent through Issueit's own mail server, or through one of
            your email connections (Resend, Postmark, SendGrid, Mailgun, Brevo, Mailjet, SparkPost, Amazon SES or any SMTP server) so they come from your domain.
          </P>

          <H2 id="integrations">Integrations</H2>
          <P>
            Each project can deliver to any number of destinations. By default every new report goes to every destination; a destination can be narrowed to some priorities, sources or environments.
          </P>
          <Table
            head={["Service", "Creates", "Connect with"]}
            rows={[
              ["GitHub Issues", "An issue, with optional labels", "GitHub sign-in or a fine-grained token"],
              ["Linear", "An issue with matching priority", "Linear sign-in or a personal API key"],
              ["ClickUp", "A task with matching priority", "ClickUp sign-in or a personal token"],
              ["Trello", "A card at the top of a list", "Trello authorisation or an API key and token"],
              ["Discord", "A message in a channel", "Discord sign-in or a channel webhook URL"],
              ["Slack", "A message in a channel", "Slack sign-in or an incoming webhook URL"],
              ["Notion", "A page in a database", "Notion sign-in or an internal integration secret"],
              ["Jira Cloud", "A Bug (or Task) in a project", "Atlassian sign-in or an API token"],
              ["GitLab Issues", "An issue, with optional labels", "GitLab sign-in or a personal access token"],
              ["Webhook", "A signed JSON event", "Any HTTPS endpoint"],
            ]}
          />
          <Catalogue />
          <P>
            Delivery is asynchronous. A failed delivery is retried with backoff (30 seconds, then 2 and 10 minutes, then up to 6 hours apart, 8 attempts in all) and never loses the report. Each report
            shows where it went, with links to the created issue, and you can retry failures by hand.
          </P>

          <H2 id="webhooks">Webhooks</H2>
          <P>
            A webhook destination receives <C>POST</C> requests with a JSON body for the events you choose: <C>report.created</C>, <C>report.updated</C>, <C>report.resolved</C>,{" "}
            <C>report.closed</C> and <C>report.duplicate</C>. For a duplicate, <C>group</C> holds the first report's id and how many reports the group has.
          </P>
          <CodeBlock code={payload} what="example payload" />
          <div className="h-3" />
          <Table
            head={["Header", "Value"]}
            rows={[
              [<C>Issueit-Event</C>, "The event type."],
              [<C>Issueit-Delivery</C>, "A unique delivery id. Retries reuse it, so you can ignore duplicates."],
              [
                <C>Issueit-Signature</C>,
                <>
                  <C>{`t=<unix seconds>,v1=<hex HMAC-SHA256>`}</C> of <C>{`<t>.<raw body>`}</C>, keyed with the signing secret.
                </>,
              ],
            ]}
          />
          <P>Verify every request before trusting it:</P>
          <CodeBlock code={verify} what="verification code" />
          <div className="h-3" />
          <P>Respond with any 2xx status within 15 seconds. Other responses are retried, except 410 Gone, which stops retries for that delivery. Webhook URLs must resolve to public addresses.</P>

          <H2 id="accounts">Accounts and access</H2>
          <P>
            Signing in is an email address and a password, with an optional six-digit code from an authenticator app. Turn that on in Settings › Account: Issueit shows a setup
            key, waits for a code from it to prove the app works, and then hands over ten recovery codes. Each recovery code works once, and they're stored only as hashes.
          </P>
          <Table
            head={["This", "Works like this"]}
            rows={[
              ["Forgotten password", <>The link on the sign-in page emails a link that lasts an hour and works once. Resetting signs out every other session. Two-step still applies afterwards: an inbox alone isn't enough.</>],
              ["Confirming your address", "Sent when you sign up or change it. Until it's confirmed Issueit can't send you a reset, so the dashboard keeps asking."],
              ["Invitations", "Settings › Members. The invited address gets an email, and the link is shown as well so you can pass it on yourself. It lasts seven days."],
              ["Account tokens", <>For things with no browser: the CLI, CI, an agent. Organisation-wide, scoped, and listed in Settings › Account tokens. See <a href="#agents" className="underline underline-offset-2">Agents and tooling</a>.</>],
            ]}
          />

          <H2 id="retention">What's kept</H2>
          <P>
            Screenshots, video and captured diagnostics are the heavy and the personal part of a bug report. They're deleted on a schedule; the report itself — title, page,
            status, who reported it — stays until someone deletes it.
          </P>
          <Table
            head={["Data", "Kept until"]}
            rows={[
              ["Attachments and diagnostics", "The retention period for the install or the plan passes. On the hosted service that's between a week and a year, shown in Settings › Plan and billing."],
              ["Reports", <>Deleted by hand, with their project, or with their organisation. An owner can also set a period in Settings › General, after which they go on their own.</>],
              ["Delivery records", "Their report is deleted."],
              ["Sent email and used links", "A month for notices, a week for expired reset and confirmation codes."],
            ]}
          />
          <P>Copies already delivered to your tracker or chat stay there. Deleting a report in Issueit never reaches into another service.</P>

          <H2 id="self-hosting">Self-hosting</H2>
          <P>
            Issueit runs as one container plus PostgreSQL. Connecting with a sign-in needs an OAuth app for each service; without one, the dashboard offers the token method instead. Register each app
            with the redirect URL <C>{`${origin}/api/oauth/{service}/callback`}</C> and set the variables below.
          </P>
          <P>
            Set <C>SMTP_URL</C> (for example <C>smtps://user:password@smtp.example.com:465</C>) and <C>SMTP_FROM</C> before anybody else signs up. Everything Issueit sends on
            its own behalf goes through it: password resets, address confirmations, invitations, report alerts and digests. Without it a forgotten password can only be fixed in
            the database, though projects can still email reporters through their own email connection.
          </P>
          <P>
            <C>SYNC_INTERVAL_MINUTES</C> sets how often trackers are checked for closed issues; 0 turns it off. <C>JOBS_HOUR_UTC</C> is when the daily round runs — deleting
            what retention says to delete and sending digests — and <C>RETENTION_ENABLED=false</C> keeps everything for ever.
          </P>
          <P>
            <strong className="text-text">Back it up.</strong> <C>./scripts/backup.sh</C> takes the three things that matter — the database, the attachment files and{" "}
            <C>.env</C> — into a dated directory, keeps 30 days and can be run from cron; <C>./scripts/restore.sh &lt;directory&gt;</C> puts them back. Copy them off the
            machine as well. <C>ENCRYPTION_KEY</C> matters most: it decrypts every stored integration credential, and without it each connected account has to be reconnected
            by hand.
          </P>
          <Table
            head={["Service", "Environment variables"]}
            rows={[
              ["GitHub", <C>GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET</C>],
              ["Linear", <C>LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET</C>],
              ["ClickUp", <C>CLICKUP_CLIENT_ID, CLICKUP_CLIENT_SECRET</C>],
              [
                "Trello",
                <>
                  <C>TRELLO_API_KEY</C> (allow {origin} as an origin)
                </>,
              ],
              ["Discord", <C>DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET</C>],
              ["Slack", <C>SLACK_CLIENT_ID, SLACK_CLIENT_SECRET</C>],
              ["Notion", <C>NOTION_CLIENT_ID, NOTION_CLIENT_SECRET</C>],
              ["Jira", <C>JIRA_CLIENT_ID, JIRA_CLIENT_SECRET</C>],
              [
                "GitLab",
                <>
                  <C>GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET</C>, optional <C>GITLAB_URL</C>
                </>,
              ],
            ]}
          />
        </main>
      </div>
    </div>
  );
}
