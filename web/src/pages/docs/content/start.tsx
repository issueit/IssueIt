import type { ComponentType } from "react";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Cards, Code, D, Endpoint, Facts, H2, Params, Step, Steps, Table } from "../kit";

/** Get started: what Issueit is, the shortest path through it, and the words it uses. */

function Introduction() {
  return (
    <>
      <p>
        A report arrives with the things a developer actually needs — the page, the browser, a screenshot, and the console errors, network requests and clicks from the moments before someone pressed
        send — and leaves as an issue in your tracker, a message in your chat, or an HTTP request to an endpoint of your own.
      </p>
      <p>
        It is not an issue tracker. There is an inbox, because a report has to be dealt with by somebody, but the work happens in GitHub, Linear, Jira, Slack or wherever your team already lives.
        Capture a bug, deliver it, get out of the way.
      </p>

      <H2>Start here</H2>
      <Cards
        items={[
          { to: "/quickstart", title: "Quickstart", text: "A project, a script tag and a destination. A real report in your tracker in about five minutes." },
          { to: "/how-it-works", title: "How Issueit works", text: "The path a report takes, and what happens at each step of it." },
          { to: "/collect/intake-api", title: "Intake API", text: "Send a report from a server, a mobile app, a test suite or a CI job." },
          { to: "/automate/mcp", title: "Agents", text: "Give a coding agent the bug with its diagnostics, and let it fix and resolve it." },
        ]}
      />

      <H2>The three ways in</H2>
      <Table
        head={["Surface", "Good for", "Needs"]}
        rows={[
          [
            <D to="/collect/widget">The widget</D>,
            "Anyone using your product in a browser",
            <>
              One <C>&lt;script&gt;</C> tag
            </>,
          ],
          [<D to="/collect/form">The hosted form</D>, "QA, support replies, an email signature, a QR code", "Nothing — every project has a public page"],
          [<D to="/collect/intake-api">The intake API</D>, "Servers, mobile apps, failing tests, CI", "One HTTP request"],
        ]}
      />
      <p>
        All three end up in the same place, carry the same fields and follow the same rules. Reporters never need an account, and the project id that identifies where a report belongs is public by
        design — it can create a report and nothing else.
      </p>

      <H2>And the ways out</H2>
      <p>
        A project delivers to any number of destinations: issue trackers, chat, help desks, on-call tools, email, spreadsheets, automation platforms, cloud queues, or{" "}
        <D to="/deliver/webhooks">your own webhook</D>. Reports are stored before anything is sent, and a delivery that fails is retried for about ten hours, so a tracker being down loses nothing.
      </p>
      <Cards
        items={[
          { to: "/deliver/destinations", title: "Destinations", text: "Over 130 services, and what each one creates from a report." },
          { to: "/deliver/outbox", title: "Retries and the outbox", text: "Why a failed delivery is a delay rather than a lost bug." },
        ]}
      />

      <H2>Conventions in these pages</H2>
      <Facts
        rows={[
          [
            "Project ids",
            <>
              Examples use <C>prj_abc123</C>. Yours is on the project's overview, and it is safe to put in a web page.
            </>,
          ],
          [
            "Secret keys",
            <>
              <C>sk_live_…</C> belongs on a server. Issueit refuses one sent from a browser.
            </>,
          ],
          [
            "Hosts",
            <>
              Samples name this install's own addresses. If you <D to="/self-host/install">host Issueit yourself</D>, they are already correct for you.
            </>,
          ],
          ["Spelling", "British English, and sentence case in the interface, so the documentation matches the buttons."],
        ]}
      />
    </>
  );
}

