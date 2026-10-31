import type { ComponentType } from "react";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Code, CodeTabs, D, Endpoint, Facts, H2, H3, Params, Step, Steps, Table } from "../kit";

/** Automate: tokens, the management API, MCP, the CLI, config as code and monitoring. */

function Tokens() {
  const urls = useUrls();
  return (
    <>
      <p>
        An account token reaches the management API — the same API the dashboard uses — for things that have no browser: a CI job, the command line, an agent. It is not a project secret key, which
        only creates reports.
      </p>
      <Endpoint method="GET" path="/api/orgs/current/reports" auth="Authorization: Bearer ak_live_…" />

      <H2>Creating one</H2>
      <Steps>
        <Step title="Settings → Account tokens">
          <p>Name it after the thing that will use it — "GitHub Actions", "Claude on my laptop" — because that name is what you'll be reading in the audit log in six months.</p>
        </Step>
        <Step title="Choose its scopes">
          <p>
            Pick the smallest set that does the job. The <strong>agent preset</strong> is one button: it can read reports, resolve them, and look at everything else without changing it — the right
            starting point for an <D to="/automate/mcp">agent</D> and for most CI jobs. A token can also be given an expiry in days, which is worth doing for anything temporary.
          </p>
        </Step>
        <Step title="Fence it to projects, if you like">
          <p>A token can be limited to some of the organisation's projects. It then can't see or touch the others, and endpoints that describe the whole organisation refuse it.</p>
        </Step>
        <Step title="Copy it once">
          <p>
            The token is shown once and stored only as a hash. Put it straight into the secret store it belongs in. <C>issueit login</C> avoids the copying entirely — see{" "}
            <D to="/automate/cli">the command line</D>.
          </p>
        </Step>
      </Steps>

      <H2>Scopes</H2>
      <p>One scope per kind of thing, split into reading and changing. A token never exceeds its owner's role, which is read fresh on every request — demote somebody and their tokens shrink.</p>
      <Table
        head={["Scope", "Lets the token"]}
        rows={[
          [<C>reports:read</C>, "Read bug reports and their diagnostics"],
          [<C>reports:write</C>, "Change a report's status, priority and grouping"],
          [<C>projects:read</C>, "List projects and read their settings"],
          [<C>projects:write</C>, "Create projects and change their settings, including releases and source maps"],
          [<C>destinations:read</C>, "See where reports are delivered"],
          [<C>destinations:write</C>, "Add, change and test destinations, and apply a config file"],
          [<C>connections:read</C>, "See connected accounts and what they can target"],
          [<C>connections:write</C>, "Connect and disconnect accounts"],
          [<C>deliveries:read</C>, "Read the delivery log"],
          [<C>deliveries:write</C>, "Retry deliveries"],
          [<C>analytics:read</C>, "Read counts, charts, usage and health"],
          [<C>keys:write</C>, "Create and revoke a project's ingest keys — owners only"],
          [<C>org:read</C>, "Read organisation settings, members and the audit log"],
          [<C>org:write</C>, "Change organisation settings and members — owners only"],
        ]}
      />

      <H2>What no token can do</H2>
      <Facts
        rows={[
          ["Mint or revoke a token", "That stays with a person signed in to the dashboard, so a token can't outlive the intent that created it."],
          ["Change billing", "Reading the plan is a scope; moving money needs a card and a person."],
          ["Read someone's notification preferences", "Not a token's business."],
          ["Reach an endpoint no rule covers", "Every endpoint has to be given a cost explicitly. A new route is closed to tokens until somebody decides, rather than open by accident."],
        ]}
      />
      <Code
        title="A refusal names the scope"
        lang="json"
        code={`{ "error": { "code": "forbidden", "message": "This token is missing the \\"reports:write\\" scope." } }`}
      />

      <H2>Using one</H2>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            code: `curl -s "${urls.app}/api/orgs/current/reports?status=new&limit=5" \\
  -H "Authorization: Bearer $ISSUEIT_TOKEN"`,
          },
          {
            label: "CI",
            code: `# One secret, two jobs that need it.
export ISSUEIT_TOKEN=ak_live_…

issueit sourcemaps upload dist --release "$GITHUB_SHA" --prefix assets
issueit health        # exits non-zero when delivery is behind`,
          },
          {
            label: "An agent",
            code: `claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… -- npx -y @issueit/mcp`,
          },
        ]}
      />
      <p>
        <C>current</C> works in place of an organisation id and means "the one this token belongs to", which keeps scripts free of ids.
      </p>

      <H2>Looking after them</H2>
      <Facts
        rows={[
          ["Rate limit", <>600 requests a minute per token by default; see <D to="/reference/limits">limits</D>.</>],
          ["Audit", <>Every change a token makes is recorded under <strong>Settings → Audit log</strong>: which token, what changed, from where.</>],
          ["Last used", "Shown in the token list. The quickest way to find the ones nobody needs any more."],
          ["Revoking", "Immediate. Nothing is cached, because the token's row is read on every request."],
          ["Rotating", <>Rotate from the token's row to replace the secret while keeping the name, scopes and fencing, or create a new one and revoke the old. Tokens given an expiry stop working on their own.</>],
        ]}
      />
      <Callout kind="warning" title="Don't use one for intake">
        <p>
          An account token can read every report in the organisation. Sending bug reports needs a <D to="/collect/intake-api">project id or secret key</D>, which can only create. Never put an{" "}
          <C>ak_live_</C> token in a browser, a mobile app or anything you ship.
        </p>
      </Callout>
    </>
  );
}

