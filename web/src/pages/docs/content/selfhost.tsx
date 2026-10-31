import type { ComponentType } from "react";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Code, D, Facts, H2, H3, Step, Steps, Table } from "../kit";

/** Self-hosting: installing it, connecting services, running it, and what the editions are. */

function Install() {
  const urls = useUrls();
  return (
    <>
      <p>
        Issueit is one container and a PostgreSQL database. No queue to run, no object store, no cache. The self-hosted edition has every feature switched on and the only limits are the ones you set.
      </p>

      <H2>What you need</H2>
      <Facts
        rows={[
          ["A machine", "Anything that runs Docker. A single small VPS is enough for most installs; the database is the thing that eventually wants more disk."],
          ["Docker Compose", "The repository ships a compose file with PostgreSQL 17 and the app."],
          ["A domain, and HTTPS", <>Not strictly required, but session cookies are only marked secure when <C>APP_URL</C> is <C>https</C>, and OAuth connections need a real redirect URL.</>],
          ["A mail server", <>Strongly recommended, and easy to forget. See below.</>],
        ]}
      />

      <H2>Installing</H2>
      <Steps>
        <Step title="Fill in the environment">
          <Code
            lang="sh"
            code={`cp .env.example .env
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 32   # SECRET_KEY
openssl rand -base64 32   # POSTGRES_PASSWORD`}
          />
          <p>
            Then set <C>APP_URL</C> to the address people will use. Those four are the whole requirement; everything else has a working default. See{" "}
            <D to="/reference/environment">environment variables</D>.
          </p>
        </Step>
        <Step title="Start it">
          <Code lang="sh" code={`docker compose up -d --build`} />
          <p>Migrations run on start, so there is no separate step and no first-run wizard.</p>
        </Step>
        <Step title="Create the first account">
          <p>
            Open <C>APP_URL</C> and sign up. The first account is an owner of its own organisation. Once your team is in, consider <C>ALLOW_SIGNUP=false</C> to make the install
            invitation-only.
          </p>
        </Step>
        <Step title="Set up mail, before anyone else signs up">
          <Code lang="sh" code={`SMTP_URL=smtps://user:password@smtp.example.com:465
SMTP_FROM=Issueit <no-reply@example.com>`} />
          <p>
            Password resets, address confirmations, invitations, report alerts, digests and reporter mail all go through it. Without it, a forgotten password can only be fixed in the database. The
            server logs a warning on start and the settings pages say so, but it is still the most common thing to leave until later.
          </p>
        </Step>
        <Step title="Create a project and prove it works">
          <p>
            Add the widget snippet to a page, or send one report with <C>curl</C>, then add a destination and use the test it offers. <C>npx issueit doctor</C> checks the three things that
            quietly go wrong.
          </p>
          <Code
            lang="sh"
            code={`curl -X POST ${urls.drop}/v1/prj_abc123/reports \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Hello from curl"}'`}
          />
        </Step>
      </Steps>

      <H2>Behind a proxy</H2>
      <p>
        If anything sits in front of Issueit — nginx, Caddy, Traefik, a Cloudflare tunnel — set <C>TRUST_PROXY=true</C> so rate limits and the dashboard's map see the visitor's address rather than
        your proxy's. Without it every visitor shares one per-IP limit, which is the kind of thing you find out about during an incident.
      </p>
      <Code
        title="nginx"
        code={`location / {
  proxy_pass http://127.0.0.1:8380;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # The dashboard and the CLI both use server-sent events.
  proxy_buffering off;
  proxy_read_timeout 1h;
}`}
      />
      <Callout kind="note" title="Server-sent events">
        <p>
          The live inbox and <C>issueit tail</C> hold a long-lived response open. A proxy that buffers or times out after a minute will keep working, but the dashboard will reconnect constantly.
          Turning buffering off on that route is worth doing.
        </p>
      </Callout>

      <H2>Splitting the hosts</H2>
      <p>
        One origin is the default and is fine. If you'd rather separate them — a CDN in front of the widget, intake on its own name — set <C>DROP_URL</C>, <C>CDN_URL</C>, <C>DOCS_URL</C> and{" "}
        <C>MARKETING_URL</C>, and point them all at the same app. They only decide which addresses Issueit writes into snippets, emails and links; nothing routes by hostname.
      </p>
      <Table
        head={["Variable", "Serves"]}
        rows={[
          [<C>DROP_URL</C>, <>Intake: <C>/v1/…</C> and the hosted form.</>],
          [<C>CDN_URL</C>, <C>/widget.js</C>],
          [<C>DOCS_URL</C>, "These pages."],
          [<C>MARKETING_URL</C>, "The public site."],
        ]}
      />

      <H2>Keeping it up to date</H2>
      <Code lang="sh" code={`git pull\ndocker compose up -d --build`} />
      <p>
        Migrations run on start and are forward-only. Take a backup first — see <D to="/self-host/operations">backups and operations</D> — and expect a few seconds of downtime while the container
        restarts, during which intake is unavailable. Nothing is lost: a widget whose request fails tells the person to try again.
      </p>
    </>
  );
}