function Quickstart() {
  const urls = useUrls();
  return (
    <>
      <p>Five minutes, four steps, and a bug report in your issue tracker with a screenshot attached. You need an Issueit account and somewhere to send reports.</p>

      <Steps>
        <Step title="Create a project">
          <p>
            A project is one product or one website. In the dashboard, <strong>Projects → New project</strong>. You get a project id (<C>prj_…</C>), a widget snippet, a hosted form and an intake
            endpoint.
          </p>
          <p>
            From a terminal, <C>npx issueit init</C> does the same and writes the id into <C>.issueit.json</C> so the{" "}
            <D to="/automate/cli">command line</D> stops asking which project you mean.
          </p>
        </Step>

        <Step title="Collect a report">
          <p>Add the widget to every page where someone should be able to report a bug. It draws a small button in the corner and a short form.</p>
          <Code
            title="index.html"
            lang="html"
            code={`<script
  src="${urls.cdn}/widget.js"
  data-project="prj_abc123"
  defer
></script>`}
          />
          <p>
            Or send one with a single request, which is also the fastest way to prove the project works before you touch your own code:
          </p>
          <Code
            title="Terminal"
            lang="sh"
            code={`curl -X POST ${urls.drop}/v1/prj_abc123/reports \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Login button does nothing", "page_url": "https://example.com/login"}'`}
          />
        </Step>

        <Step title="Add a destination">
          <p>
            On the project's <strong>Integrations</strong> tab, add a destination. Connect GitHub, Linear, Jira, Slack or any of the{" "}
            <D to="/deliver/destinations">other services</D> by signing in, or paste a token or webhook URL. Choose the repository, project or channel, then send the test report that Issueit offers:
            it goes through the whole pipeline, so a tick means the next real report will arrive too.
          </p>
          <p>By default every new report goes to every destination. Narrowing that comes later, under {<D to="/deliver/routing">routing</D>}.</p>
        </Step>

        <Step title="Report a real bug">
          <p>
            Open your site, press the button, write a sentence, attach a screenshot. The report appears in the inbox immediately and in your tracker a moment later. Open it and you'll find the console
            errors, network requests and clicks from just before it was sent.
          </p>
        </Step>
      </Steps>

      <Callout kind="tip" title="Before you launch">
        <p>
          <C>npx issueit doctor</C> — or <C>diagnose_install</C> if you are driving Issueit from an <D to="/automate/mcp">agent</D> — checks the three things that quietly go wrong: nothing has arrived
          yet, nobody is being told, or delivery is failing.
        </p>
      </Callout>

      <H2>Where to go next</H2>
      <Cards
        items={[
          { to: "/collect/widget", title: "Widget options", text: "Inline mode, themes, which fields appear, and turning capture off on a page." },
          { to: "/reports/duplicates", title: "Duplicates", text: "Stop one broken page filing four hundred issues." },
          { to: "/reports/releases", title: "Source maps", text: "Make minified stack traces read as your own files." },
          { to: "/automate/cli", title: "Command line", text: "Watch reports arrive, and forward webhooks to your laptop." },
        ]}
      />
    </>
  );
}

