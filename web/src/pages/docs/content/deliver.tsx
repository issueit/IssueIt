import type { ComponentType } from "react";
import { BrandIcon } from "../../../components/ui/BrandIcon";
import { categoryLabels, useCatalogue } from "../../../features/integrations/categories";
import type { ProviderCategory } from "../../../lib/types";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Code, CodeTabs, D, Endpoint, Facts, H2, H3, Params, Step, Steps, Table } from "../kit";

/** Deliver: where reports go, how hard Issueit tries, and what to do when it fails. */

/** The live catalogue, so this page can't claim a service Issueit doesn't have. */
function CatalogueList() {
  const catalogue = useCatalogue();
  const list = catalogue.data ?? [];
  if (!list.length) return null;
  const groups = (Object.keys(categoryLabels) as ProviderCategory[]).map((c) => [c, list.filter((p) => p.category === c)] as const).filter(([, l]) => l.length);
  return (
    <div className="dp-catalogue">
      {groups.map(([c, l]) => (
        <section key={c}>
          <h4>
            {categoryLabels[c].plural}
            <span>{l.length}</span>
          </h4>
          <div>
            {l.map((p) => (
              <span key={p.id} title={p.summary}>
                <BrandIcon provider={p.id} name={p.name} size={13} />
                {p.name}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Destinations() {
  return (
    <>
      <p>
        A destination is somewhere reports go. A project can have any number of them, each with its own connection, filters and{" "}
        <D to="/deliver/routing">policy</D>. By default a new destination receives every new report; narrowing it is a filter you add, not a thing you have to do first.
      </p>

      <H2>Adding one</H2>
      <Steps>
        <Step title="Connect an account">
          <p>
            On the project's <strong>Integrations</strong> tab, choose a service. Where Issueit has an OAuth app for it, you sign in and it's done; otherwise it asks for a token, an API key or a
            webhook URL from that service. Connections belong to the organisation, so the next project can reuse this one.
          </p>
        </Step>
        <Step title="Choose a target">
          <p>Services that have somewhere to put things — a repository, a board, a channel, a database, a project — ask which one, and list what the connected account can see.</p>
        </Step>
        <Step title="Send the test report">
          <p>
            Issueit offers one, and it goes through the whole pipeline: the same queue, the same worker, the same credentials. A tick means the next real report will arrive too. Test deliveries are
            marked as such and left out of your counts.
          </p>
        </Step>
      </Steps>

      <H2>The ones with sign-in</H2>
      <p>These ten were written by hand, because they create something structured rather than posting a message, and because signing in is nicer than pasting a token.</p>
      <Table
        head={["Service", "Creates", "Connect with"]}
        rows={[
          ["GitHub Issues", "An issue, with optional labels", "GitHub sign-in or a fine-grained token"],
          ["GitLab Issues", "An issue, with optional labels", "GitLab sign-in or a personal access token"],
          ["Linear", "An issue with matching priority", "Linear sign-in or a personal API key"],
          ["Jira Cloud", "A Bug (or Task) in a project", "Atlassian sign-in or an API token"],
          ["ClickUp", "A task with matching priority", "ClickUp sign-in or a personal token"],
          ["Trello", "A card at the top of a list", "Trello authorisation or an API key and token"],
          ["Notion", "A page in a database", "Notion sign-in or an internal integration secret"],
          ["Slack", "A message in a channel", "Slack sign-in or an incoming webhook URL"],
          ["Discord", "A message in a channel", "Discord sign-in or a channel webhook URL"],
          ["Webhook", "A signed JSON event", "Any HTTPS endpoint"],
        ]}
      />
      <p>
        On a <D to="/self-host/oauth">self-hosted install</D>, sign-in appears for a service once you have registered an OAuth app and set its client id and secret. Without one, the token method is
        offered instead, and nothing else changes.
      </p>

      <H2>Everything else</H2>
      <p>
        The rest connect with a token, key or webhook URL from that service, and are described as short specifications rather than code — which is why there are so many of them. This list is read
        live from <D to="/reference/catalogue">the catalogue</D>, so it is this install's actual list rather than a copy.
      </p>
      <CatalogueList />

      <H2>What a destination sends</H2>
      <p>
        Issueit shapes the report to suit the service: a tracker gets a title, a body with the context and the diagnostics, labels and a priority; a chat destination gets a short message with the
        important facts and a link; a webhook gets the whole report as JSON. Attachments are <D to="/reference/attachments">linked rather than copied</D>, through signed links that work for anyone
        who can see the issue.
      </p>
      <p>
        You can trim what travels — description, context, metadata, attachments, reporter, diagnostics — per destination, under <D to="/deliver/routing">policy</D>. Issueit keeps the full report
        either way.
      </p>

      <H2>Several destinations, on purpose</H2>
      <Facts
        rows={[
          ["A tracker and a chat channel", "The issue is where the work happens; the channel is how anybody knows it happened."],
          ["On-call for the critical ones", <>A filter on priority, so PagerDuty only hears about the things worth waking up for.</>],
          ["Support separately", <>Reports with <C>source: form</C> to the help desk, the rest to engineering.</>],
          ["A spreadsheet for the record", "Some teams want a row per report that nobody can close."],
          ["Your own webhook", <>When the answer is "none of the above": <D to="/deliver/webhooks">webhooks</D>.</>],
        ]}
      />
      <Callout kind="note" title="Issueit doesn't own the copy it made">
        <p>
          Once an issue exists in your tracker, it is yours. Issueit will comment on it as duplicates arrive and notice when it's closed, but deleting a report here never reaches into another service
          to tidy up.
        </p>
      </Callout>
    </>
  );
}

function Routing() {
  return (
    <>
      <p>
        Two things decide what a destination does: a <strong>rule</strong>, which reports it takes, and a <strong>policy</strong>, how hard Issueit tries and what each delivery carries. Both have
        sensible answers already — everything, eight attempts, the whole report — so you only set what you want to be different.
      </p>

      <H2>Rules: which reports</H2>
      <p>A rule is three optional lists. An empty list means "any", and a report has to match every list you did fill in.</p>
      <Params
        rows={[
          { name: "priorities", type: "array", children: <><C>low</C>, <C>medium</C>, <C>high</C>, <C>critical</C>. The usual reason to filter: on-call gets critical, the tracker gets everything.</> },
          { name: "sources", type: "array", children: <>Where the report came from: <C>widget</C>, <C>form</C>, <C>api</C>, or whatever label you set with <C>data-source</C>.</> },
          { name: "environments", type: "array", children: <><C>production</C>, <C>staging</C>, or anything you send. A report with no environment matches only an empty list.</> },
        ]}
      />
      <Code
        title="Three destinations on one project"
        lang="json"
        code={`// PagerDuty — only the ones worth waking someone up for
{ "priorities": ["critical"], "environments": ["production"] }

// The help desk — anything a person typed into the hosted form
{ "sources": ["form"] }

// GitHub — everything, which is what an empty rule means
{}`}
      />
      <p>
        Each destination also chooses which <D to="/reference/webhook-events">events</D> it wants. Most want only <C>report.created</C>; a webhook that keeps its own copy in sync usually wants the
        others too.
      </p>
      <Callout kind="tip" title="Prove it before you need it">
        <p>
          A <D to="/collect/idempotency">dry run</D> tells you which destinations a given report would reach, and why the others wouldn't — without storing the report or contacting anything.
        </p>
      </Callout>

      <H2>Policy: how hard to try</H2>
      <p>
        Policy is set as organisation defaults under <strong>Settings → Delivery defaults</strong> and overridden per destination. A destination's policy is sparse: it names only the values it
        changes, so raising the organisation's timeout later reaches every destination that didn't have an opinion.
      </p>
      <Table
        head={["Setting", "Default", "What it does"]}
        rows={[
          [<C>maxAttempts</C>, "8", "Attempts in total, including the first. 1 means never retry."],
          [
            <C>backoff</C>,
            <C>standard</C>,
            <>
              <C>standard</C> is the fixed ladder below. <C>exponential</C> doubles the base delay, <C>linear</C> multiplies it, <C>fixed</C> waits the same each time.
            </>,
          ],
          [<C>baseDelaySeconds</C>, "30", "The first wait, for every schedule except standard."],
          [<C>maxDelaySeconds</C>, "21,600", "A ceiling on any single wait — six hours."],
          [<C>timeoutSeconds</C>, "20", "How long one attempt may take before it counts as a failure."],
          [<C>respectRetryAfter</C>, "On", <>Honour the service's own <C>Retry-After</C> instead of the schedule, when it sends one.</>],
          [<C>sendDelaySeconds</C>, "0", "Wait before the first attempt. Useful when a report and its attachments race something on your side."],
          [<C>rateLimitPerMinute</C>, "0", "A sliding window per destination, so a burst of reports doesn't trip the service's own limit. 0 is unlimited."],
          [<C>autoPauseAfter</C>, "0", "Pause the destination after this many consecutive permanent failures, and email the owners. 0 never pauses."],
        ]}
      />

      <H3>Which failures retry</H3>
      <p>
        Retrying a request that can't succeed wastes ten hours and then tells you nothing. Each class of failure is a switch, and credential problems ignore all of them: a revoked token or a deleted
        repository stops immediately and says so.
      </p>
      <Table
        head={["Setting", "Default", "Covers"]}
        rows={[
          [<C>retryServerErrors</C>, "On", "5xx. The service is having a bad day."],
          [<C>retryRateLimits</C>, "On", "429, and the 403s that are really rate limits."],
          [<C>retryNetworkErrors</C>, "On", "Timeouts, resets, DNS failures."],
          [<C>retryClientErrors</C>, "Off", "4xx. Usually a payload the service won't ever accept — worth seeing rather than hiding."],
        ]}
      />

      <H3>What each delivery carries</H3>
      <p>Six switches, all on by default. They shape what leaves Issueit; the stored report is untouched, so turning one back on reaches the next delivery rather than rewriting history.</p>
      <Table
        head={["Setting", "Leaves out"]}
        rows={[
          [<C>includeDescription</C>, "What the person wrote."],
          [<C>includeContext</C>, "Browser, viewport, screen, language, time zone."],
          [<C>includeMetadata</C>, "Your own metadata object."],
          [<C>includeAttachments</C>, "Screenshots and files, and the links to them."],
          [<C>includeReporter</C>, "The reporter's name and email address."],
          [<C>includeDiagnostics</C>, "The console, network and steps lists."],
        ]}
      />
      <p>
        <C>titlePrefix</C> puts a short string in front of every title — <C>[staging]</C>, <C>[iOS]</C> — which is the cheapest way to make one tracker's issue list legible when several projects
        share it.
      </p>
      <Callout kind="warning" title="Delivering less, on purpose">
        <p>
          These switches are how you send bugs to a shared channel or an outside contractor without the reporter's email address or a list of the requests their browser made. Decide it per
          destination, not per report, so nobody has to remember.
        </p>
      </Callout>
    </>
  );
}

function Outbox() {
  return (
    <>
      <p>
        A bug report is worth something the moment it is written down and nothing at all if it's lost on the way to a tracker that happened to be down. So Issueit stores the report first and treats
        delivery as a separate, retried job — one row in PostgreSQL per report, event and destination.
      </p>

      <H2>The shape of it</H2>
      <Steps>
        <Step title="Enqueued in the same transaction as the report">
          <p>
            Intake writes the report and one <C>deliveries</C> row per matching destination together. There is no separate queue to be out of step with the database, and nothing has to be up for a
            report to be accepted beyond the database itself.
          </p>
        </Step>
        <Step title="Claimed, not assigned">
          <p>
            The worker takes up to 10 due rows at a time with <C>FOR UPDATE SKIP LOCKED</C> and holds each for 120 seconds. Several workers can run against one database and will never take the same
            row; a worker that dies mid-delivery loses its claim when the lock lapses, and the row becomes due again.
          </p>
        </Step>
        <Step title="Woken by a notification, not a poll">
          <p>
            A new delivery sends a PostgreSQL <C>NOTIFY</C>, so the usual case is immediate. Otherwise the worker sleeps until the next retry is due, and at most a minute, so a stale lock is
            reclaimed quickly.
          </p>
        </Step>
        <Step title="Retried on a ladder">
          <p>The standard schedule, which is what you get unless a policy says otherwise:</p>
        </Step>
      </Steps>
      <Table
        head={["Attempt", "Waits before it", "Elapsed"]}
        rows={[
          ["1", "Immediately", "0"],
          ["2", "30 seconds", "30 s"],
          ["3", "2 minutes", "2.5 min"],
          ["4", "10 minutes", "12.5 min"],
          ["5", "30 minutes", "42.5 min"],
          ["6", "1 hour", "1 h 43 min"],
          ["7", "3 hours", "4 h 43 min"],
          ["8", "6 hours", "10 h 43 min"],
        ]}
      />
      <p>
        Eight attempts over about ten hours and three quarters. An outage inside that window costs you nothing: the report is already stored, and the issue appears when the service comes back. See{" "}
        <D to="/deliver/routing">policy</D> to change the ladder, the number of attempts or the timeout.
      </p>

      <H2>Idempotence, at both ends</H2>
      <Facts
        rows={[
          [
            "One delivery per report, event and destination",
            <>
              The key is <C>{`{destination}:{report}:{event}`}</C>, with a version for repeated updates. Enqueueing the same thing twice inserts nothing the second time.
            </>,
          ],
          [
            "One delivery id across attempts",
            <>
              <C>Issueit-Delivery</C> stays the same on every retry, so a receiver that has already acted can recognise the repeat and drop it.
            </>,
          ],
          ["A frozen body for webhooks", "A webhook delivery stores the event it is going to send, so a retry sends identical bytes — which also means an identical signature is verifiable."],
        ]}
      />

      <H2>Reading the result</H2>
      <p>
        Each report shows where it went, with a link to whatever was created, how many attempts it took and what the service said. The organisation-wide log is under <strong>Integrations → Log</strong>
        , filterable by status, destination and project; from a terminal it's <C>issueit deliveries</C>, and from an agent <C>list_deliveries</C>.
      </p>
      <Table
        head={["Status", "Means"]}
        rows={[
          ["Pending", "Waiting for its first attempt, or for a send delay or a rate-limit slot."],
          ["Delivering", "Claimed by a worker right now."],
          ["Delivered", "The service accepted it. The link, where there is one, points at what it created."],
          ["Retrying", <>It failed, the failure is one that might pass, and the next attempt is scheduled. The row says when.</>],
          ["Failed", "Out of attempts, or a failure no retry can fix. The service's own message is kept."],
        ]}
      />

      <H2>What this is not</H2>
      <p>
        It isn't a general job queue, and there is no separate broker to operate. That is the point: one database to back up, one thing to restore, and a queue that can't disagree with the data it
        refers to. If you want to see how far behind it is at any moment, <D to="/automate/monitoring">health and metrics</D> answers exactly that.
      </p>
    </>
  );
}

function Webhooks() {
  const urls = useUrls();
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
      "diagnostics": { "console": [ … ], "network": [ … ], "steps": [ … ] },
      "group": null,
      "attachments": [
        { "id": "att_…", "filename": "screenshot.png",
          "content_type": "image/png", "size_bytes": 182311, "url": "…signed link…" }
      ],
      "project": { "id": "prj_abc123", "name": "Website" },
      "dashboard_url": "${urls.app}/inbox/rep_xyz789",
      "created_at": "2026-10-30T09:12:43.981Z",
      "updated_at": "2026-10-30T09:12:43.981Z"
    }
  }
}`;
  return (
    <>
      <p>
        When none of the 130-odd services is the right answer, a webhook is. Issueit posts the whole report as JSON to an endpoint of yours, signs every request, and retries a failure on the same
        ladder as everything else.
      </p>

      <H2>Setting one up</H2>
      <Steps>
        <Step title="Add a webhook destination">
          <p>
            On the project's <strong>Integrations</strong> tab, choose <strong>Webhook</strong> and give it an HTTPS URL. Issueit generates a signing secret, shown once; you can rotate it later from
            the destination's settings.
          </p>
        </Step>
        <Step title="Choose the events">
          <p>
            <C>report.created</C> is on by default. Add <C>report.updated</C>, <C>report.resolved</C>, <C>report.closed</C> or <C>report.duplicate</C> if your receiver keeps its own copy in step.
          </p>
        </Step>
        <Step title="Verify the signature">
          <p>
            Before you trust a request, check <C>Issueit-Signature</C>. There is code for five languages under <D to="/deliver/signatures">verifying signatures</D>. Do this first, not later.
          </p>
        </Step>
        <Step title="Answer quickly">
          <p>
            Any 2xx inside the destination's timeout, which is 20 seconds by default. Do the work afterwards — a receiver that processes before it answers is a receiver that gets retried.
          </p>
        </Step>
      </Steps>

      <H2>The request</H2>
      <Code
        title="Headers"
        code={`POST /hooks/issueit HTTP/1.1
Content-Type: application/json
Issueit-Event: report.created
Issueit-Delivery: dlv_7n3k0q2m9x4b1c
Issueit-Signature: t=1793351564,v1=5f0c…e91a`}
      />
      <Params
        rows={[
          { name: "Issueit-Event", children: "The event type, also in the body as `type`." },
          { name: "Issueit-Delivery", children: "A unique id for this delivery. Retries reuse it, so you can drop a repeat you have already handled." },
          { name: "Issueit-Signature", children: <>A timestamp and an HMAC-SHA256 over <C>{"<t>.<raw body>"}</C>. See <D to="/deliver/signatures">verifying signatures</D>.</> },
        ]}
      />
      <Code title="Body" lang="json" code={payload} />
      <p>
        Every field is described in the <D to="/reference/webhook-events">webhook events reference</D>. Fields a destination's policy excludes are empty rather than missing, so your parser doesn't
        have to care which switches are on.
      </p>

      <H2>Answering</H2>
      <Facts
        rows={[
          ["2xx", "Accepted. Nothing more happens."],
          ["410 Gone", "Stops retries for that delivery for good. The honest answer when your endpoint has moved on."],
          ["Anything else", <>Retried on the destination's <D to="/deliver/outbox">ladder</D>.</>],
          ["Redirects", "Not followed, and counted as a failure. Give the real URL."],
          ["Your body", <>At most 64 KB is read, and only to show you in the log what your endpoint said.</>],
          ["Timeout", "20 seconds by default, from the destination's policy. Anything from 3 to 60."],
        ]}
      />
      <Callout kind="warning" title="Public addresses only">
        <p>
          A webhook URL has to resolve to a public address. Private ranges, <C>localhost</C> and <C>*.internal</C> are refused before Issueit connects, and the hostname is pinned to the address it
          resolved to so DNS can't be swapped afterwards. Self-hosted installs that deliver inside their own network can set <C>WEBHOOK_ALLOW_PRIVATE=true</C>; see{" "}
          <D to="/reference/egress">egress rules</D>.
        </p>
      </Callout>

      <H2>Developing against it locally</H2>
      <p>
        You can't receive a webhook on <C>localhost</C>, which is the awkward part of writing one. <C>issueit listen</C> forwards reports from a project to a URL on your machine, signed exactly the
        way the real thing signs them — so the verification code you write here is the code you ship.
      </p>
      <Code
        title="Terminal"
        lang="sh"
        code={`npx issueit listen --forward http://localhost:3000/hooks --secret whsec_local`}
      />
      <p>
        Then send yourself a report: press the widget's button, or <C>issueit file "Testing the receiver"</C>. See <D to="/automate/cli">the command line</D>.
      </p>

      <H3>A receiver, end to end</H3>
      <CodeTabs
        tabs={[
          {
            label: "Express",
            code: `import express from "express";
import { verifyIssueit } from "./verify.js";

const app = express();

// The raw body, not a parsed one: a re-serialised object won't match the signature.
app.post("/hooks", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifyIssueit(req.body, req.header("issueit-signature"), process.env.ISSUEIT_WEBHOOK_SECRET)) {
    return res.sendStatus(401);
  }
  const event = JSON.parse(req.body.toString("utf8"));

  // Answer first, work afterwards.
  res.sendStatus(204);
  queue.add("issueit-event", { id: req.header("issueit-delivery"), event });
});`,
          },
          {
            label: "Hono",
            code: `app.post("/hooks", async (c) => {
  const raw = await c.req.text();
  if (!verifyIssueit(raw, c.req.header("issueit-signature"), Bun.env.ISSUEIT_WEBHOOK_SECRET)) {
    return c.body(null, 401);
  }
  const event = JSON.parse(raw);
  if (event.type === "report.created") await onReport(event.data.report);
  return c.body(null, 204);
});`,
          },
          {
            label: "FastAPI",
            code: `from fastapi import FastAPI, Request, Response

app = FastAPI()

@app.post("/hooks")
async def hooks(request: Request):
    raw = await request.body()
    if not verify_issueit(raw, request.headers.get("issueit-signature"), SECRET):
        return Response(status_code=401)
    event = json.loads(raw)
    background.add_task(handle, event)
    return Response(status_code=204)`,
          },
        ]}
      />

      <H2>Keeping your own copy in step</H2>
      <p>
        If your receiver stores reports, subscribe to <C>report.updated</C>, <C>report.resolved</C> and <C>report.closed</C> as well, and key on the report's <C>id</C>. Deliveries for one report
        arrive in order, but a retry can arrive after a later event, so treat <C>updated_at</C> as the authority rather than arrival order. For a group, <C>report.duplicate</C> carries the first
        report's id and the size of the group, so you can count without storing every member.
      </p>
      <Endpoint method="POST" path="https://your-endpoint.example.com/hooks" auth="Issueit-Signature" />
    </>
  );
}

function Signatures() {
  return (
    <>
      <p>
        Anyone can post JSON to your endpoint. The signature is how you know Issueit sent it, and that it hasn't been replayed from last week. Verify before you parse, and compare in constant time.
      </p>

      <H2>The header</H2>
      <Code code={`Issueit-Signature: t=1793351564,v1=5f0c…e91a`} />
      <Facts
        rows={[
          [<C>t</C>, "Unix seconds when the request was signed."],
          [<C>v1</C>, <>Hex HMAC-SHA256 over the exact string <C>{"<t>.<raw body>"}</C>, keyed with the destination's signing secret.</>],
        ]}
      />
      <Callout kind="warning" title="Use the raw bytes">
        <p>
          Parse-then-re-serialise and the signature will not match: key order, whitespace and number formatting all change. Read the body as text or bytes, verify, and only then parse. In Express
          that means <C>express.raw()</C> on this route; in frameworks that parse eagerly, there is usually a raw-body option.
        </p>
      </Callout>

      <H2>Verifying it</H2>
      <CodeTabs
        tabs={[
          {
            label: "Node",
            code: `import crypto from "node:crypto";

// rawBody: the request body exactly as received, before JSON parsing.
export function verifyIssueit(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(String(header ?? "").split(",").map((p) => p.split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${timestamp}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`,
          },
          {
            label: "Python",
            code: `import hashlib, hmac, time

def verify_issueit(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
    try:
        timestamp = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - timestamp) > tolerance:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))`,
          },
          {
            label: "Go",
            code: `func VerifyIssueit(rawBody []byte, header, secret string, tolerance time.Duration) bool {
	parts := map[string]string{}
	for _, p := range strings.Split(header, ",") {
		if k, v, ok := strings.Cut(p, "="); ok {
			parts[k] = v
		}
	}
	ts, err := strconv.ParseInt(parts["t"], 10, 64)
	if err != nil || time.Since(time.Unix(ts, 0)).Abs() > tolerance {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", ts)
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(parts["v1"]))
}`,
          },
          {
            label: "PHP",
            code: `<?php
function verify_issueit(string $rawBody, ?string $header, string $secret, int $tolerance = 300): bool {
    $parts = [];
    foreach (explode(',', (string) $header) as $p) {
        $kv = explode('=', $p, 2);
        if (count($kv) === 2) $parts[$kv[0]] = $kv[1];
    }
    $t = isset($parts['t']) ? (int) $parts['t'] : 0;
    if (!$t || abs(time() - $t) > $tolerance) return false;
    $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
    return hash_equals($expected, $parts['v1'] ?? '');
}`,
          },
          {
            label: "Ruby",
            code: `require "openssl"

def verify_issueit(raw_body, header, secret, tolerance = 300)
  parts = header.to_s.split(",").map { |p| p.split("=", 2) }.to_h
  t = parts["t"].to_i
  return false if t.zero? || (Time.now.to_i - t).abs > tolerance

  expected = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{t}.#{raw_body}")
  OpenSSL.secure_compare(expected, parts["v1"].to_s)
end`,
          },
        ]}
      />

      <H2>Rejecting replays</H2>
      <p>
        The timestamp is signed, so an old request can't be re-sent with a fresh one. Reject anything more than five minutes old — the tolerance in every sample above — and you have replay
        protection without storing anything. If you want it exact, remember the <C>Issueit-Delivery</C> ids you have handled; retries reuse them.
      </p>

      <H2>Rotating the secret</H2>
      <p>
        A destination's signing secret can be replaced from its settings. The new secret signs the next attempt, <em>including retries of deliveries queued before the change</em>, so roll your
        receiver first: accept either secret for a few minutes, rotate in Issueit, then drop the old one.
      </p>
      <Code
        title="Accepting two secrets while you roll"
        lang="js"
        code={`const ok = [process.env.ISSUEIT_WEBHOOK_SECRET, process.env.ISSUEIT_WEBHOOK_SECRET_PREVIOUS]
  .filter(Boolean)
  .some((secret) => verifyIssueit(raw, header, secret));`}
      />
      <Callout kind="tip" title="Test it locally first">
        <p>
          <C>issueit listen --forward http://localhost:3000/hooks --secret whsec_local</C> signs forwarded reports the same way, so you can get this right before anything is in production. See{" "}
          <D to="/automate/cli">the command line</D>.
        </p>
      </Callout>
    </>
  );
}

function Failures() {
  return (
    <>
      <p>
        Deliveries fail. A token gets revoked, a repository is renamed, somebody's Slack app is uninstalled. The report is already safe; what you want is to know quickly, understand why, and fix it
        without losing the ones that arrived meanwhile.
      </p>

      <H2>Where to look</H2>
      <Facts
        rows={[
          ["One report", "Open it. The delivery list shows every destination, its status, the attempt count and the service's own message."],
          ["The whole organisation", <><strong>Integrations → Log</strong>, filtered by status, destination or project.</>],
          ["From a terminal", <><C>issueit deliveries --failed</C>, and <C>issueit health</C> which exits non-zero when delivery is behind.</>],
          ["From an agent", <><C>list_deliveries</C> and <C>retry_delivery</C>. See <D to="/automate/mcp">MCP</D>.</>],
          ["An alert", <><C>GET /api/orgs/current/health</C> answers "how old is the oldest thing still waiting". See <D to="/automate/monitoring">health and metrics</D>.</>],
        ]}
      />

      <H2>What the message usually means</H2>
      <Table
        head={["What you see", "What happened", "What to do"]}
        rows={[
          ["Reconnect this account", "The credential was revoked, expired, or had its access removed. Never retried, because no number of attempts will fix it.", <>Reconnect under <strong>Settings → Connections</strong>, then retry the failed deliveries.</>],
          ["404 from the service", "The repository, board, channel or database is gone, renamed, or the connected account can no longer see it.", "Point the destination at the new target, or reconnect with an account that can see it."],
          ["403 or insufficient scope", "The token is valid but not allowed to create issues there.", "Widen the token's permissions in that service, or reconnect by signing in."],
          ["429 from the service", "You are sending faster than it accepts.", <>Retried automatically. If it's constant, set <C>rateLimitPerMinute</C> on the destination.</>],
          ["Timed out", "The service didn't answer inside the policy's timeout.", <>Usually transient and retried. A receiver of your own that does work before answering should <D to="/deliver/webhooks">answer first</D>.</>],
          ["Refused: private address", <>A webhook URL that resolves inside a private range. See <D to="/reference/egress">egress rules</D>.</>, "Use a public address, or allow private delivery on a self-hosted install."],
          ["Out of attempts", "Eight tries over about ten hours, all failed.", "Fix the cause, then retry by hand — the report and its payload are still there."],
        ]}
      />

      <H2>Retrying</H2>
      <p>
        Any delivery can be retried from the report or the log, which resets its schedule and tries immediately. Retrying is safe: the delivery keeps its <C>Issueit-Delivery</C> id, and services that
        can be asked are checked for an existing issue rather than filing a second one.
      </p>
      <Code
        title="In bulk, from a terminal"
        lang="sh"
        code={`issueit deliveries --failed                 # what's broken, newest first
issueit retry dlv_7n3k0q2m9x4b1c            # one of them
issueit retry --failed --destination "#bugs" # every failure for one destination`}
      />

      <H2>Paused destinations</H2>
      <p>
        A destination whose deliveries keep failing permanently can pause itself — set <C>autoPauseAfter</C> in its <D to="/deliver/routing">policy</D>. Reports are still collected and still
        queued; nothing is leaving. Issueit emails the organisation's owners at most once a day per destination, and the dashboard marks it.
      </p>
      <p>
        That email is the one worth not filtering: a paused destination is the failure mode where everything looks fine, because reports keep arriving in Issueit. Check{" "}
        <strong>Settings → Notifications</strong> if you aren't sure anybody would be told.
      </p>

      <H2>When nothing arrives at all</H2>
      <Steps>
        <Step title="Is anything being collected?">
          <p>
            The project's overview counts reports. If it's zero, the problem is intake, not delivery: check the project id, the browser console for a refused request, and the project's allowed sites.{" "}
            <C>issueit doctor</C> checks all three.
          </p>
        </Step>
        <Step title="Is there a destination at all?">
          <p>A project with no destinations collects happily and delivers nowhere. It's a common first-day surprise.</p>
        </Step>
        <Step title="Does the rule match?">
          <p>
            A destination filtered to <C>critical</C> ignores a medium report, correctly and silently. A <D to="/collect/idempotency">dry run</D> names the destinations a report would reach and why
            the others wouldn't.
          </p>
        </Step>
        <Step title="Is it a duplicate?">
          <p>
            A report that joins an open <D to="/reports/duplicates">group</D> isn't delivered again — the tracker gets a comment at certain group sizes instead. The report says which group it joined.
          </p>
        </Step>
        <Step title="Is the worker running?">
          <p>
            Self-hosting, with <C>ROLE=api</C> and no worker process, nothing is ever delivered. <C>/health</C> is about the database; <D to="/automate/monitoring">the organisation's health
            endpoint</D> is about the queue.
          </p>
        </Step>
      </Steps>
    </>
  );
}

export const deliverPages: Record<string, ComponentType> = {
  "/deliver/destinations": Destinations,
  "/deliver/routing": Routing,
  "/deliver/outbox": Outbox,
  "/deliver/webhooks": Webhooks,
  "/deliver/signatures": Signatures,
  "/deliver/failures": Failures,
};
