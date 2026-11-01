import type { ComponentType } from "react";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Code, D, Endpoint, Facts, H2, Params, Table } from "../kit";

/**
 * Reference: the exact contract. Everything here is written from what the
 * server does, and is meant to be read in pieces rather than start to finish.
 */

function IntakeReference() {
  const urls = useUrls();
  return (
    <>
      <p>
        The one endpoint that creates a report. For the guided version, with the reasons, read <D to="/collect/intake-api">the intake API</D>.
      </p>
      <Endpoint method="POST" path="/v1/{project_id}/reports" auth="prj_, sk_live_ or it_" />

      <H2>Request</H2>
      <Facts
        rows={[
          ["Content types", <><C>application/json</C>, or <C>multipart/form-data</C> with a <C>report</C> part holding the JSON and repeated <C>attachments</C> parts.</>],
          ["JSON size", <>256 KB. The whole multipart request may be that plus the attachment allowance, with base64 overhead.</>],
          ["Query", <><C>dry_run=1</C> validates and reports what would happen, storing nothing.</>],
          ["Headers", <><C>Authorization: Bearer …</C> for a key or token, <C>Idempotency-Key</C> to make a repeat safe.</>],
          ["CORS", <>Preflights are answered for any origin: <C>GET</C>, <C>POST</C>, <C>OPTIONS</C> with <C>content-type</C> and <C>authorization</C>, cached for a day. Whether a submission is accepted is decided afterwards by the project.</>],
        ]}
      />

      <H2>Fields</H2>
      <Params
        rows={[
          { name: "title", type: "string", required: true, children: "1 to 200 characters." },
          { name: "description", type: "string", children: "Up to 20,000 characters." },
          {
            name: "severity",
            type: "enum",
            children: (
              <>
                <C>low</C> · <C>medium</C> · <C>high</C> · <C>critical</C>. Alias <C>priority</C>. Defaults to <C>medium</C>; an unrecognised value becomes <C>medium</C> rather than an error.
              </>
            ),
          },
          { name: "source", type: "string", children: <>Free label. Defaults to <C>api</C> for a key, and to <C>widget</C> or <C>form</C> when Issueit can tell.</> },
          { name: "environment", type: "string", children: <>Free text, for example <C>production</C>. Routing rules can match it.</> },
          { name: "page_url", type: "url", children: "Absolute URL. Used for duplicate grouping unless the project ignores the page." },
          { name: "browser", type: "string", children: "Free text. Parsed from the user agent when absent." },
          { name: "email", type: "email", children: <>The reporter. Or <C>{`reporter: { email, name }`}</C>.</> },
          { name: "notify", type: "boolean", children: <>The reporter asked to hear when it's fixed. Needs an email address. See <D to="/reports/emails">emails to reporters</D>.</> },
          { name: "metadata", type: "object", children: "Any JSON object up to 16 KB. Delivered as-is." },
          { name: "fingerprint", type: "string", children: <>Your own grouping key. Hashed and stored as <C>x:…</C>; takes precedence over the title and page.</> },
          { name: "release", type: "string", children: <>Which build this happened on, for <D to="/reports/releases">source maps</D>.</> },
          { name: "idempotency_key", type: "string", children: <>Up to 120 characters. Same effect as the <C>Idempotency-Key</C> header.</> },
          {
            name: "diagnostics",
            type: "object",
            children: (
              <>
                <C>{`{ console, network, steps }`}</C>. Entries carry <C>t</C>, milliseconds before sending. See <D to="/collect/diagnostics">diagnostics capture</D>.
              </>
            ),
          },
          { name: "attachments", type: "array", children: <><C>{`[{ filename, data }]`}</C> with base64 data, or multipart parts. Up to 5 files of 10 MB by default.</> },
          { name: "context", type: "object", children: <>Browser context: <C>os</C>, <C>viewport</C>, <C>screen</C>, <C>language</C>, <C>timezone</C>, <C>referrer</C>. The widget fills this in.</> },
        ]}
      />

      <H2>Attachment types</H2>
      <p>Decided by sniffing the bytes, not by the filename or the declared type.</p>
      <Facts
        rows={[
          ["Accepted", "PNG, JPEG, GIF, WebP, MP4, WebM, PDF, zip, and anything whose bytes are plain text (logs, CSV, JSON)."],
          ["Refused", <>SVG and HTML, because both can carry script. Anything whose bytes don't match a known type: <C>unsupported_attachment</C>.</>],
          ["Renaming", "Filenames are kept but never trusted; the stored content type comes from the bytes."],
        ]}
      />

      <H2>Responses</H2>
      <Code
        title="201 Created"
        lang="json"
        code={`{ "success": true, "report_id": "rep_4f9k2m8q1x0c7v", "message": "Report received", "duplicate": false }`}
      />
      <Code
        title="200 OK — an idempotent replay"
        lang="json"
        code={`// With the idempotent-replay: true header.
{ "success": true, "report_id": "rep_4f9k2m8q1x0c7v", "message": "Report already received",
  "duplicate": false, "replayed": true }`}
      />
      <Code
        title="429 Too Many Requests"
        code={`HTTP/1.1 429 Too Many Requests
Retry-After: 37

{ "success": false, "error": { "code": "rate_limited", "message": "…" } }`}
      />
      <p>
        <C>duplicate</C> is true when the report joined an open <D to="/reports/duplicates">group</D> and so wasn't delivered again. Every error has the same envelope; the codes are in{" "}
        <D to="/reference/errors">error codes</D>.
      </p>

      <H2>Related endpoints</H2>
      <Table
        head={["Method and path", "Auth", "Does"]}
        rows={[
          [<C>POST /v1/{"{project}"}/token</C>, "Secret key", <>Mints a <D to="/collect/browser-tokens">browser token</D>. <C>?seconds=</C> up to 3600.</>],
          [<C>GET /v1/{"{project}"}/widget</C>, "None", "The project's public widget settings and upload limits. Cached for 60 seconds."],
          [<C>GET /widget.js</C>, "None", <>The widget script, from <C>{urls.cdn}</C>.</>],
          [<C>GET /r/{"{project}"}</C>, "None", <>The <D to="/collect/form">hosted form</D>.</>],
        ]}
      />
    </>
  );
}

function WebhookEvents() {
  const urls = useUrls();
  return (
    <>
      <p>
        What a <D to="/deliver/webhooks">webhook destination</D> receives. Every event has the same envelope; the report inside it is the same shape every time, with excluded fields empty rather than
        absent.
      </p>

      <H2>Events</H2>
      <Table
        head={["Event", "Sent when"]}
        rows={[
          [<C>report.created</C>, "A report is stored. The one most destinations want."],
          [<C>report.updated</C>, "Its status, priority or assignee changed in the dashboard or through the API."],
          [<C>report.resolved</C>, <>Its status became resolved. Sent alongside <C>report.updated</C>.</>],
          [<C>report.closed</C>, <>Its status became closed. Sent alongside <C>report.updated</C>.</>],
          [<C>report.duplicate</C>, <>A report joined an existing group. <C>group</C> holds the first report's id and the size of the group.</>],
        ]}
      />

      <H2>Headers</H2>
      <Params
        rows={[
          { name: "Issueit-Event", children: "The event type." },
          { name: "Issueit-Delivery", children: <>A unique delivery id, <C>dlv_…</C>. Retries reuse it, so a repeat is recognisable.</> },
          { name: "Issueit-Signature", children: <><C>{"t=<unix seconds>,v1=<hex HMAC-SHA256>"}</C> of <C>{"<t>.<raw body>"}</C>. See <D to="/deliver/signatures">verifying signatures</D>.</> },
          { name: "Content-Type", children: <C>application/json</C> },
        ]}
      />

      <H2>Envelope</H2>
      <Params
        rows={[
          { name: "id", type: "string", children: <>The event's own id, <C>evt_…</C>.</> },
          { name: "type", type: "string", children: "The event type, the same as the header." },
          { name: "created_at", type: "ISO 8601", children: "When the event was raised, not when this attempt was made." },
          { name: "data.report", type: "object", children: "The report, below." },
        ]}
      />

      <H2>The report</H2>
      <Code
        lang="json"
        code={`{
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
  "context": { "os": "macOS", "viewport": "1440×900", "language": "en-GB", "timezone": "Europe/London" },
  "reporter": { "email": "sam@example.com", "name": null },
  "metadata": { "user_id": "user_123" },
  "release": "a1b2c3d",
  "country": "GB",
  "diagnostics": {
    "console": [{ "t": 4210, "level": "error", "message": "TypeError: …", "stack": "at submit (login.js:41:12)",
                  "original": "at submitOrder (src/checkout/submit.ts:41:12)" }],
    "network": [{ "t": 4380, "method": "POST", "url": "/api/session", "status": 500, "ms": 182 }],
    "steps":   [{ "t": 4500, "kind": "click", "label": "button \\"Log in\\"" }]
  },
  "group": null,
  "attachments": [
    { "id": "att_…", "filename": "screenshot.png", "content_type": "image/png",
      "size_bytes": 182311, "url": "…signed link…" }
  ],
  "project": { "id": "prj_abc123", "name": "Website" },
  "dashboard_url": "${urls.app}/inbox/rep_xyz789",
  "created_at": "2026-10-30T09:12:43.981Z",
  "updated_at": "2026-10-30T09:12:43.981Z"
}`}
      />
      <Params
        rows={[
          { name: "number", type: "integer", children: "The report's number within its project. What people say out loud; the id is what you store." },
          { name: "status", type: "new · investigating · resolved · closed", children: "" },
          { name: "country", type: "ISO 3166 alpha-2", children: <>From a proxy's country header where <C>TRUST_PROXY</C> is set, otherwise inferred from the reporter's time zone. No IP lookups.</> },
          { name: "group", type: "object | null", children: <>On a duplicate: <C>{`{ lead_id, lead_number, size }`}</C>. Null on the first report of a group.</> },
          { name: "attachments[].url", type: "url", children: <>A <D to="/reference/attachments">signed link</D>, good for 30 days by default.</> },
          { name: "diagnostics.console[].original", type: "string", children: <>The frame read through <D to="/reports/releases">source maps</D>, where a map for that release exists. The minified <C>stack</C> is always kept too.</> },
          { name: "dashboard_url", type: "url", children: "Where a human can open it." },
        ]}
      />
      <Callout kind="note" title="Excluded fields are empty, not missing">
        <p>
          A destination's <D to="/deliver/routing">policy</D> can leave out the description, context, metadata, attachments, reporter or diagnostics. When it does, the field is an empty string, object
          or array rather than absent, so your parser doesn't need to know which switches are on.
        </p>
      </Callout>

      <H2>Answering</H2>
      <Facts
        rows={[
          ["Timeout", "20 seconds by default, set by the destination's policy. Answer well inside it; a slow receiver is a retried receiver."],
          ["Success", "Any 2xx."],
          ["410 Gone", "Stops retries for that delivery permanently."],
          ["Anything else", <>Retried on the <D to="/deliver/outbox">ladder</D>. Redirects are not followed and count as failures.</>],
          ["Your body", "At most 64 KB is read, and only to show in the delivery log what your endpoint said."],
        ]}
      />
    </>
  );
}

function Errors() {
  return (
    <>
      <p>Two shapes, because intake answers browsers and the management API answers clients. Messages are written for people and safe to show. Branch on the code, not the message.</p>
      <Code
        lang="json"
        code={`// Intake: POST /v1/{project}/reports
{ "success": false, "error": { "code": "invalid_request", "message": "title: Add a short title." } }

// Management API: /api/…
{ "error": { "code": "forbidden", "message": "This token is missing the \\"reports:write\\" scope." } }`}
      />

      <H2>Intake</H2>
      <Table
        head={["Status", "Code", "Means", "Do"]}
        rows={[
          ["400", <C>invalid_request</C>, "A field didn't validate. The message names it.", "Fix the payload. Retrying won't help."],
          ["400", <C>key_in_browser</C>, "A secret key was sent from a web page.", <>Use the project id, or a <D to="/collect/browser-tokens">browser token</D>.</>],
          ["401", <C>invalid_key</C>, "The key is wrong, revoked, expired or for another project.", "Check the key and the project id match."],
          ["403", <C>public_disabled</C>, "The project only accepts reports with a key.", "Send a secret key from your server, or mint a browser token."],
          ["403", <C>origin_not_allowed</C>, "The page's origin isn't in the project's allowed sites.", <>Add it under the project's <strong>Settings</strong>.</>],
          ["403", <C>link_expired</C>, "An attachment link's signature or expiry failed.", "Fetch the report again for a fresh link."],
          ["404", <C>not_found</C>, "No such project, or no such attachment.", "Check the id."],
          ["413", <C>payload_too_large</C>, "The request body is over the limit.", "Send fewer or smaller attachments."],
          ["413", <C>attachment_too_large</C>, "One file is over the per-file limit.", "Compress it, or raise the limit on a self-hosted install."],
          ["415", <C>unsupported_attachment</C>, "The bytes aren't an accepted type.", <>See <D to="/reference/intake">accepted types</D>. SVG and HTML are refused.</>],
          ["429", <C>rate_limited</C>, "Too many reports from this visitor, key or project.", <>Wait <C>Retry-After</C> seconds, then retry.</>],
          ["429", <C>plan_limit</C>, "The monthly allowance and its grace are used up.", <>Hosted only. <C>Retry-After</C> points at the start of next month.</>],
          ["500", <C>server_error</C>, "Something failed on our side.", "Safe to retry."],
          ["507", <C>storage_full</C>, "The organisation's attachment storage is full.", "Delete attachments, shorten retention, or raise the limit."],
        ]}
      />

      <H2>Management API</H2>
      <Table
        head={["Status", "Code", "Means"]}
        rows={[
          ["400", <C>invalid_request</C>, <>Validation. <C>details.fields</C> names each field, which is what the dashboard shows inline.</>],
          ["401", <C>unauthorised</C>, "No credentials, or they are no longer valid. A browser session gets signed out."],
          ["403", <C>forbidden</C>, "Your role doesn't allow it, or the token is missing a scope — the message names which."],
          ["402", <C>upgrade_required</C>, "An endpoint the organisation's plan doesn't include. Never from intake, and never on a self-hosted install."],
          ["404", <C>not_found</C>, "No such thing, or not in this organisation. The two are deliberately indistinguishable."],
          ["409", <C>conflict</C>, "Something would collide: a name already taken, a state that has moved on."],
          ["429", <C>rate_limited</C>, <>Per account token. See <D to="/reference/limits">limits</D>.</>],
          ["500", <C>server_error</C>, "Safe to retry."],
        ]}
      />

      <H2>Delivery failures</H2>
      <p>
        These aren't HTTP responses to you; they are what Issueit records when a delivery fails, and what you read in the log. Whether each one is retried is a{" "}
        <D to="/deliver/routing">policy</D> setting, except credential problems, which never retry.
      </p>
      <Table
        head={["Kind", "Retried by default"]}
        rows={[
          ["The service returned 5xx", "Yes"],
          ["The service returned 429, or a 403 that is really a rate limit", "Yes"],
          ["A network error or timeout", "Yes"],
          ["The service returned 4xx", "No — usually a payload it will never accept"],
          ["The credential was revoked or lost access", "Never. The destination says to reconnect the account"],
        ]}
      />
      <Callout kind="tip" title="One thing worth special-casing">
        <p>
          <C>plan_limit</C> and <C>rate_limited</C> both carry <C>Retry-After</C> and both mean "later". Everything else in the 4xx range means "not like this", and retrying is a way to turn one
          broken client into a lot of traffic.
        </p>
      </Callout>
    </>
  );
}

function Limits() {
  return (
    <>
      <p>
        Two ceilings, and the lower one wins: the environment variables an operator sets, and — on an install that sells plans — the organisation's plan. The environment is the operator's ceiling;
        the plan is the commercial limit.
      </p>

      <H2>Intake</H2>
      <Table
        head={["Limit", "Default", "Variable"]}
        rows={[
          ["Reports per visitor, per project", "10 a minute", <C>RATE_LIMIT_IP_PER_MINUTE</C>],
          ["Reports per secret key", "120 a minute", <C>RATE_LIMIT_KEY_PER_MINUTE</C>],
          ["Reports per project", "1,000 an hour", <C>RATE_LIMIT_PROJECT_PER_HOUR</C>],
          ["Reports per organisation", "5,000 an hour", <C>RATE_LIMIT_ORG_PER_HOUR</C>],
          ["Reports per organisation, per month", "Unlimited, or the plan's", <C>PLAN_REPORTS_PER_MONTH</C>],
          ["Attachments per report", "5", <C>MAX_ATTACHMENTS_PER_REPORT</C>],
          ["Size of each attachment", "10 MB", <C>MAX_ATTACHMENT_MB</C>],
          ["Attachment storage per organisation", "Unlimited, or the plan's", <C>PLAN_STORAGE_MB</C>],
          ["JSON body", "256 KB", "Fixed"],
          ["Metadata", "16 KB", "Fixed"],
          ["Title", "200 characters", "Fixed"],
          ["Description", "20,000 characters", "Fixed"],
        ]}
      />

      <H2>Management API</H2>
      <Table
        head={["Limit", "Default", "Variable"]}
        rows={[
          ["Requests per account token", "600 a minute", <C>RATE_LIMIT_TOKEN_PER_MINUTE</C>],
          ["New organisations per address", "5 a day", <C>RATE_LIMIT_SIGNUPS_PER_DAY</C>],
          ["Reports per page", "100", "Fixed"],
          ["Browser token lifetime", "3,600 seconds", "Fixed"],
        ]}
      />

      <H2>How a 429 behaves</H2>
      <Code
        code={`HTTP/1.1 429 Too Many Requests
Retry-After: 37

{ "success": false, "error": { "code": "rate_limited", "message": "…" } }`}
      />
      <Facts
        rows={[
          ["Visitors", "Counted by a keyed hash of the IP address. The address itself isn't stored."],
          ["Windows", "Fixed, counted in Postgres, so every API process counts into the same window and a restart doesn't clear it."],
          [
            "Behind a proxy",
            <>
              Set <C>TRUST_PROXY=true</C> or every visitor looks like your load balancer and shares one limit. Set <C>TRUST_PROXY_HOPS</C> to the number of proxies you run: the address is counted from
              the right-hand end of <C>X-Forwarded-For</C>, because anything further left was supplied by the caller.
            </>,
          ],
          ["Dry runs", <>Cost a rate-limit slot, because the work is real. They don't count against a monthly allowance, because nothing is stored.</>],
        ]}
      />

      <H2>The monthly allowance</H2>
      <p>
        On a hosted install, a plan's monthly report allowance is not a cliff. A tenth over it is still accepted; after that intake answers <C>plan_limit</C> with <C>Retry-After</C> set to the start
        of next month. What was turned away is counted and shown to the organisation's owners, who are emailed once at 80% and again when refusals start.
      </p>
      <p>
        <C>GET /api/plans</C> lists the plans an install sells, with their limits, and says which edition it is. A self-hosted install returns an empty list and every feature on.
      </p>
      <Callout kind="note" title="Self-hosted limits are yours">
        <p>
          With <C>EDITION=selfhost</C> — the default — no plan applies. The variables above are the only limits, and <C>0</C> means unlimited for the ones that take a count. See{" "}
          <D to="/reference/environment">environment variables</D>.
        </p>
      </Callout>
    </>
  );
}

function Ids() {
  return (
    <>
      <p>
        Every object's id is a prefix, an underscore, and 14 lowercase base-36 characters from a cryptographic source, sampled without bias. Treat them as opaque strings: the prefix is there for
        people reading logs, not for parsing.
      </p>
      <Code code={`rep_4f9k2m8q1x0c7v
└┬┘ └──────┬─────┘
 │          └ 14 characters of [0-9a-z]
 └ what it is`} />

      <H2>Prefixes</H2>
      <Table
        head={["Prefix", "Object"]}
        rows={[
          [<C>org_</C>, "Organisation"],
          [<C>usr_</C>, "User"],
          [<C>inv_</C>, "Invitation"],
          [<C>prj_</C>, "Project — public, and safe in a web page"],
          [<C>rep_</C>, "Report"],
          [<C>att_</C>, "Attachment"],
          [<C>nte_</C>, "Note on a report"],
          [<C>dst_</C>, "Destination"],
          [<C>con_</C>, "Connected account"],
          [<C>dlv_</C>, "Delivery — one per report, event and destination"],
          [<C>evt_</C>, "Webhook event"],
          [<C>rel_</C>, "Release"],
          [<C>key_</C>, <>Ingest key record. The key itself is <C>sk_live_…</C></>],
          [<C>akt_</C>, <>Account token record. The token itself is <C>ak_live_…</C></>],
          [<C>aud_</C>, "Audit event"],
          [<C>eml_</C>, "Queued reporter email"],
          [<C>ntc_</C>, "Queued system notice"],
        ]}
      />

      <H2>Credentials, which are not ids</H2>
      <Table
        head={["Looks like", "Is", "Stored as"]}
        rows={[
          [<C>sk_live_…</C>, <>A project secret key. Creates reports. See <D to="/collect/intake-api">intake</D>.</>, "A SHA-256 hash. Shown once."],
          [<C>ak_live_…</C>, <>An <D to="/automate/tokens">account token</D>. Reaches the management API with scopes.</>, "A SHA-256 hash. Shown once."],
          [<C>it_…</C>, <>A <D to="/collect/browser-tokens">browser token</D>. Reports for up to an hour.</>, "Nothing — it is signed, not stored."],
          [<C>whsec_…</C>, "A webhook signing secret.", "Encrypted. Shown once, rotatable."],
        ]}
      />

      <H2>Numbers, for people</H2>
      <p>
        A report also has a <C>number</C> within its project, starting at 1. That is what people say out loud and what the CLI accepts — <C>issueit show 118</C> — but it is only unique inside a
        project, so store the id.
      </p>
      <Callout kind="note">
        <p>A few prefixes exist for internal rows that never appear in the API, such as queued device-approval codes. If you meet one, it is not something to depend on.</p>
      </Callout>
    </>
  );
}

function Attachments() {
  const urls = useUrls();
  return (
    <>
      <p>
        Issues created in other tools link to attachments rather than copying them, so a 4 MB screenshot is one file here and a link there. The link carries its own authorisation, because the person
        opening it is reading your tracker and has no Issueit account.
      </p>
      <Endpoint method="GET" path="/a/{id}/{filename}?exp=&sig=" auth="The signature in the link" />
      <Code code={`${urls.app}/a/att_4f9k2m8q1x0c7v/screenshot.png?exp=1795943564&sig=Qm9…`} />

      <H2>How the signature works</H2>
      <Params
        rows={[
          { name: "exp", type: "unix seconds", children: <>When the link stops working. 30 days out by default (<C>ATTACHMENT_LINK_DAYS</C>).</> },
          { name: "sig", type: "base64url", children: <>HMAC-SHA256 of <C>{"<id>.<exp>"}</C> under the server's <C>SECRET_KEY</C>.</> },
          { name: "filename", type: "path", children: "Cosmetic, so the downloaded file has a sensible name. It isn't part of the signature." },
        ]}
      />
      <Facts
        rows={[
          ["Verified before anything is read", <>A bad or expired signature is <C>403 link_expired</C>, and the attachment row is never looked up.</>],
          ["Rotating SECRET_KEY", "Invalidates every outstanding link. Fresh ones are minted whenever a report is read, so the dashboard keeps working; links already inside issues don't."],
          ["Content type", "Served from the type sniffed at upload, with nosniff, so an image is served as an image and nothing is served as HTML."],
          ["Deleted by retention", <>A link to an attachment <D to="/reports/retention">retention has deleted</D> answers 404. The issue keeps the link; the bytes are gone, on purpose.</>],
        ]}
      />

      <H2>In the API</H2>
      <p>
        A report's <C>attachments</C> array carries a fresh signed <C>url</C> each time you read it, plus the id, filename, content type and size. Don't store the URL; store the id and read the
        report again when you need a link.
      </p>
      <Code
        lang="json"
        code={`"attachments": [
  { "id": "att_4f9k2m8q1x0c7v", "filename": "screenshot.png",
    "content_type": "image/png", "size_bytes": 182311,
    "url": "${urls.app}/a/att_4f9k2m8q1x0c7v/screenshot.png?exp=…&sig=…" }
]`}
      />
      <Callout kind="warning" title="A link is a capability">
        <p>
          Anyone holding one can read that file until it expires. That is the point — it's how a screenshot appears inside a GitHub issue for a team that doesn't use Issueit — but it also means a
          destination's <D to="/deliver/routing">policy</D> is where you turn attachments off for somewhere you'd rather not send them.
        </p>
      </Callout>
    </>
  );
}

function Egress() {
  return (
    <>
      <p>
        Issueit connects to addresses that people type in: webhook URLs, self-hosted trackers, most catalogue services. Every one of those requests goes through a single guarded client, because
        "fetch this URL for me" is the oldest way to turn a web application into a proxy for its own network.
      </p>

      <H2>The rules</H2>
      <Facts
        rows={[
          ["Schemes", <>Only <C>http</C> and <C>https</C>, with no credentials in the URL.</>],
          [
            "Addresses",
            <>
              Refused before connecting: <C>localhost</C>, <C>*.local</C>, <C>*.internal</C>, and <C>10/8</C>, <C>100.64/10</C>, <C>127/8</C>, <C>169.254/16</C>, <C>172.16/12</C>,{" "}
              <C>192.168/16</C>, <C>198.18/15</C>, documentation ranges, multicast and reserved space, plus their IPv6 equivalents.
            </>,
          ],
          ["DNS", "The hostname is resolved once, the answer is checked, and the connection is pinned to that address — so a name that resolves differently a moment later can't be swapped in."],
          ["Redirects", "Never followed. A 3xx counts as a failure, and the delivery log says so."],
          ["Timeouts", "10 seconds to connect, 15 to 20 for the whole request depending on the destination's policy."],
          ["Response size", "At most 64 KB is read, and only to record what the service said."],
        ]}
      />

      <H2>Self-hosted installs</H2>
      <p>
        An install that delivers inside its own network — a GitLab on a private address, a webhook to another service in the same cluster — can set <C>WEBHOOK_ALLOW_PRIVATE=true</C>. That turns off
        the address check for destinations, and nothing else.
      </p>
      <Callout kind="warning" title="Be deliberate about it">
        <p>
          With it on, anybody who can add a destination to a project can make Issueit request any address your server can reach, and see the first 64 KB of the answer in the delivery log. On an
          install where you know everyone, that's fine. On one where you don't, it isn't.
        </p>
      </Callout>

      <H2>Where it applies</H2>
      <Table
        head={["Request", "Guarded"]}
        rows={[
          ["Webhook destinations", "Yes"],
          ["Catalogue services connected with a URL you typed", "Yes"],
          ["Self-hosted GitLab, Jira and the like", "Yes — which is why a private instance needs the variable above"],
          ["OAuth providers Issueit knows", "Their endpoints are fixed in the code, not typed in"],
          ["Source map uploads", <>They come to Issueit, not from it</>],
        ]}
      />
    </>
  );
}

function Catalogue() {
  const urls = useUrls();
  return (
    <>
      <p>
        The list of every service this install can deliver to, public and unauthenticated. The dashboard's picker, the documentation and the marketing site all read it, so they can't disagree about
        what exists.
      </p>
      <Endpoint method="GET" path="/api/catalogue" auth="None" />
      <Code
        lang="json"
        code={`GET ${urls.app}/api/catalogue

{
  "providers": [
    { "id": "github", "name": "GitHub Issues", "category": "tracker",
      "summary": "Opens an issue in a repository for each new report." },
    { "id": "pagerduty", "name": "PagerDuty", "category": "oncall",
      "summary": "…" }
  ]
}`}
      />
      <Params
        rows={[
          { name: "id", type: "string", children: <>What you pass as <C>provider</C> when creating a destination.</> },
          { name: "name", type: "string", children: "What the service is called, as its own documentation calls it." },
          { name: "category", type: "enum", children: "One of the eleven below." },
          { name: "summary", type: "string", children: "One sentence: what a report becomes there." },
        ]}
      />

      <H2>Categories</H2>
      <Table
        head={["Category", "Holds"]}
        rows={[
          [<C>tracker</C>, "Issue trackers: GitHub, GitLab, Linear, Jira, ClickUp, Asana and the rest."],
          [<C>helpdesk</C>, "Help desks and CRM."],
          [<C>chat</C>, "Slack, Teams, Discord, and everything like them."],
          [<C>notify</C>, "Push and SMS."],
          [<C>email</C>, "Email services, which also send reporter mail from your domain."],
          [<C>oncall</C>, "On-call and alerting."],
          [<C>data</C>, "Spreadsheets and databases."],
          [<C>automation</C>, "Automation platforms."],
          [<C>analytics</C>, "Analytics and monitoring."],
          [<C>cloud</C>, "Cloud queues and event buses."],
          [<C>webhook</C>, <>Your own endpoint. See <D to="/deliver/webhooks">webhooks</D>.</>],
        ]}
      />
      <p>
        Cached for five minutes. The self-hosted edition ships the hand-written providers and leaves out the token-based catalogue, so its list is shorter — which is exactly why reading this endpoint
        is better than hard-coding a list. See <D to="/self-host/editions">editions</D>.
      </p>
    </>
  );
}

function Environment() {
  return (
    <>
      <p>
        Every variable the server reads. Four are required; the rest have defaults that make a single-origin install work. All of them are also in <C>.env.example</C>, with the same wording.
      </p>

      <H2>Required</H2>
      <Table
        head={["Variable", "Effect"]}
        rows={[
          [<C>APP_URL</C>, <>The public address people use. Links in emails, issues and snippets use it, and secure cookies switch on when it starts <C>https</C>.</>],
          [<C>ENCRYPTION_KEY</C>, <>AES-256-GCM key for stored integration credentials. <strong>Back it up with the database</strong> — without it, every connected account has to be reconnected by hand.</>],
          [<C>SECRET_KEY</C>, <>Signs attachment links and keys the IP hashes used for rate limits. Rotating it invalidates outstanding <D to="/reference/attachments">links</D>.</>],
          [<C>POSTGRES_PASSWORD</C>, <>Read by the compose file. Or set <C>DATABASE_URL</C> yourself and point it anywhere.</>],
        ]}
      />
      <Code lang="sh" code={`openssl rand -base64 32   # ENCRYPTION_KEY, SECRET_KEY, POSTGRES_PASSWORD`} />

      <H2>Hosting</H2>
      <Table
        head={["Variable", "Default", "Effect"]}
        rows={[
          [<C>DATABASE_URL</C>, "Local PostgreSQL", "The compose file runs PostgreSQL 17."],
          [<><C>PORT</C> and <C>HOST</C></>, <>8380 and <C>0.0.0.0</C></>, "Where the process listens."],
          [<C>ROLE</C>, <C>all</C>, <><C>api</C> serves HTTP only; <C>worker</C> only delivers. Run several workers against one database.</>],
          [<C>DROP_URL</C>, <C>APP_URL</C>, "Where widgets send reports."],
          [<C>CDN_URL</C>, <C>APP_URL</C>, <>Where <C>widget.js</C> is served from.</>],
          [<C>DOCS_URL</C>, <C>APP_URL/docs</C>, "Where documentation links point."],
          [<C>MARKETING_URL</C>, <C>APP_URL</C>, "Where the public site's links point."],
          [<C>DATA_DIR</C>, <C>./data</C>, "Where attachments are written."],
          [<C>TRUST_PROXY</C>, <C>false</C>, <>Read the client address from <C>X-Forwarded-For</C>. Only behind a proxy you run — otherwise every visitor shares one rate limit.</>],
          [
            <C>TRUST_PROXY_HOPS</C>,
            "1",
            <>
              How many proxies you run. The address is taken that many entries from the right-hand end of the header, because a caller can write anything into the left-hand end. Cloudflare in front of
              nginx is <C>2</C>.
            </>,
          ],
          [<C>TRUST_PROXY_HEADER</C>, <C>x-forwarded-for</C>, <>The header to read instead, for example <C>cf-connecting-ip</C>. A single-value header ignores the hop count.</>],
          [<C>ALLOW_SIGNUP</C>, <C>true</C>, "Turn off to make an install invitation-only."],
        ]}
      />

      <H2>Mail</H2>
      <Table
        head={["Variable", "Effect"]}
        rows={[
          [
            <C>SMTP_URL</C>,
            <>
              Everything Issueit sends on its own behalf: resets, confirmations, invitations, report alerts, digests and reporter mail. For example{" "}
              <C>smtps://user:password@smtp.example.com:465</C>. <strong>Set it before anybody else signs up</strong> — without it a forgotten password can only be fixed in the database.
            </>,
          ],
          [<C>SMTP_FROM</C>, <>The sender, for example <C>Issueit &lt;no-reply@example.com&gt;</C>.</>],
        ]}
      />

      <H2>Behaviour</H2>
      <Table
        head={["Variable", "Default", "Effect"]}
        rows={[
          [<C>SYNC_INTERVAL_MINUTES</C>, "5", "How often trackers are asked whether issues were closed. 0 turns it off."],
          [<C>JOBS_HOUR_UTC</C>, "7", "When the daily round runs: retention, digests, trial endings."],
          [<C>RETENTION_ENABLED</C>, <C>true</C>, <>Set <C>false</C> to keep attachments and captured diagnostics for ever.</>],
          [<C>WEBHOOK_ALLOW_PRIVATE</C>, <C>false</C>, <>Allow deliveries to private addresses. See <D to="/reference/egress">egress rules</D>.</>],
          [<C>ATTACHMENT_LINK_DAYS</C>, "30", <>How long a signed <D to="/reference/attachments">attachment link</D> lasts.</>],
          [<C>METRICS_TOKEN</C>, "Unset", <>Turns on <C>/metrics</C>, with this value as the bearer token. Off means 404.</>],
        ]}
      />

      <H2>Limits</H2>
      <p>
        <C>MAX_ATTACHMENT_MB</C>, <C>MAX_ATTACHMENTS_PER_REPORT</C>, <C>RATE_LIMIT_IP_PER_MINUTE</C>, <C>RATE_LIMIT_PROJECT_PER_HOUR</C>, <C>RATE_LIMIT_KEY_PER_MINUTE</C>,{" "}
        <C>RATE_LIMIT_TOKEN_PER_MINUTE</C>, <C>PLAN_REPORTS_PER_MONTH</C> and <C>PLAN_STORAGE_MB</C>. Defaults and meanings are in <D to="/reference/limits">limits</D>; <C>0</C> is unlimited for the
        ones that take a count.
      </p>

      <H2>Edition and billing</H2>
      <Table
        head={["Variable", "Default", "Effect"]}
        rows={[
          [
            <C>EDITION</C>,
            <C>selfhost</C>,
            <>
              <C>selfhost</C> turns every feature on and applies only the limits above. <C>hosted</C> turns on per-organisation plans, trials and Stripe billing. See{" "}
              <D to="/self-host/editions">editions</D>.
            </>,
          ],
          [<C>TRIAL_DAYS</C>, "14", "Hosted only: days a new organisation gets on the trial plan. 0 starts everyone on free."],
          [
            <C>STRIPE_SECRET_KEY</C>,
            "Unset",
            <>
              Hosted only, with <C>STRIPE_WEBHOOK_SECRET</C> and a price id per plan and period (<C>STRIPE_PRICE_TEAM_MONTHLY</C> and the rest). The webhook at{" "}
              <C>/api/billing/webhook</C> is the only thing that writes a plan, and its signature is checked before its body is read.
            </>,
          ],
        ]}
      />

      <H2>OAuth apps</H2>
      <p>
        Setting a service's client id and secret turns on sign-in connections for it; without them, the token method is offered instead. The redirect URL for each is{" "}
        <C>{"{APP_URL}/api/oauth/{service}/callback"}</C>.
      </p>
      <Table
        head={["Service", "Variables"]}
        rows={[
          ["GitHub", <C>GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET</C>],
          ["GitLab", <><C>GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET</C>, optional <C>GITLAB_URL</C></>],
          ["Linear", <C>LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET</C>],
          ["Jira", <C>JIRA_CLIENT_ID, JIRA_CLIENT_SECRET</C>],
          ["ClickUp", <C>CLICKUP_CLIENT_ID, CLICKUP_CLIENT_SECRET</C>],
          ["Trello", <><C>TRELLO_API_KEY</C> — allow your origin in Trello's settings</>],
          ["Slack", <C>SLACK_CLIENT_ID, SLACK_CLIENT_SECRET</C>],
          ["Discord", <C>DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET</C>],
          ["Notion", <C>NOTION_CLIENT_ID, NOTION_CLIENT_SECRET</C>],
        ]}
      />
      <p>
        Step by step, with what to put in each service's form, is under <D to="/self-host/oauth">OAuth apps</D>.
      </p>
    </>
  );
}

export const referencePages: Record<string, ComponentType> = {
  "/reference/intake": IntakeReference,
  "/reference/webhook-events": WebhookEvents,
  "/reference/errors": Errors,
  "/reference/limits": Limits,
  "/reference/ids": Ids,
  "/reference/attachments": Attachments,
  "/reference/egress": Egress,
  "/reference/catalogue": Catalogue,
  "/reference/environment": Environment,
};
