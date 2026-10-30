import { Link } from "react-router";
import { PageHead, SitePage } from "../chrome";
import { Article, C, Code, Note, Section, Table, type Toc } from "../prose";

/**
 * The precise reference: every public surface, limit, header and code,
 * written from what the server actually does. The friendlier walkthrough
 * lives at /docs.
 */

const origin = window.location.origin;

const toc: Toc = [
  ["surfaces", "Public surfaces"],
  ["ingest", "Ingestion API"],
  ["auth", "Keys and origins"],
  ["widget", "Widget runtime"],
  ["webhooks", "Webhook events"],
  ["signatures", "Signatures"],
  ["delivery", "Delivery and retries"],
  ["egress", "Egress rules"],
  ["limits", "Limits"],
  ["errors", "Error codes"],
  ["ids", "Object ids"],
  ["attachments", "Attachment links"],
  ["catalogue", "Catalogue and health"],
  ["environment", "Environment"],
];

const node = `import crypto from "node:crypto";

// rawBody: the request body exactly as received, before JSON parsing.
export function verifyIssueit(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${timestamp}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const python = `import hashlib, hmac, time

def verify_issueit(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        timestamp = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - timestamp) > tolerance:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))`;

const go = `func VerifyIssueit(rawBody []byte, header, secret string, tolerance time.Duration) bool {
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
}`;

const multipart = `curl -X POST ${origin}/v1/prj_abc123/reports \\
  -H "Authorization: Bearer sk_live_…" \\
  -F 'report={"title":"Checkout total is wrong","severity":"high","environment":"production"};type=application/json' \\
  -F 'attachments=@screenshot.png' \\
  -F 'attachments=@console.txt'`;

const created = `HTTP/1.1 201 Created
Content-Type: application/json

{ "success": true, "report_id": "rep_4f9k2m8q1x0c7v", "message": "Report received" }`;

const limited = `HTTP/1.1 429 Too Many Requests
Retry-After: 37

{ "success": false, "error": { "code": "rate_limited", "message": "…" } }`;

const runtime = `// Fill in who is reporting; the widget skips the email field.
Issueit.identify({ email: "sam@example.com", name: "Sam" });

// Attached to every report as metadata (a JSON object, up to 16 KB).
Issueit.setMetadata({ user_id: "user_123", plan: "pro", build: "2026.10.30-1" });

// Open the form from your own control.
document.querySelector("#report-bug").addEventListener("click", () => Issueit.open());`;

const headers = `POST /hooks/issueit HTTP/1.1
Content-Type: application/json
Issueit-Event: report.created
Issueit-Delivery: dlv_7n3k0q2m9x4b1c
Issueit-Signature: t=1793351564,v1=5f0c…e91a`;

const catalogue = `GET ${origin}/api/catalogue