function HowItWorks() {
  const urls = useUrls();
  return (
    <>
      <p>
        Issueit is one HTTP service and one PostgreSQL database. A report is stored before anything else happens to it, and everything after that — delivery, duplicate detection, notifications,
        source map resolution — reads from the database rather than from the request that is still open.
      </p>

      <H2>The path a report takes</H2>
      <Steps>
        <Step title="Arrives">
          <p>
            A browser, server or agent posts to <C>{`/v1/{project_id}/reports`}</C>. Issueit validates the fields, checks the rate limits for that visitor, key and project, and — if the request came
            from a page — checks the project's allowed sites.
          </p>
        </Step>
        <Step title="Is cleaned">
          <p>
            Attachment types are sniffed from the bytes rather than trusted from the filename. Text is scrubbed of anything that looks like an email address, a token or a card number, in the widget
            first and again on the server, plus any <D to="/reports/duplicates">patterns of your own</D>.
          </p>
        </Step>
        <Step title="Is fingerprinted">
          <p>
            A normalised title and page — or the <C>fingerprint</C> you sent — decide whether this is a new bug or the four hundredth report of one that is already open. A match joins that group
            instead of being delivered again.
          </p>
        </Step>
        <Step title="Is stored">
          <p>The report, its attachments and its diagnostics are written down. The request can now be answered: a 201 with the report's id. Nothing that happens next can lose it.</p>
        </Step>
        <Step title="Is queued">
          <p>
            One row per matching destination goes into the <C>deliveries</C> table in the same database and the same transaction, so there is no separate queue to disagree with it.
          </p>
        </Step>
        <Step title="Is delivered">
          <p>
            A worker claims rows in batches with <C>FOR UPDATE SKIP LOCKED</C>, calls the service, and records what happened. A failure is retried with backoff over about ten hours. See{" "}
            <D to="/deliver/outbox">retries and the outbox</D>.
          </p>
        </Step>
        <Step title="Is closed">
          <p>
            Issueit polls GitHub, GitLab, Linear and Jira for the issues it opened. A closed issue resolves the report, and resolving emails everyone who asked to hear about it — however many of them
            reported the same thing.
          </p>
        </Step>
      </Steps>

      <H2>Public surfaces</H2>
      <p>Everything below is served from one origin by default. Hosted installs split it across subdomains; these are this install's own addresses.</p>
      <Table
        head={["Method and path", "Auth", "Purpose"]}
        rows={[
          [<C>POST /v1/{"{project}"}/reports</C>, "Project id, or secret key", "Create a report. JSON or multipart."],
          [<C>POST /v1/{"{project}"}/token</C>, "Secret key", "Mint a short-lived browser token."],
          [<C>GET /v1/{"{project}"}/widget</C>, "None", "Public widget settings and upload limits. Cached for 60 seconds."],
          [<C>GET /widget.js</C>, "None", "The widget script. No dependencies, no cookies."],
          [<C>GET /r/{"{project}"}</C>, "None", "Hosted report form. Strict CSP, frame-ancestors 'none'."],
          [<C>GET /a/{"{id}/{name}"}</C>, "Signed link", "Streams an attachment for links inside delivered issues."],
          [<C>GET /api/catalogue</C>, "None", "Every available destination: id, name, category, summary."],
          [<C>GET /api/plans</C>, "None", "The plans this install sells, if it sells any."],
          [<C>GET /openapi.json</C>, "None", "The management API, described from the router itself."],
          [<C>POST /mcp</C>, "Account token", "The Model Context Protocol endpoint for agents."],
          [
            <C>GET /health</C>,
            "None",
            <>
              Database round trip. <C>{`{ "ok": true }`}</C> or a 500.
            </>,
          ],
        ]}
      />

      <H2>Where each piece runs</H2>
      <Facts
        rows={[
          ["The API", "Hono on Node. One process serves intake, the dashboard API and the MCP endpoint."],
          [
            "The worker",
            <>
              Delivery, tracker polling and the daily round. In the same process by default; set <C>ROLE=worker</C> to run it separately and several at once.
            </>,
          ],
          ["The database", "PostgreSQL 17. It is also the queue, the rate-limit ledger and the event bus."],
          [
            "Live updates",
            <>
              PostgreSQL <C>LISTEN/NOTIFY</C> to server-sent events, so the dashboard never polls.
            </>,
          ],
          ["Attachments", <>Files on disk under <C>DATA_DIR</C>, served through signed links.</>],
          ["The widget", <>One dependency-free script served from <C>{urls.cdn}/widget.js</C>. No cookies, no storage.</>],
        ]}
      />
      <Callout kind="note">
        <p>
          There is no separate queue, cache or object store to run, and no background service that has to be up for a report to be accepted. If the database is reachable, intake works.
        </p>
      </Callout>
    </>
  );
}