function OAuthApps() {
  const urls = useUrls();
  return (
    <>
      <p>
        Every integration can be connected with a token pasted from the service. Registering an OAuth app adds the nicer option — your team connects an account by signing in — and is the difference
        between an integration anybody can set up and one that needs a developer.
      </p>

      <H2>The shape of it</H2>
      <Facts
        rows={[
          ["Redirect URL", <><C>{`${urls.app}/api/oauth/{service}/callback`}</C>, with the service's id in place of the placeholder.</>],
          ["Where the secret goes", <>Your <C>.env</C>, as <C>{"<SERVICE>_CLIENT_ID"}</C> and <C>{"<SERVICE>_CLIENT_SECRET"}</C>. Restart to pick them up.</>],
          ["What happens if you don't", "The dashboard offers the token method for that service instead, and says nothing is missing."],
          ["Per install, not per organisation", "One app serves everybody on this install."],
        ]}
      />

      <H2>Each service</H2>
      <Table
        head={["Service", "Register at", "Variables", "Notes"]}
        rows={[
          ["GitHub", "Settings → Developer settings → OAuth Apps", <C>GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET</C>, <>Asks for <C>repo</C> so it can open issues.</>],
          [
            "GitLab",
            "User settings → Applications",
            <>
              <C>GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET</C>, optional <C>GITLAB_URL</C>
            </>,
            <>Set <C>GITLAB_URL</C> for a self-managed GitLab. A private address also needs <C>WEBHOOK_ALLOW_PRIVATE</C>.</>,
          ],
          ["Linear", "Settings → API → OAuth applications", <C>LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET</C>, "Issue priorities map to Linear's own scale."],
          ["Jira", "Atlassian developer console → OAuth 2.0 (3LO)", <C>JIRA_CLIENT_ID, JIRA_CLIENT_SECRET</C>, "Grant the Jira platform REST API scopes for reading projects and creating issues."],
          ["ClickUp", "Settings → Apps", <C>CLICKUP_CLIENT_ID, CLICKUP_CLIENT_SECRET</C>, ""],
          ["Trello", "trello.com/app-key", <C>TRELLO_API_KEY</C>, <>Trello authorises against a key rather than a secret, and the key's settings must allow your origin.</>],
          ["Slack", "api.slack.com → Your apps", <C>SLACK_CLIENT_ID, SLACK_CLIENT_SECRET</C>, <>Needs <C>chat:write</C> and channel listing.</>],
          ["Discord", "Developer portal → Applications", <C>DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET</C>, "A channel webhook URL works without an app at all."],
          ["Notion", "Integrations → New integration", <C>NOTION_CLIENT_ID, NOTION_CLIENT_SECRET</C>, "The target database has to be shared with the integration."],
        ]}
      />

      <H3>Testing one</H3>
      <Steps>
        <Step title="Set the variables and restart">
          <Code lang="sh" code={`docker compose up -d`} />
        </Step>
        <Step title="Connect">
          <p>
            <strong>Settings → Connections → Connect</strong>. The service appears with a sign-in button where an app is configured. If it still only offers a token, the variables aren't reaching
            the container — check the compose file passes them through.
          </p>
        </Step>
        <Step title="Validate it">
          <p>A connection can be revalidated from its row, which is a cheap way to find out whether a token has been revoked without filing a bug to test it.</p>
        </Step>
      </Steps>

      <H2>Credentials at rest</H2>
      <p>
        Connected credentials are encrypted with <C>ENCRYPTION_KEY</C> (AES-256-GCM) before they are stored. Back that key up with the database: restoring one without the other leaves every
        connection unusable and every account to be reconnected by hand. It is the single most important string in your <C>.env</C>.
      </p>
      <Callout kind="tip" title="Email services count too">
        <p>
          Connecting Resend, Postmark, SendGrid or any SMTP server as an email connection lets projects send reporter mail from your own domain, instead of through the install's{" "}
          <C>SMTP_URL</C>. See <D to="/reports/emails">emails to reporters</D>.
        </p>
      </Callout>
    </>
  );
}

function Operations() {
  return (
    <>
      <p>Three things matter: that you have backups, that you have tried restoring one, and that you know when delivery stops. Everything else is ordinary.</p>

      <H2>Backups</H2>
      <p>The script takes the three things that matter — the database, the attachment files and the environment — into a dated directory, keeps 30 days, and can be run from cron.</p>
      <Code
        lang="sh"
        code={`./scripts/backup.sh                       # into ./backups
./scripts/restore.sh backups/<directory>  # put one back`}
      />
      <Code
        title="From cron, as the user that owns the compose project"
        code={`15 3 * * *  cd /home/you/srv/IssueIt && ./scripts/backup.sh >> backups/backup.log 2>&1`}
      />
      <Callout kind="warning" title="Copy them off the machine">
        <p>
          A backup on the same disk as the database is not a backup. And test a restore before you need one — the first time you run <C>restore.sh</C> should not be the day the disk died.
        </p>
      </Callout>
      <Facts
        rows={[
          [
            <C>ENCRYPTION_KEY</C>,
            <>
              The one that matters most. It decrypts every stored integration credential; without it each connected account has to be reconnected by hand. It is in <C>.env</C>, which is why the
              backup takes that too.
            </>,
          ],
          [<C>SECRET_KEY</C>, <>Signs attachment links. Losing it invalidates links already sitting inside issues, though fresh ones are minted whenever a report is read.</>],
          ["The database", "Everything else: organisations, projects, reports, destinations, the delivery queue."],
          [<C>DATA_DIR</C>, "The attachment files themselves. Screenshots are usually most of your disk."],
        ]}
      />

      <H2>Upgrading</H2>
      <Steps>
        <Step title="Back up first">
          <p>
            <C>./scripts/backup.sh</C>. Migrations are forward-only; there is no down path.
          </p>
        </Step>
        <Step title="Pull and rebuild">
          <Code lang="sh" code={`git pull && docker compose up -d --build`} />
        </Step>
        <Step title="Check it came back">
          <p>
            <C>curl -s localhost:8380/health</C> for the database, and the organisation's <D to="/automate/monitoring">health endpoint</D> for the queue. A restart leaves claimed deliveries locked
            for up to two minutes, after which they become due again on their own.
          </p>
        </Step>
      </Steps>

      <H2>The daily round</H2>
      <p>
        Once a day at <C>JOBS_HOUR_UTC</C>: <D to="/reports/retention">retention</D> deletes what it should, digests go out, and — on a hosted install — trials end. It runs in the worker, so an
        install with no worker process does none of it.
      </p>

      <H2>Running the worker separately</H2>
      <p>
        <C>ROLE</C> decides what a process does. The default, <C>all</C>, is both. Splitting them lets you restart the API without pausing delivery, and run several workers when one isn't keeping up
        — they claim rows with <C>SKIP LOCKED</C>, so there is nothing to coordinate.
      </p>
      <Code
        title="docker-compose.override.yml"
        lang="yaml"
        code={`services:
  app:
    environment:
      ROLE: api
  worker:
    image: issueit
    environment:
      ROLE: worker
    deploy:
      replicas: 2`}
      />
      <Callout kind="warning" title="One of them has to be a worker">
        <p>
          With every process on <C>ROLE=api</C>, reports are collected and never delivered, and nothing complains loudly. <C>/health</C> is about the database; the organisation's health endpoint is
          about the queue, and it is the one that would have told you.
        </p>
      </Callout>

      <H2>What to watch</H2>
      <Table
        head={["Signal", "Means"]}
        rows={[
          [<C>GET /health</C>, "The process is up and the database answers. For a load balancer."],
          [<C>GET /api/orgs/current/health</C>, <>Whether the pipeline is keeping up. <C>behind</C> is the one worth an alert.</>],
          [<C>/metrics</C>, <>Install-wide numbers in Prometheus format, once <C>METRICS_TOKEN</C> is set.</>],
          [<C>issueit health</C>, "The same, in a terminal, exiting non-zero when delivery is behind."],
          ["Disk", <>Attachments under <C>DATA_DIR</C>, and the database. Retention is what keeps both from growing for ever.</>],
          ["The paused-destination email", "Reports arriving and nothing leaving. Make sure somebody gets it."],
        ]}
      />

      <H3>Scaling, when you get there</H3>
      <Facts
        rows={[
          ["More workers", <>Several processes on <C>ROLE=worker</C>. Delivery is the part that waits on other people's APIs.</>],
          ["More API processes", <>Fine, with one caveat: rate-limit windows are held in memory per process, so <em>n</em> processes mean roughly <em>n</em> times the per-visitor allowance.</>],
          ["A bigger database", "It is the queue, the store and the event bus. It is the thing to give disk and memory to."],
          ["Shorter retention", "The cheapest way to make a large install smaller."],
        ]}
      />
    </>
  );
}

function Editions() {
  return (
    <>
      <p>
        There are two editions of Issueit, built from one codebase, and which one you are running is decided by a single variable. Nothing is crippled in either: <C>EDITION</C> only decides whether
        plans exist.
      </p>

      <H2>The difference</H2>
      <Table
        head={["", "Self-hosted", "Hosted"]}
        rows={[
          [<C>EDITION</C>, <C>selfhost</C> + " (the default)", <C>hosted</C>],
          ["Features", "All of them, on", "All of them, by plan"],
          ["Limits", <>Your own, from <D to="/reference/environment">environment variables</D></>, "The plan's, capped by the operator's"],
          ["Plans and billing", "Present in the code and inert", "Trials, Stripe checkout, the customer portal"],
          ["Retention", <>Yours, or off entirely with <C>RETENTION_ENABLED=false</C></>, "The plan's: a week to a year"],
          ["Integrations", "The hand-written providers", "Those plus the token-based catalogue"],
          ["Licence", "AGPL-3.0", "Not distributed"],
        ]}
      />
      <p>
        <C>GET /api/plans</C> says which edition an install is and lists what it sells. On a self-hosted install the list is empty, which is how the dashboard knows not to show a billing page.
      </p>

      <H2>What the self-hosted edition leaves out</H2>
      <p>
        One thing: the token-based integration catalogue — the hundred-odd services described as short specifications. GitHub, GitLab, Linear, Jira, ClickUp, Trello, Notion, Slack, Discord and
        webhooks are all there, and a webhook plus an automation platform reaches anything else. <D to="/reference/catalogue">The catalogue endpoint</D> tells you what any given install actually has,
        which is why reading it beats hard-coding a list.
      </p>

      <H2>The licence</H2>
      <Facts
        rows={[
          ["The self-hosted edition", "AGPL-3.0. Run it, change it, run your changes — and if you offer it to others over a network, share the source."],
          [
            "The client libraries",
            <>
              <C>issueit</C>, <C>@issueit/mcp</C>, <C>@issueit/node</C> and <C>@issueit/react</C> stay MIT, so they can be vendored into anything.
            </>,
          ],
          ["The hosted service", "Built from a private repository and not licensed for redistribution."],
        ]}
      />

      <H2>Moving between them</H2>
      <p>
        Nothing in the data distinguishes the two, so switching is a variable and a restart. Going from self-hosted to hosted turns plans on, which means every organisation lands on one — including
        yours, and the free plan is small. Decide what your own organisation should be on before you flip it.
      </p>
      <Code
        title="Before turning plans on"
        lang="sql"
        code={`update organisations set plan = 'business', trial_ends_at = null where id = 'org_…';`}
      />
      <p>
        Hosted also needs <C>STRIPE_SECRET_KEY</C>, <C>STRIPE_WEBHOOK_SECRET</C> and a price id per plan and period, with Stripe's webhook pointed at <C>{"{APP_URL}"}/api/billing/webhook</C>. The
        webhook is the only thing that ever writes a plan.
      </p>
      <Callout kind="note" title="Exporting the self-hosted edition">
        <p>
          <C>node scripts/publish-oss.mjs --out ../issueit-selfhost --verify</C> copies an allowlist of the tree into its own directory under AGPL-3.0, and refuses to guess: a new top-level
          directory has to be listed before it will run. <C>--verify</C> installs, typechecks, tests and builds the result on its own.
        </p>
      </Callout>
    </>
  );
}

export const selfHostPages: Record<string, ComponentType> = {
  "/self-host/install": Install,
  "/self-host/oauth": OAuthApps,
  "/self-host/operations": Operations,
  "/self-host/editions": Editions,
};