function ManagementApi() {
  const urls = useUrls();
  return (
    <>
      <p>
        Everything the dashboard can do, it does through this API, and an <D to="/automate/tokens">account token</D> can do the same. There is no second, lesser "public API": the dashboard has no
        private endpoints.
      </p>
      <Endpoint method="GET" path="/api/orgs/{org}/..." auth="Session cookie or ak_live_ token" />
      <p>
        Use <C>current</C> as the organisation — for a token it means the organisation that token belongs to. Everything is JSON, request and response. Dates are ISO 8601 in UTC. Money is in pence.
      </p>

      <H2>The description is generated</H2>
      <p>
        <C>GET /openapi.json</C> is built from Hono's own route table plus a line per endpoint, with the scope each one needs read from the code that enforces it. A test fails if a route is added
        without a description, so the document can't drift from the router.
      </p>
      <Code
        title="Try it"
        lang="sh"
        code={`curl -s ${urls.app}/openapi.json | jq '.paths | keys | length'
curl -s ${urls.app}/openapi.json | jq '.paths["/api/orgs/{org}/reports"].get["x-issueit-scope"]'`}
      />
      <p>Point a client generator at it, or read it as the index to what follows.</p>

      <H2>The endpoints you'll want first</H2>
      <Table
        head={["Request", "Does", "Scope"]}
        rows={[
          [<C>GET /projects</C>, "Every project, with its ids and links", <C>projects:read</C>],
          [<C>POST /projects</C>, "Create one", <C>projects:write</C>],
          [<C>GET /reports</C>, "List reports, filtered and paged", <C>reports:read</C>],
          [<C>GET /reports/:id</C>, "One report in full, with diagnostics and deliveries", <C>reports:read</C>],
          [<C>PATCH /reports/:id</C>, "Status, priority, assignee, grouping", <C>reports:write</C>],
          [<C>GET /projects/:id/destinations</C>, "Where that project delivers", <C>destinations:read</C>],
          [<C>POST /projects/:id/destinations</C>, "Add a destination", <C>destinations:write</C>],
          [<C>GET /deliveries</C>, "The delivery log", <C>deliveries:read</C>],
          [<C>POST /deliveries/:id/retry</C>, "Try one again", <C>deliveries:write</C>],
          [<C>GET /analytics</C>, "The numbers behind the dashboard", <C>analytics:read</C>],
          [<C>GET /health</C>, <>Whether the pipeline is keeping up. See <D to="/automate/monitoring">monitoring</D>.</>, <C>analytics:read</C>],
          [<C>GET /projects/:id/config</C>, <>The project as a document. See <D to="/automate/config">config as code</D>.</>, <C>projects:read</C>],
        ]}
      />

      <H2>Listing and paging</H2>
      <p>
        Lists are cursor-paged, newest first. Ask for up to 100 at a time; the response carries <C>nextCursor</C>, or <C>null</C> when you have reached the end. Cursors are opaque and encode the
        position, so a report arriving mid-walk doesn't shift the page under you.
      </p>
      <Code
        title="Walking every open report"
        lang="js"
        code={`let cursor;
const all = [];
do {
  const url = new URL("${urls.app}/api/orgs/current/reports");
  url.searchParams.set("status", "new");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);

  const page = await fetch(url, { headers: { authorization: \`Bearer \${token}\` } }).then((r) => r.json());
  all.push(...page.reports);
  cursor = page.nextCursor;
} while (cursor);`}
      />
      <Params
        rows={[
          { name: "status", type: "new · investigating · resolved · closed", children: "Repeatable." },
          { name: "priority", type: "low · medium · high · critical", children: "Repeatable." },
          { name: "project", type: "prj_…", children: "One project." },
          { name: "q", type: "string", children: "Matches the title, the description, the reporter's address, or a report id pasted whole." },
          { name: "failing", type: "boolean", children: "Only reports with a failed delivery — the ones nobody has been told about." },
          { name: "limit", type: "1–100", children: "Defaults to 50." },
          { name: "cursor", type: "string", children: <>From the previous page's <C>nextCursor</C>.</> },
        ]}
      />

      <H2>Errors</H2>
      <p>
        The management API answers <C>{`{ "error": { "code", "message" } }`}</C> — one level, unlike intake's <C>success</C> envelope. Messages are written for people and safe to show. The codes you
        should handle are <C>unauthorised</C>, <C>forbidden</C> (which names the missing scope), <C>not_found</C>, <C>rate_limited</C> and, on the hosted service,{" "}
        <C>upgrade_required</C>. See <D to="/reference/errors">error codes</D>.
      </p>

      <H2>Live updates, rather than polling</H2>
      <p>
        <C>GET /api/orgs/current/events</C> is a server-sent event stream for one organisation: a line when a report arrives, is changed, or a delivery finishes. It is what the dashboard uses, and it
        costs a connection rather than a request every few seconds.
      </p>
      <Code
        lang="js"
        code={`const res = await fetch("${urls.app}/api/orgs/current/events", {
  headers: { authorization: \`Bearer \${token}\`, accept: "text/event-stream" },
});
for await (const chunk of res.body) {
  // Events are one JSON object per line, with a comment every 25 s to keep
  // proxies from closing an idle stream.
  process.stdout.write(chunk);
}`}
      />
      <p>
        <C>issueit tail</C> is this, printed one line per report. A fenced token can't use the stream, because it describes the whole organisation.
      </p>

      <Callout kind="tip" title="Or let an agent do it">
        <p>
          If what you want is "read the bug and fix it", you probably want <D to="/automate/mcp">the MCP server</D> rather than this API: it is the same endpoints with the arguments and the rendering
          a model needs already decided.
        </p>
      </Callout>
    </>
  );
}

function Mcp() {
  const urls = useUrls();
  return (
    <>
      <p>
        A bug report carries the console errors, the requests and the clicks from the moments before someone pressed send. That is usually enough to find the fault in the code. The Issueit MCP server
        hands all of it to a coding agent, so the path from <em>a user hit this</em> to <em>here is the line that's wrong</em> is one conversation.
      </p>

      <H2>Adding it</H2>
      <p>
        Create an <D to="/automate/tokens">account token</D> under <strong>Settings → Account tokens</strong> — the agent preset is the right starting point — then:
      </p>
      <CodeTabs
        tabs={[
          { label: "Claude Code", code: `claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… -- npx -y @issueit/mcp` },
          {
            label: "Any MCP client",
            code: `{
  "mcpServers": {
    "issueit": {
      "command": "npx",
      "args": ["-y", "@issueit/mcp"],
      "env": { "ISSUEIT_TOKEN": "ak_live_…" }
    }
  }
}`,
          },
          {
            label: "Over HTTP",
            code: `# For clients that connect to a remote server rather than running one.
POST ${urls.app}/mcp
Authorization: Bearer ak_live_…`,
          },
        ]}
      />
      <Params
        rows={[
          { name: "ISSUEIT_TOKEN", required: true, children: <>An account token, <C>ak_live_…</C>. Not a project secret key.</> },
          { name: "ISSUEIT_URL", children: <>Your own Issueit, if you host it. Defaults to the hosted service. This install: <C>{urls.app}</C>.</> },
          { name: "ISSUEIT_INGEST_KEY", children: "A project secret key, needed only to file reports into a project that refuses anonymous ones." },
        ]}
      />
      <Callout kind="note" title="The same tools, two ways in">
        <p>
          <C>POST /mcp</C> serves the identical tool set from the app itself, dispatching into its own router rather than calling itself over the network. The tools are declared once and shared, so
          the local server and the HTTP endpoint can't drift.
        </p>
      </Callout>

      <H2>What it can do</H2>
      <Table
        head={["Group", "Tools"]}
        rows={[
          [
            "Read and fix bugs",
            <>
              <C>search_reports</C>, <C>get_report</C>, <C>update_report</C>, <C>resolve_report</C>, <C>group_reports</C>, <C>separate_report</C>, <C>create_report</C>
            </>,
          ],
          [
            "Set a project up",
            <>
              <C>setup_project</C>, <C>get_install_snippet</C>, <C>configure_widget</C>, <C>diagnose_install</C>
            </>,
          ],
          [
            "Send reports somewhere",
            <>
              <C>list_providers</C>, <C>list_connections</C>, <C>list_destinations</C>, <C>create_destination</C>, <C>update_destination</C>, <C>test_destination</C>
            </>,
          ],
          [
            "Keep delivery honest",
            <>
              <C>list_deliveries</C>, <C>retry_delivery</C>
            </>,
          ],
          [
            "Decide what to work on",
            <>
              <C>get_analytics</C>, <C>whoami</C>
            </>,
          ],
        ]}
      />
      <p>
        It also offers prompts for the jobs people actually bring — <C>triage</C>, <C>fix_bug</C>, <C>set_up_bug_reporting</C>, <C>weekly_digest</C> — and resources, so a single report (
        <C>issueit://report/{"{id}"}</C>) or the API reference can be attached to a conversation by hand.
      </p>

      <H3>The one that matters</H3>
      <p>
        <C>get_report</C> returns the whole thing as Markdown: what the person said, the console errors with their stacks — mapped through{" "}
        <D to="/reports/releases">source maps</D> where you have uploaded them — the requests the page made with statuses and timings, the clicks, the attachments, and where it was delivered. An
        agent reading that has what a developer would have after twenty minutes of asking questions.
      </p>

      <H2>A session that works</H2>
      <Code
        title="What to ask for"
        code={`"What critical bugs came in today?"
   → search_reports(status: new, priority: critical, since: today)

"Look at #118 and fix it."
   → get_report(118), then the agent reads your code and edits it

"Resolve it and tell the reporters."
   → resolve_report(118) — which also resolves its duplicates and emails
     everyone in the group who asked to hear`}
      />
      <p>
        The last step is the one worth having. Resolving in Issueit closes the loop: the duplicates go with it, and the people who reported it hear. See{" "}
        <D to="/reports/emails">emails to reporters</D>.
      </p>

      <H2>What an agent can't do</H2>
      <Facts
        rows={[
          ["Exceed its token", <>Every tool goes through the same <D to="/automate/tokens">scope rules</D> as the API. A missing scope comes back as a plain refusal naming it, rather than a silent failure.</>],
          ["Mint or revoke tokens", "Never, with any scope."],
          ["See other organisations", "A token belongs to one, and can be fenced to some of its projects."],
          ["Act unrecorded", <>Every change is in the <strong>Audit log</strong>, attributed to that token.</>],
        ]}
      />
      <Callout kind="tip" title="Start read-only">
        <p>
          A token with <C>reports:read</C> and <C>analytics:read</C> is enough for an agent to triage and explain. Add <C>reports:write</C> when you want it to resolve things, and
          <C>destinations:write</C> only if you want it setting projects up.
        </p>
      </Callout>
    </>
  );
}

function Cli() {
  const urls = useUrls();
  return (
    <>
      <p>
        <C>issueit</C> is the command line: watch bugs arrive, forward webhooks to your laptop, upload source maps, keep a project's settings in your repository, and fail a CI job when delivery is
        behind.
      </p>
      <Code
        title="No install needed"
        lang="sh"
        code={`npx issueit login       # a code you approve in the dashboard; nothing secret is typed here
npx issueit init        # creates the project, writes .issueit.json, prints the snippet
npx issueit tail        # watch the first report arrive`}
      />

      <H2>Signing in</H2>
      <p>
        <C>issueit login</C> shows a short code which you approve in the dashboard, so no token is ever pasted into a terminal or left in a shell history. Credentials go under{" "}
        <C>~/.config/issueit</C>, or wherever <C>ISSUEIT_CONFIG_HOME</C> says.
      </p>
      <p>
        In CI there is nobody to approve anything, so set <C>ISSUEIT_TOKEN</C> to an <D to="/automate/tokens">account token</D> instead and skip signing in.
      </p>

      <H2>Commands</H2>
      <Table
        head={["Command", "Does"]}
        rows={[
          [<C>login · logout · whoami</C>, <>Signing in. In CI, set <C>ISSUEIT_TOKEN</C> and skip it.</>],
          [<C>init</C>, "Create the project, detect the framework, print the snippet."],
          [<C>ls</C>, <>List reports: <C>--status</C>, <C>--priority</C>, <C>--q</C>, <C>--since</C>, <C>--failing</C>.</>],
          [<C>show &lt;report&gt;</C>, "One report in full, with the console errors, requests and steps captured before it was sent."],
          [<C>resolve &lt;report&gt;</C>, "Mark a bug fixed. Also resolves its duplicates and emails whoever asked."],
          [<C>file "&lt;title&gt;"</C>, <>File a bug from here. A description can be piped in: <C>git log -1 | issueit file "…"</C>.</>],
          [<C>open [report]</C>, "Open it in a browser."],
          [<C>tail</C>, "Watch reports arrive, one line each."],
          [<C>listen --forward &lt;url&gt;</C>, "Forward reports to a URL on this machine, signed exactly as a real webhook."],
          [<C>pull · push</C>, <>A project's settings as a file you can commit. <C>push --dry-run</C> shows the difference.</>],
          [<C>sourcemaps upload &lt;dir&gt;</C>, "Upload a build's maps so minified stacks read as your own files."],
          [<C>deliveries · retry</C>, "Why a report never arrived, and making it try again."],
          [<C>health</C>, "Queue depth and failures. Exits non-zero when delivery is behind."],
          [<C>doctor</C>, "What's wrong with this project, worst first."],
        ]}
      />
      <p>
        Most commands take <C>--project</C>. In a directory with a <C>.issueit.json</C> — written by <C>init</C> — they don't need it.
      </p>

      <H2>Four things it's genuinely good at</H2>
      <H3>Receiving a webhook on localhost</H3>
      <p>
        You can't, which is the awkward part of writing one. <C>listen</C> forwards reports to a URL on your machine, signed the same way the real thing signs them, so the verification code you write
        here is the code you ship.
      </p>
      <Code lang="sh" code={`issueit listen --forward http://localhost:3000/hooks --secret whsec_local`} />

      <H3>Filing a bug from a failing test</H3>
      <p>A test that fails in CI at three in the morning can file itself, with the output attached, fingerprinted so a week of the same failure is one bug.</p>
      <Code
        lang="sh"
        code={`npm test 2>&1 | tail -40 | issueit file "Nightly suite: checkout tests failing" --priority high`}
      />

      <H3>Failing the pipeline when delivery is behind</H3>
      <Code
        lang="sh"
        code={`issueit health   # prints the queue, the failures and the paused destinations
                 # exits 1 when the oldest delivery has been waiting too long`}
      />

      <H3>Reading a bug without leaving the terminal</H3>
      <Code
        lang="sh"
        code={`issueit ls --status new --priority critical
issueit show 118        # the whole report: context, console, network, steps
issueit resolve 118`}
      />

      <H2>In CI</H2>
      <Code
        title="A deploy job"
        lang="sh"
        code={`export ISSUEIT_TOKEN=ak_live_…
export ISSUEIT_URL=${urls.app}      # only if you host Issueit yourself

issueit sourcemaps upload dist --release "$GITHUB_SHA" --prefix assets
issueit push --prune                 # apply the settings in this repository
issueit health                       # fail the job if delivery is behind`}
      />

      <H2>Environment</H2>
      <Params
        rows={[
          { name: "ISSUEIT_TOKEN", children: "An account token. Overrides the saved sign-in." },
          { name: "ISSUEIT_URL", children: "Your Issueit, if you host it." },
          { name: "ISSUEIT_INGEST_KEY", children: <>A project secret key, for <C>file</C> into a project that refuses anonymous reports.</> },
          { name: "ISSUEIT_CONFIG_HOME", children: <>Where credentials are kept. Defaults to <C>~/.config/issueit</C>.</> },
          { name: "NO_COLOR", children: "Turns colour off. It is off anyway when output is piped." },
        ]}
      />
    </>
  );
}

function ConfigAsCode() {
  return (
    <>
      <p>
        A project's settings are a document with no ids in it: destinations matched by name, connections by account. So one file applies to staging and production, lives in your repository, and is
        reviewed in a pull request like everything else.
      </p>
      <Endpoint method="GET" path="/api/orgs/current/projects/{id}/config" auth="projects:read" />

      <H2>The round trip</H2>
      <Code
        lang="sh"
        code={`issueit pull                      # write issueit.config.json
issueit push --dry-run            # show exactly what would change
issueit push                      # apply it
issueit push --prune              # apply, removing what the file doesn't mention`}
      />
      <Facts
        rows={[
          ["What's in it", "The widget's appearance and questions, allowed sites, grouping and redaction rules, reporter email settings, destinations with their rules and policies."],
          ["What isn't", "Ids, secrets, connected credentials, reports. A connection is named by its account, so the file is safe to commit."],
          [<C>--dry-run</C>, "Prints the difference and changes nothing. Worth putting in the pull request."],
          [<C>--prune</C>, "Deletes destinations the file doesn't mention. Without it, applying is additive."],
          ["Cost", <>Reading is <C>projects:read</C>; applying is <C>destinations:write</C>, because it can add destinations.</>],
        ]}
      />

      <H2>Why it has no ids</H2>
      <p>
        An export full of ids only ever applies back to the project it came from, which makes it a backup rather than a configuration. Matching by name means the file you pulled from staging applies
        to production: the same destination names, the same rules, pointed at whatever those names mean there.
      </p>
      <Code
        title="issueit.config.json, shortened"
        lang="json"
        code={`{
  "widget": { "title": "Report a problem", "theme": "auto", "captureConsole": true },
  "allowedOrigins": ["https://example.com", "https://app.example.com"],
  "rules": {
    "grouping": { "titlePatterns": ["order #\\\\d+"], "pathDepth": 2 },
    "redaction": ["\\\\bACC-\\\\d{6}\\\\b"]
  },
  "destinations": [
    {
      "name": "acme/web",
      "provider": "github",
      "connection": "acme-bot",
      "target": { "repo": "acme/web", "labels": ["bug", "from-users"] },
      "events": ["report.created"],
      "rule": {},
      "policy": { "titlePrefix": "[web]" }
    },
    {
      "name": "#incidents",
      "provider": "slack",
      "connection": "Acme workspace",
      "target": { "channel": "#incidents" },
      "rule": { "priorities": ["critical"] }
    }
  ]
}`}
      />

      <H2>In a pipeline</H2>
      <Code
        title="On a pull request"
        lang="sh"
        code={`export ISSUEIT_TOKEN=ak_live_…
issueit push --dry-run --project web | tee issueit.plan
# fail the check if the plan isn't empty and nobody said so
test ! -s issueit.plan || grep -q "\\[issueit ok\\]" "$PR_BODY"`}
      />
      <Code
        title="On merge"
        lang="sh"
        code={`issueit push --prune --project web`}
      />
      <Callout kind="warning" title="--prune deletes">
        <p>
          It removes destinations the file doesn't name, and a deleted destination takes its delivery history with it. Run <C>--dry-run</C> first, always, and keep the file the only place
          destinations are added once you've started.
        </p>
      </Callout>

      <H2>Staging and production</H2>
      <Steps>
        <Step title="Make the change in staging, by hand">
          <p>The dashboard is better than a text editor for finding out what you want.</p>
        </Step>
        <Step title="Pull it">
          <p>
            <C>issueit pull --project staging</C>, and look at the diff.
          </p>
        </Step>
        <Step title="Apply it to production">
          <p>
            <C>issueit push --project web --dry-run</C>, read what it says, then apply. The names in the file resolve to production's own connections and targets.
          </p>
        </Step>
      </Steps>
      <Callout kind="tip" title="It's also the fastest backup">
        <p>
          A project's whole configuration in one file, committed. Recreating a project someone deleted is <C>issueit push</C> rather than an afternoon of remembering.
        </p>
      </Callout>
    </>
  );
}

function Monitoring() {
  const urls = useUrls();
  return (
    <>
      <p>
        "Is the server up" is the wrong question for a pipeline. The right one is <em>how old is the oldest thing still waiting</em>, because an outbox that has stopped draining looks exactly like a
        healthy one from the outside: reports keep arriving.
      </p>

      <H2>Two endpoints</H2>
      <Table
        head={["Endpoint", "Auth", "For"]}
        rows={[
          [<C>GET /health</C>, "None", <>A database round trip. Point load balancers and uptime checks at it. Answers <C>{`{ "ok": true }`}</C> or a 500.</>],
          [<C>GET /api/orgs/current/health</C>, <C>analytics:read</C>, "Whether your pipeline is keeping up. This is the one an alert should ask."],
        ]}
      />

      <H2>The organisation's health</H2>
      <Code
        lang="sh"
        code={`curl -s ${urls.app}/api/orgs/current/health -H "Authorization: Bearer $ISSUEIT_TOKEN"`}
      />
      <Code
        title="Response"
        lang="json"
        code={`{
  "status": "degraded",
  "problems": [
    "1 destination is paused after repeated failures."
  ],
  "deliveries": {
    "pending": 0, "retrying": 3,
    "failedLastDay": 12, "deliveredLastDay": 418,
    "failureRate": 0.0279, "oldestWaitingSeconds": 44
  },
  "destinations": { "enabled": 4, "paused": 1 },
  "emails": { "pending": 0, "failedLastDay": 0 },
  "reports": { "lastDay": 431 },
  "checkedAt": "2026-10-31T09:14:02.881Z"
}`}
      />
      <p>
        <C>status</C> is a judgement rather than a number, so you can alert on it directly:
      </p>
      <Facts
        rows={[
          [<C>ok</C>, "Nothing worth saying."],
          [<C>degraded</C>, "Work is moving, but some of it is failing: a paused destination, a high failure rate, reporter email failing, or no destination enabled at all."],
          [<C>behind</C>, "A delivery has been waiting more than fifteen minutes. The queue isn't draining. This is the one worth waking someone for."],
        ]}
      />
      <p>
        <C>problems</C> is a list of sentences in plain English, which makes a good alert body: paste it in and whoever is on call already knows what is wrong.
      </p>

      <H3>From a terminal, or CI</H3>
      <Code
        lang="sh"
        code={`issueit health   # prints the same thing, readable
                 # exits 1 when status isn't "ok", so a job can fail on it`}
      />

      <H2>Prometheus</H2>
      <p>
        Set <C>METRICS_TOKEN</C> and <C>GET /metrics</C> serves install-wide numbers in Prometheus format, with that value as the bearer token. Unset means 404 — an unauthenticated count of
        everyone's reports is nobody's idea of fine.
      </p>
      <Code
        title="prometheus.yml"
        lang="yaml"
        code={`scrape_configs:
  - job_name: issueit
    metrics_path: /metrics
    static_configs:
      - targets: ["issueit.internal:8380"]
    authorization:
      credentials: "\${METRICS_TOKEN}"`}
      />
      <Table
        head={["Metric", "Type", "Is"]}
        rows={[
          [<C>issueit_organisations</C>, "gauge", "Organisations on this install."],
          [<C>issueit_projects</C>, "gauge", "Projects on this install."],
          [<C>issueit_reports_total</C>, "counter", "Reports ever received."],
          [<C>issueit_reports_last_hour</C>, "gauge", "Reports received in the last hour."],
          [<C>issueit_reports_open</C>, "gauge", "Reports still new or being investigated."],
          [<C>issueit_deliveries_waiting</C>, "gauge", "Deliveries queued or in flight."],
          [<C>issueit_deliveries_retrying</C>, "gauge", "Deliveries waiting for another attempt."],
          [<C>issueit_deliveries_failed_total</C>, "counter", "Deliveries that gave up."],
          [<C>issueit_deliveries_delivered_total</C>, "counter", "Deliveries that succeeded."],
          [<C>issueit_delivery_oldest_waiting_seconds</C>, "gauge", "Age of the oldest delivery still waiting."],
          [<C>issueit_destinations_paused</C>, "gauge", "Destinations Issueit paused after repeated failures."],
          [<C>issueit_emails_waiting</C>, "gauge", "Reporter emails queued."],
          [<C>issueit_attachment_bytes</C>, "gauge", "Bytes of stored attachments."],
        ]}
      />

      <H3>Alerts worth having</H3>
      <Code
        title="rules.yml"
        lang="yaml"
        code={`- alert: IssueitDeliveryBehind
  expr: issueit_delivery_oldest_waiting_seconds > 900
  for: 5m
  annotations:
    summary: Issueit deliveries are not draining

- alert: IssueitDestinationPaused
  expr: issueit_destinations_paused > 0
  for: 15m
  annotations:
    summary: A destination is paused, so reports are collected but not delivered`}
      />

      <H2>Live events</H2>
      <p>
        <C>GET /api/orgs/current/events</C> is a server-sent stream of what is happening now: reports arriving, statuses changing, deliveries finishing. It is what the dashboard listens to, and it's
        how you would build a wall display without polling. See <D to="/automate/management-api">the management API</D>.
      </p>
      <Callout kind="note" title="One request, not a dashboard">
        <p>
          The dashboard's own numbers come from a single <C>/analytics</C> call rather than a request per card, so if you are building something similar, read that endpoint rather than assembling it
          from lists.
        </p>
      </Callout>
    </>
  );
}

export const automatePages: Record<string, ComponentType> = {
  "/automate/tokens": Tokens,
  "/automate/management-api": ManagementApi,
  "/automate/mcp": Mcp,
  "/automate/cli": Cli,
  "/automate/config": ConfigAsCode,
  "/automate/monitoring": Monitoring,
};