function Concepts() {
  return (
    <>
      <p>Nine objects, and the words these pages use for them. Each has an id with a prefix, listed under {<D to="/reference/ids">object ids</D>}.</p>

      <H2>Organisation</H2>
      <p>
        Who owns the data and who pays for it. People are invited into an organisation with a role — owner, admin or member — and everything else belongs to one. A person can be in several, and
        switches between them in the dashboard; their notification choices and dashboard layout are per organisation, so your own project can shout and a colleague's can stay quiet.
      </p>

      <H2>Project</H2>
      <p>
        One product, site or app. A project holds the widget's appearance and questions, its allowed sites, its ingest keys, its rules and its destinations. Reports belong to a project; so does
        everything a developer configures. Staging and production are usually two projects, which is why{" "}
        <D to="/automate/config">config as code</D> matches destinations by name rather than by id.
      </p>

      <H2>Report</H2>
      <p>
        One thing that went wrong, as a person described it, plus the context Issueit gathered. A report has a number within its project (<C>#42</C>), a status — new, investigating, resolved or closed — a
        priority, a source, an environment, attachments and diagnostics.
      </p>
      <Params
        rows={[
          { name: "status", type: "new · investigating · resolved · closed", children: "Resolved means fixed, and emails anyone who asked. Closed means dealt with another way." },
          { name: "priority", type: "low · medium · high · critical", children: "Sent by the reporter or set in triage. Trackers that have their own priorities get the matching one." },
          { name: "source", type: "string", children: <>Where it came from: <C>widget</C>, <C>form</C>, <C>api</C>, or a label of your own. Routing rules can match it.</> },
          { name: "environment", type: "string", children: <>Free text, usually <C>production</C> or <C>staging</C>. Routing rules can match it too.</> },
        ]}
      />

      <H2>Diagnostics</H2>
      <p>
        The three lists the widget keeps in the visitor's browser and sends with a report: <strong>console</strong> errors and warnings, <strong>network</strong> requests with their status and
        duration, and <strong>steps</strong> — clicks, page changes and which fields were edited. Each entry carries <C>t</C>, how many milliseconds before sending it happened. This is the part that
        makes a report fixable; see <D to="/collect/diagnostics">diagnostics capture</D>.
      </p>

      <H2>Group</H2>
      <p>
        Several reports of one fault. The first report is delivered; the rest join it. Trackers get a comment as the group grows, so one issue says "and 46 other people". A group ends when its first
        report is resolved or closed, so a bug that comes back is noticed rather than silently added to history.
      </p>

      <H2>Destination</H2>
      <p>
        Somewhere reports go: a GitHub repository, a Slack channel, a Jira project, an endpoint of your own. A destination belongs to a project, uses a connection, and carries its own filters and
        delivery policy.
      </p>

      <H2>Connection</H2>
      <p>
        An account Issueit can act through — a GitHub sign-in, a Linear API key, an SMTP server — held by the organisation and shared between its projects. Credentials are encrypted with{" "}
        <C>ENCRYPTION_KEY</C>; a connection can be revalidated or disconnected without touching the destinations that use it.
      </p>

      <H2>Delivery</H2>
      <p>
        One attempt-tracked journey from one report to one destination. It has a status, a number of attempts, a next-attempt time, the service's own response, and a link to whatever it created. It is
        the row you read when someone asks why a bug never reached the tracker.
      </p>

      <H2>Release</H2>
      <p>
        A build of your product, named by whatever you choose — usually a commit SHA. Upload that build's source maps and a minified stack in any report naming it becomes a readable one, resolved when
        the report is read rather than when it arrived. See <D to="/reports/releases">releases and source maps</D>.
      </p>

      <H2>Keys and tokens</H2>
      <p>Four credentials, each with one job. Mixing them up is the most common setup mistake, so they are deliberately easy to tell apart.</p>
      <Table
        head={["Looks like", "What it is", "Where it belongs"]}
        rows={[
          [<C>prj_…</C>, "A project id. Says where a report goes.", "Public. In a web page, an app, anywhere."],
          [<C>sk_live_…</C>, "A project secret key. Creates reports without a browser.", "Your servers only."],
          [<C>it_…</C>, <>A <D to="/collect/browser-tokens">browser token</D>. Reports for up to an hour.</>, "Handed to a page by your server."],
          [<C>ak_live_…</C>, <>An <D to="/automate/tokens">account token</D>. Reaches the management API with scopes.</>, "CI, the CLI, an agent."],
        ]}
      />
      <Endpoint method="POST" path="/v1/{project_id}/reports" auth="prj_, sk_live_ or it_" />
    </>
  );
}

export const startPages: Record<string, ComponentType> = {
  "/": Introduction,
  "/quickstart": Quickstart,
  "/how-it-works": HowItWorks,
  "/concepts": Concepts,
};