[
  { "id": "github", "name": "GitHub Issues", "category": "tracker", "summary": "Creates an issue in a repository." },
  { "id": "pagerduty", "name": "PagerDuty", "category": "oncall", "summary": "…" },
  …
]`;

export default function Platform() {
  return (
    <SitePage title="Platform reference">
      <PageHead
        eyebrow="Platform"
        title={
          <>
            The exact contract,
            <br />
            <span className="text-text-3">header by header.</span>
          </>
        }
        lead={
          <>
            Every public endpoint, limit, signature and error code, as the server implements them. For a guided start, read the <Link to="/docs">documentation</Link> instead.
          </>
        }
      />
      <Article toc={toc} meta={<p className="article-meta">Reference · {toc.length} sections</p>}>
        <Section id="surfaces" title="Public surfaces">
          <p>
            Everything below is served from one origin by default. Hosted installs can split it across subdomains with <C>DROP_URL</C>, <C>CDN_URL</C> and <C>DOCS_URL</C>.
          </p>
          <Table
            head={["Method and path", "Auth", "Purpose"]}
            rows={[
              [<C>POST /v1/{"{project}"}/reports</C>, "Project id, or secret key", "Create a report. JSON or multipart."],
              [<C>GET /v1/{"{project}"}/widget</C>, "None", "Public widget settings and upload limits. Cached for 60 seconds."],
              [<C>GET /widget.js</C>, "None", "The widget script. No dependencies, no cookies."],
              [<C>GET /r/{"{project}"}</C>, "None", "Hosted report form. Strict CSP, frame-ancestors 'none'."],
              [<C>GET /a/{"{id}/{name}"}?exp=&sig=</C>, "Signed link", "Streams an attachment for links inside delivered issues."],
              [<C>GET /api/catalogue</C>, "None", "Every available destination: id, name, category, summary."],
              [
                <C>GET /health</C>,
                "None",
                <>
                  Database round trip. <C>{`{ "ok": true }`}</C> or a 500.
                </>,
              ],
            ]}
          />
        </Section>

        <Section id="ingest" title="Ingestion API">
          <Code code={`POST ${origin}/v1/{project_id}/reports`} what="endpoint" />
          <p>
            Send <C>application/json</C>, or <C>multipart/form-data</C> with a <C>report</C> part holding the JSON and repeated <C>attachments</C> parts. JSON bodies may carry attachments inline as{" "}
            <C>{`[{ filename, data }]`}</C> with base64 data. The JSON part is capped at 256 KB; the whole request at that plus the attachment allowance with base64 overhead.
          </p>
          <Table
            head={["Field", "Type", "Rules"]}
            rows={[
              [<C>title</C>, "string", "Required. 1 to 200 characters."],
              [<C>description</C>, "string", "Up to 20,000 characters."],
              [
                <C>severity</C>,
                "enum",
                <>
                  <C>low</C> · <C>medium</C> · <C>high</C> · <C>critical</C>. Alias <C>priority</C>. Defaults to <C>medium</C>.
                </>,
              ],
              [
                <C>source</C>,
                "string",
                <>
                  Free label for routing rules, such as <C>ios</C>. Defaults to <C>api</C>.
                </>,
              ],
              [
                <C>environment</C>,
                "string",
                <>
                  For example <C>production</C>. Routing rules can match it.
                </>,
              ],
              [<C>page_url</C>, "url", "Absolute URL."],
              [<C>browser</C>, "string", "Free text. Parsed from the user agent when absent."],
              [
                <C>email</C>,
                "email",
                <>
                  Or <C>{`reporter: { email, name }`}</C>.
                </>,
              ],
              [<C>metadata</C>, "object", "Any JSON object up to 16 KB. Delivered as-is."],
              [<C>attachments</C>, "array", "Up to 5 files of 10 MB each, by default."],
            ]}
          />
          <Code code={multipart} what="request" />
          <Code code={created} what="response" />
          <p>Accepted attachment types are sniffed from the bytes, not trusted from the name: images, video, PDF, plain text and zip. SVG and HTML are refused because they can carry script.</p>
        </Section>

        <Section id="auth" title="Keys and origins">
          <Table
            head={["Credential", "Where it belongs", "What the server does"]}
            rows={[
              [<C>prj_…</C>, "Browsers, apps, anywhere", "Identifies the project. Can only create reports. Checked against the project's allowed origins when it has any."],
              [
                <C>sk_live_…</C>,
                "Your servers only",
                <>
                  Sent as <C>Authorization: Bearer</C>. Looked up by its SHA-256 hash. Refused with <C>key_in_browser</C> if the request carries a foreign <C>Origin</C>.
                </>,
              ],
            ]}
          />
          <p>
            Ingestion answers CORS preflights for any origin, allowing <C>GET</C>, <C>POST</C> and <C>OPTIONS</C> with <C>content-type</C> and <C>authorization</C> headers, cached for a day. Whether a
            submission is accepted is decided afterwards by the project: public submissions on or off, and its allowed origins.
          </p>
        </Section>

        <Section id="widget" title="Widget runtime">
          <Code code={`<script src="${origin}/widget.js" data-project="prj_abc123" defer></script>`} what="snippet" />
          <Table
            head={["Attribute", "Values"]}
            rows={[
              [<C>data-project</C>, "Required. The project id."],
              [
                <C>data-theme</C>,
                <>
                  <C>auto</C> · <C>light</C> · <C>dark</C>. Overrides the project setting.
                </>,
              ],
              [
                <C>data-mode</C>,
                <>
                  <C>inline</C> draws the form inside <C>data-target</C> (a selector) instead of a floating button.
                </>,
              ],
              [
                <C>data-source</C>,
                <>
                  Report source label. Defaults to <C>widget</C>.
                </>,
              ],
            ]}
          />
          <Code code={runtime} what="example" />
          <p>The widget attaches this context to every report, and says so in the form:</p>
          <Table
            head={["Key", "Read from"]}
            rows={[
              [<C>userAgent</C>, <C>navigator.userAgent</C>],
              [<C>viewport</C>, <C>innerWidth × innerHeight</C>],
              [<C>screen</C>, <C>screen.width × screen.height</C>],
              [<C>language</C>, <C>navigator.language</C>],
              [<C>timezone</C>, <C>Intl.DateTimeFormat().resolvedOptions().timeZone</C>],
              [
                <C>referrer</C>,
                <>
                  <C>document.referrer</C>, when there is one
                </>,
              ],
            ]}
          />
          <p>
            Screenshots use <C>getDisplayMedia</C> with <C>preferCurrentTab</C>, so the browser asks first and nothing is captured without that permission. The widget sets no cookies and writes
            nothing to storage.
          </p>
        </Section>

        <Section id="webhooks" title="Webhook events">
          <Table
            head={["Event", "Sent when"]}
            rows={[
              [<C>report.created</C>, "A report is stored."],
              [<C>report.updated</C>, "Its status or priority is changed in the dashboard."],
              [
                <C>report.resolved</C>,
                <>
                  Its status becomes resolved. Sent alongside <C>report.updated</C>.
                </>,
              ],
              [
                <C>report.closed</C>,
                <>
                  Its status becomes closed. Sent alongside <C>report.updated</C>.
                </>,
              ],
            ]}
          />
          <Code code={headers} what="headers" />
          <p>
            Answer with any 2xx within 15 seconds. Redirects are not followed and count as failures. A <C>410 Gone</C> stops retries for that delivery; anything else is retried on the schedule below.
            At most 64 KB of your response is read.
          </p>
        </Section>

        <Section id="signatures" title="Signatures">
          <p>
            <C>Issueit-Signature</C> is <C>{"t=<unix seconds>,v1=<hex>"}</C>, where the hex is HMAC-SHA256 over <C>{"<t>.<raw body>"}</C> keyed with the destination's signing secret. Compare in
            constant time and reject timestamps more than five minutes old. Use the raw bytes: re-serialised JSON won't match.
          </p>
          <Code code={node} what="Node.js verification" />
          <Code code={python} what="Python verification" />
          <Code code={go} what="Go verification" />
          <Note>Secrets can be rotated from the destination's settings. The new secret signs the next attempt, including retries of older deliveries, so roll your receiver first.</Note>
        </Section>

        <Section id="delivery" title="Delivery and retries">
          <p>
            Ingestion stores the report first, then queues one <C>deliveries</C> row per matching destination in PostgreSQL itself, so there's no separate queue to lose. Workers claim rows in batches
            of 10 with <C>FOR UPDATE SKIP LOCKED</C> and hold each for up to 120 seconds; a crashed worker's rows become claimable again when that lock lapses.
          </p>
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
            A delivery is unique per report, event and destination (and, for updates, per change), and keeps its <C>Issueit-Delivery</C> id across attempts, so receivers can drop duplicates. Errors a
            retry can't fix, such as a revoked token or a deleted repository, stop at once and say why. Any delivery can be retried by hand from the report.
          </p>
        </Section>

        <Section id="egress" title="Egress rules">
          <p>Requests to addresses that users type in (webhooks, self-hosted trackers, most catalogue services) go through one guarded client:</p>
          <ul>
            <li>
              Only <C>http</C> and <C>https</C>, with no credentials in the URL.
            </li>
            <li>
              <C>localhost</C>, <C>*.local</C>, <C>*.internal</C> and private ranges are refused before connecting: <C>10/8</C>, <C>100.64/10</C>, <C>127/8</C>, <C>169.254/16</C>, <C>172.16/12</C>,{" "}
              <C>192.168/16</C>, <C>198.18/15</C>, documentation ranges, multicast and reserved space, plus their IPv6 equivalents.
            </li>
            <li>The hostname is resolved once, the answer is checked, and the connection is pinned to that address, so DNS rebinding can't swap it afterwards.</li>
            <li>Redirects are never followed. Connections time out after 10 seconds and whole requests after 15 to 20.</li>
          </ul>
          <p>
            Self-hosted installs that deliver inside their own network can set <C>WEBHOOK_ALLOW_PRIVATE=true</C>.
          </p>
        </Section>

        <Section id="limits" title="Limits">
          <Table
            head={["Limit", "Default", "Variable"]}
            rows={[
              ["Reports per visitor, per project", "10 a minute", <C>RATE_LIMIT_IP_PER_MINUTE</C>],
              ["Reports per secret key", "120 a minute", <C>RATE_LIMIT_KEY_PER_MINUTE</C>],
              ["Reports per project", "1,000 an hour", <C>RATE_LIMIT_PROJECT_PER_HOUR</C>],
              ["Reports per project, per month", "Unlimited", <C>PLAN_REPORTS_PER_MONTH</C>],
              ["Attachments per report", "5", <C>MAX_ATTACHMENTS_PER_REPORT</C>],
              ["Size of each attachment", "10 MB", <C>MAX_ATTACHMENT_MB</C>],
              ["Attachment storage per organisation", "Unlimited", <C>PLAN_STORAGE_MB</C>],
              ["JSON body", "256 KB", "Fixed"],
            ]}
          />
          <p>
            Visitors are counted by a keyed hash of their IP address; the address itself isn't stored. Windows are fixed and held in memory, which suits the default single process. A <C>429</C>{" "}
            carries <C>Retry-After</C> in seconds:
          </p>
          <Code code={limited} what="response" />
        </Section>

        <Section id="errors" title="Error codes">
          <p>
            Ingestion errors are <C>{`{ "success": false, "error": { "code", "message" } }`}</C>. Messages are written for people and safe to show; branch on the code.
          </p>
          <Table
            head={["Status", "Code", "Meaning"]}
            rows={[
              ["400", <C>invalid_request</C>, "A field didn't validate. The message names it."],
              ["400", <C>key_in_browser</C>, "A secret key was sent from a web page."],
              ["401", <C>invalid_key</C>, "The key is wrong, revoked or for another project."],
              ["403", <C>public_disabled</C>, "The project only accepts reports with a secret key."],
              ["403", <C>origin_not_allowed</C>, "The page's origin isn't in the project's allowed sites."],
              ["403", <C>link_expired</C>, "An attachment link's signature or expiry failed."],
              ["404", <C>not_found</C>, "No such project, or no such attachment."],
              ["413", <C>payload_too_large</C>, "The request body is over the limit."],
              ["413", <C>attachment_too_large</C>, "One file is over the per-file limit."],
              ["415", <C>unsupported_attachment</C>, "The bytes aren't an accepted file type."],
              [
                "429",
                <C>rate_limited</C>,
                <>
                  Too many reports. Honour <C>Retry-After</C>.
                </>,
              ],
              ["429", <C>plan_limit</C>, "The project's monthly allowance is used up."],
              ["500", <C>server_error</C>, "Something failed on our side. Safe to retry."],
              ["507", <C>storage_full</C>, "The organisation's attachment storage is full."],
            ]}
          />
        </Section>

        <Section id="ids" title="Object ids">
          <p>
            Ids are a prefix, an underscore and 14 lowercase base-36 characters from a cryptographic source, sampled without bias. Treat them as opaque strings; the prefix is there for humans and
            logs.
          </p>
          <Table
            head={["Prefix", "Object"]}
            rows={[
              [<C>prj_</C>, "Project"],
              [<C>rep_</C>, "Report"],
              [<C>att_</C>, "Attachment"],
              [<C>dlv_</C>, "Delivery, one per report, event and destination"],
              [<C>evt_</C>, "Webhook event"],
              [<C>dst_</C>, "Destination"],
              [<C>con_</C>, "Connected account"],
              [<C>key_</C>, "Secret key record (the key itself is sk_live_…)"],
              [<C>org_</C>, "Organisation"],
              [<C>usr_</C>, "User"],
              [<C>inv_</C>, "Invitation"],
            ]}
          />
        </Section>

        <Section id="attachments" title="Signed attachment links">
          <Code code={`${origin}/a/att_…/screenshot.png?exp=1795943564&sig=Qm9…`} what="link" />
          <p>
            Issues created in other tools link to attachments rather than copying them. <C>sig</C> is an HMAC-SHA256 of <C>{"<id>.<exp>"}</C> under the server's <C>SECRET_KEY</C>, base64url-encoded;
            <C>exp</C> is a Unix time, 30 days out by default (<C>ATTACHMENT_LINK_DAYS</C>). Rotating <C>SECRET_KEY</C> invalidates every outstanding link.
          </p>
        </Section>

        <Section id="catalogue" title="Catalogue and health">
          <Code code={catalogue} what="example" />
          <p>
            The catalogue is public and unauthenticated; the dashboard, the documentation and this site all read it, so they can't disagree. Categories are <C>tracker</C>, <C>helpdesk</C>, <C>chat</C>
            , <C>notify</C>, <C>email</C>, <C>oncall</C>, <C>data</C>, <C>automation</C>, <C>analytics</C>, <C>cloud</C> and <C>webhook</C>.
          </p>
          <p>
            <C>GET /health</C> runs <C>select 1</C> against PostgreSQL. Point load balancers and uptime checks at it.
          </p>
        </Section>

        <Section id="environment" title="Environment">
          <Table
            head={["Variable", "Default", "Effect"]}
            rows={[
              [<C>APP_URL</C>, <C>http://localhost:8380</C>, "Public base URL. Secure cookies switch on when it's https."],
              [
                <C>ROLE</C>,
                <C>all</C>,
                <>
                  <C>api</C> serves HTTP only, <C>worker</C> only delivers. Run several workers against one database.
                </>,
              ],
              [<C>DATABASE_URL</C>, "Local PostgreSQL", "The compose file runs PostgreSQL 17."],
              [<C>ENCRYPTION_KEY</C>, "Required", "AES-256-GCM key for stored credentials. Back it up with the database."],
              [<C>SECRET_KEY</C>, "Required", "Signs attachment links and keys the IP hashes used for rate limits."],
              [<C>DROP_URL</C>, <C>APP_URL</C>, "Where widgets send reports."],
              [<C>CDN_URL</C>, <C>APP_URL</C>, "Where widget.js is served from."],
              [<C>DOCS_URL</C>, <C>APP_URL/docs</C>, "Where documentation links point."],
              [
                <C>TRUST_PROXY</C>,
                <C>false</C>,
                <>
                  Read the client address from <C>X-Forwarded-For</C>. Only behind a proxy you run.
                </>,
              ],
              [<C>ALLOW_SIGNUP</C>, <C>true</C>, "Turn off to make an install invitation-only."],
              [<C>WEBHOOK_ALLOW_PRIVATE</C>, <C>false</C>, "Allow deliveries to private addresses."],
              [<C>DATA_DIR</C>, <C>./data</C>, "Where attachments are written."],
              [
                <C>SMTP_URL</C>,
                "Unset",
                <>
                  Outgoing mail, sent as <C>SMTP_FROM</C>.
                </>,
              ],
              [<C>{"<SERVICE>_CLIENT_ID"}</C>, "Unset", "Turns on sign-in connections for that service. See the documentation."],
            ]}
          />
        </Section>
      </Article>
    </SitePage>
  );
}
