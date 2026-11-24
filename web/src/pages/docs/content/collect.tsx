import type { ComponentType } from "react";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Code, CodeTabs, D, Endpoint, Facts, H2, H3, Params, Step, Steps, Table } from "../kit";

/** Collect: the widget, the hosted form, the intake API and the SDKs around it. */

function Widget() {
  const urls = useUrls();
  return (
    <>
      <p>
        One script tag puts a report button on every page. It is a single file with no dependencies, sets no cookies, writes nothing to storage, and renders inside a shadow root so your styles and
        its styles can't reach each other.
      </p>
      <Code
        title="Any page"
        lang="html"
        code={`<script
  src="${urls.cdn}/widget.js"
  data-project="prj_abc123"
  defer
></script>`}
      />

      <H2>What it sends</H2>
      <p>
        The person writes a title and a description, and can attach files or — where the browser allows it, and only after granting permission — take a screenshot of the tab. Alongside that, the
        widget attaches the context a developer would otherwise have to ask for, and says so in the form:
      </p>
      <Table
        head={["Attached", "Read from"]}
        rows={[
          [<C>page_url</C>, <><C>location.href</C>, with anything secret taken out of it</>],
          [<C>browser</C>, <>Parsed from <C>navigator.userAgent</C></>],
          [<C>viewport</C>, <C>innerWidth × innerHeight</C>],
          [<C>screen</C>, <C>screen.width × screen.height</C>],
          [<C>language</C>, <C>navigator.language</C>],
          [<C>timezone</C>, <C>Intl.DateTimeFormat().resolvedOptions().timeZone</C>],
          [<C>referrer</C>, <><C>document.referrer</C>, when there is one, cleaned the same way</>],
        ]}
      />
      <p>
        An address can carry the one thing nobody wants stored. A password reset puts its token in the query string, single sign-on hands one back in the fragment, and an invitation link has an email
        address in it. So the path and the names of the query stay — a checkout that only fails for one order id has to be findable again — while the value of any parameter whose name gives it away is
        replaced with <C>[redacted]</C>, in the fragment as well as the query, and so is a long opaque path segment that isn't an id. The server does the same again on the way in, with{" "}
        your project's own <D to="/collect/diagnostics">redaction rules</D> on top, because not every report arrives through the widget.
      </p>
      <p>
        It also keeps the last few dozen console errors, network requests and steps in the visitor's browser and sends them with the report. That is the part that turns "it doesn't work" into
        something fixable, and it has its own page: <D to="/collect/diagnostics">diagnostics capture</D>.
      </p>

      <H2>Script attributes</H2>
      <Params
        rows={[
          { name: "data-project", type: "string", required: true, children: <>The project id. Public — it can create a report and nothing else.</> },
          {
            name: "data-mode",
            type: `"button" | "inline"`,
            children: (
              <>
                <C>inline</C> draws the form inside the element matched by <C>data-target</C> instead of a floating button. Good for a "Report a problem" page of your own.
              </>
            ),
          },
          { name: "data-target", type: "selector", children: <>Where to draw the inline form, for example <C>#report</C>. Only read in inline mode.</> },
          { name: "data-theme", type: `"auto" | "light" | "dark"`, children: <>Overrides the theme chosen in the project's widget settings.</> },
          { name: "data-source", type: "string", children: <>Labels where these reports came from. Defaults to <C>widget</C>. <D to="/deliver/routing">Routing rules</D> can match it, so a marketing site and an app can share a project but not a destination.</> },
          { name: "data-capture", type: `"off"`, children: <>Records no console messages, requests or steps on this page. Nothing is kept in memory, so there is nothing to send.</> },
          { name: "data-debug", type: `"true"`, children: <>Prints the exact report to the console and sends nothing. The way to see what the widget would capture before you turn it loose on real visitors.</> },
        ]}
      />
      <Callout kind="note" title="Everything else is a project setting">
        <p>
          The button's label, size, shape and position, which fields appear, the questions, the colours, the logo, the success message and the keyboard shortcut are set in the dashboard under the
          project's <strong>Widget</strong> tab and previewed there. They aren't attributes, so you can change them without a deploy.
        </p>
      </Callout>

      <H2>Where to put it</H2>
      <Facts
        rows={[
          ["Every page", "The launcher is small and loads after your own content. One tag in the template is the usual answer."],
          ["A single-page app", <>Add it once. The widget notices route changes by itself and records them as steps. If your app mounts late, see <D to="/collect/widget-api">the runtime API</D>.</>],
          ["Behind a sign-in", <>Call <C>Issueit.identify()</C> once you know who the visitor is and the email field disappears.</>],
          ["A closed project", <>If the project refuses public reports, the page needs a <D to="/collect/browser-tokens">browser token</D> instead of the project id alone.</>],
        ]}
      />

      <H2>Content security policy</H2>
      <p>If your site sends a CSP — and it should — the widget needs two things: permission to load its script, and permission to reach intake.</p>
      <Code
        title="Content-Security-Policy"
        code={`script-src 'self' ${urls.cdn};
connect-src 'self' ${urls.drop};
img-src 'self' data: blob:;`}
      />
      <p>
        <C>img-src</C> needs <C>data:</C> and <C>blob:</C> because attachment previews and the screenshot are held in the page before they're sent. The widget's own styles live in its shadow root
        and are injected as a stylesheet rather than inline, so <C>style-src 'unsafe-inline'</C> is not required.
      </p>

      <H2>What it costs the page</H2>
      <Facts
        rows={[
          ["One request", <>The script, cached for five minutes, served with <C>access-control-allow-origin: *</C>.</>],
          ["No dependencies", "No framework, no polyfills, nothing from a third party."],
          ["No cookies or storage", "Nothing to disclose in a cookie banner, and nothing to clear."],
          ["Deferred", <>With <C>defer</C> it parses after your content. Capture starts as soon as the script runs, so load it early in the head if you want the earliest errors.</>],
        ]}
      />
    </>
  );
}

function WidgetApi() {
  const urls = useUrls();
  return (
    <>
      <p>
        The script puts a small object on <C>window.Issueit</C>. Everything on it is safe to call before the widget has finished loading except <C>mount</C>, and calling the others early is a no-op
        rather than an error.
      </p>
      <Code
        title="window.Issueit"
        lang="ts"
        code={`interface Issueit {
  open(): void;
  close(): void;
  identify(user: { email?: string; name?: string }): void;
  setMetadata(metadata: Record<string, unknown>): void;
  mount(options: MountOptions): Instance;
}`}
      />

      <H2>Identify the person reporting</H2>
      <p>
        If you know who the visitor is, say so. The email field disappears from the form — one less thing to type — and the report arrives with an address, so Issueit can{" "}
        <D to="/reports/emails">tell them when it's fixed</D>.
      </p>
      <Code
        lang="js"
        title="After sign-in"
        code={`Issueit.identify({ email: user.email, name: user.name });`}
      />

      <H2>Attach your own metadata</H2>
      <p>
        Anything you put here arrives with every report from then on, as <C>metadata</C>, and is delivered to destinations as-is. Up to 16 KB of JSON. This is where the identifiers that let you find
        the person's row in your own database belong.
      </p>
      <Code
        lang="js"
        title="Context worth having"
        code={`Issueit.setMetadata({
  user_id: user.id,
  plan: org.plan,
  build: import.meta.env.VITE_GIT_SHA,
  feature_flags: Object.keys(flags.enabled),
});`}
      />
      <Callout kind="warning" title="Metadata is delivered, not hidden">
        <p>
          It appears in the issue, the Slack message and the webhook body. Don't put anything in it that shouldn't travel to the services you deliver to, and remember the report is also visible to
          everyone in your organisation.
        </p>
      </Callout>

      <H2>Open the form yourself</H2>
      <p>If you'd rather have your own "Report a problem" item in a menu, keep the script and hide its launcher in the project's widget settings, then open the form from your own control.</p>
      <Code
        lang="js"
        code={`document.querySelector("#report-bug").addEventListener("click", () => Issueit.open());`}
      />
      <p>
        A keyboard shortcut is a project setting rather than something you wire up — set it under the project's <strong>Widget</strong> tab and the script listens for it on every page.
      </p>

      <H3>Reacting to a crash</H3>
      <p>
        Opening the form from an error handler turns a white screen into a report. In React, <D to="/collect/sdks">@issueit/react</D> does this with an error boundary that files the bug whether or not
        anybody fills anything in.
      </p>
      <Code
        lang="js"
        title="Plain JavaScript"
        code={`window.addEventListener("unhandledrejection", (e) => {
  Issueit.setMetadata({ last_rejection: String(e.reason).slice(0, 200) });
  Issueit.open();
});`}
      />

      <H2>Mounting by hand</H2>
      <p>
        <C>mount</C> is for the awkward cases: two widgets on one page, a form drawn into a container that doesn't exist at load time, or a project id you only know at runtime. It returns an instance
        you can update and destroy.
      </p>
      <Code
        lang="js"
        title="Inline, after your app has rendered"
        code={`const instance = Issueit.mount({
  project: "prj_abc123",
  mode: "inline",
  target: document.querySelector("#report"),
  source: "help-centre",
});

// Later, when that view unmounts:
instance.destroy();`}
      />
      <Params
        rows={[
          { name: "project", type: "string", required: true, children: "The project id." },
          { name: "mode", type: `"button" | "inline"`, children: "A floating launcher, or the form drawn into your own element." },
          { name: "target", type: "Element", children: "The container for inline mode." },
          { name: "source", type: "string", children: "The source label on reports from this instance." },
          { name: "theme", type: `"auto" | "light" | "dark"`, children: "Overrides the project's theme." },
          { name: "debug", type: "boolean", children: "Log the report that would be sent, and send nothing." },
        ]}
      />

      <H2>Loading the script yourself</H2>
      <p>
        Bundlers and strict CSPs sometimes make a plain script tag awkward. Loading it by hand is the same thing; set <C>data-project</C> on the element and it starts on its own.
      </p>
      <Code
        lang="js"
        code={`const s = document.createElement("script");
s.src = "${urls.cdn}/widget.js";
s.dataset.project = "prj_abc123";
s.defer = true;
document.head.appendChild(s);`}
      />
    </>
  );
}

function Diagnostics() {
  return (
    <>
      <p>
        "It doesn't work" is not a bug report. What makes one fixable is the half-minute before somebody gave up: the exception in the console, the request that came back 500, the three things they
        clicked. The widget keeps all of that in memory and sends it with the report.
      </p>

      <H2>The three lists</H2>
      <Table
        head={["List", "Holds", "Keeps"]}
        rows={[
          [
            <C>console</C>,
            <>
              <C>console.error</C> and <C>console.warn</C> calls, uncaught errors, unhandled promise rejections and failed resource loads, with stacks where the browser gives one.
            </>,
            "40 entries",
          ],
          [<C>network</C>, <><C>fetch</C> and <C>XMLHttpRequest</C> calls: method, path, status and how long each took.</>, "40 entries"],
          [<C>steps</C>, "Clicks, page changes and which fields were edited.", "30 entries"],
        ]}
      />
      <p>
        Each entry carries <C>t</C>: milliseconds before the report was sent. Recording starts the moment the script runs, not when the form opens, so the error that caused the problem is usually
        already in the list by the time anyone thinks to report it.
      </p>
      <Code
        title="As delivered"
        lang="json"
        code={`"diagnostics": {
  "console": [
    { "t": 4210, "level": "error",
      "message": "TypeError: Cannot read properties of undefined (reading 'id')",
      "stack": "at submit (login.js:41:12)" }
  ],
  "network": [
    { "t": 4380, "method": "POST", "url": "/api/session", "status": 500, "ms": 182 }
  ],
  "steps": [
    { "t": 5100, "kind": "navigate", "label": "/checkout" },
    { "t": 4500, "kind": "click", "label": "button \\"Log in\\"" }
  ]
}`}
      />

      <H2>What is deliberately not recorded</H2>
      <p>Diagnostics are the most sensitive part of a bug report, so the recording is narrow by design rather than filtered afterwards.</p>
      <Facts
        rows={[
          ["Typed values", "Steps say which field changed, never what was put in it. Password fields aren't recorded at all, and a rich text editor is recorded as \"text editor\"."],
          ["Request and response bodies", "Never read. A network entry is a method, a path, a status and a duration."],
          ["Headers and cookies", "Never read. Neither is the document's own cookie."],
          ["Query string values", <>Parameter names are kept, values replaced: <C>/search?q=…&amp;page=…</C>.</>],
          ["Keystrokes and the screen", "Nothing resembling session replay. A screenshot only ever happens when the person presses the button and the browser asks permission."],
        ]}
      />

      <H2>Scrubbing</H2>
      <p>
        What is recorded is then scrubbed — in the browser before it is ever stored in memory, and again on the server before it is written down, so a pattern added later still protects reports as
        they arrive.
      </p>
      <Table
        head={["Pattern", "Becomes"]}
        rows={[
          [<>Email addresses</>, <C>[email]</C>],
          [<><C>Authorization: Bearer …</C> and <C>Basic …</C></>, <C>bearer [redacted]</C>],
          [<>Anything named like a secret — <C>token</C>, <C>apiKey</C>, <C>password</C>, <C>session</C>, <C>cookie</C>, <C>credential</C> — with its value</>, <C>[redacted]</C>],
          [<>JSON web tokens (<C>eyJ…</C>)</>, <C>[token]</C>],
          [<>Runs of 13 to 19 digits, which is what a card number looks like</>, <C>[number]</C>],
          [<>Any unbroken 32-character or longer token-shaped string</>, <C>[redacted]</C>],
        ]}
      />
      <p>
        A project's <D to="/reports/duplicates">Rules</D> tab adds patterns of your own on top of these, and previews them against that project's last hundred reports so you can see exactly what
        would have been removed before you save.
      </p>

      <H2>Turning it off</H2>
      <p>There are four switches, and any of them is enough.</p>
      <Steps>
        <Step title="Per project">
          <p>
            The project's <strong>Widget</strong> tab has one switch per list: console, network and steps. Recording has to start before the settings have arrived, or the moments before someone opens
            the form are already gone — so a switch that's off takes effect the instant the answer lands: whatever was collected is dropped, nothing more is recorded, and the page gets its own{" "}
            <C>fetch</C>, <C>console</C> and history back. The server wouldn't store it if it arrived anyway. To record nothing at all, not even for that first moment, use <C>data-capture="off"</C>.
          </p>
        </Step>
        <Step title="Per page">
          <p>
            <C>data-capture="off"</C> on the script tag. Nothing is recorded on that page — the checkout, the account settings, wherever you'd rather not have a list of requests.
          </p>
        </Step>
        <Step title="Per report">
          <p>The form shows what will be attached and offers a tick box. Someone who unticks it sends a report with no diagnostics.</p>
        </Step>
        <Step title="After the fact">
          <p>
            <D to="/reports/retention">Retention</D> deletes attachments and diagnostics on a schedule while keeping the report itself. Delete a single report's diagnostics from the report, any time.
          </p>
        </Step>
      </Steps>

      <H2>Sending your own</H2>
      <p>
        A mobile app, a server or a test suite can send the same three lists through the <D to="/collect/intake-api">intake API</D>. The shape is the one above; <C>t</C> is milliseconds before
        sending. Everything that scrubs the widget's recording scrubs yours as well.
      </p>
      <Callout kind="tip" title="Reading them later">
        <p>
          <C>issueit show 42</C> prints a report with its three lists in the terminal, and an <D to="/automate/mcp">agent</D> asking for <C>get_report</C> gets them as Markdown. That is usually
          enough to find the fault without opening a browser.
        </p>
      </Callout>
    </>
  );
}

function Form() {
  const urls = useUrls();
  return (
    <>
      <p>
        Every project has a public page that collects reports with no script tag anywhere. It is the same form the widget draws, follows the same project settings, and is the answer whenever you
        can't — or shouldn't — put JavaScript on the page.
      </p>
      <Endpoint method="GET" path="/r/{project_id}" auth="None" />
      <Code title="The address" code={`${urls.drop}/r/prj_abc123`} />

      <H2>What it's for</H2>
      <Facts
        rows={[
          ["Support replies", "Paste the link when someone emails you a vague problem, and get back something a developer can act on."],
          ["QA and beta testers", "A bookmark, so nobody has to find the button."],
          ["A native app", "Open it in a web view, or link to it from an about screen."],
          ["Printed things", "A QR code on a kiosk, a card in a box, a sticker on a machine."],
          ["Internal tools", "A site you'd rather not add a script to at all."],
        ]}
      />

      <H2>How it differs from the widget</H2>
      <Table
        head={["", "Widget", "Hosted form"]}
        rows={[
          ["Where", "Inside your product", "A page on Issueit"],
          [
            "Source label",
            <C>widget</C>,
            <C>form</C>,
          ],
          ["Page address", "The page they were on", "Whatever they type, if anything"],
          ["Diagnostics", "Console, network and steps from your site", "None — there is nothing to watch"],
          ["Screenshot", "Of the tab, with permission", "An uploaded file"],
          ["Appearance", "The project's widget settings", "The same settings, on a page of its own"],
        ]}
      />
      <p>
        Because reports from the form arrive with <C>source: "form"</C>, you can route them differently: a support queue rather than the engineering tracker, say. See{" "}
        <D to="/deliver/routing">routing and policy</D>.
      </p>

      <H2>Appearance and branding</H2>
      <p>
        The page takes the project's logo, brand name, accent colour, title, fields and success message from the project's <strong>Widget</strong> tab. It is served with a strict content security
        policy and <C>frame-ancestors 'none'</C>, so it can't be framed by anyone — including you.
      </p>
      <Callout kind="note" title="Closed projects">
        <p>
          A project that refuses public reports refuses them here too, and the page says so rather than pretending to work. The hosted form is public by nature; if you need a closed intake, use the{" "}
          <D to="/collect/intake-api">API</D> with a secret key.
        </p>
      </Callout>
    </>
  );
}

function IntakeApi() {
  const urls = useUrls();
  return (
    <>
      <p>
        One request creates a report. No SDK, no handshake, no session: the project id in the path says where it belongs, and the body is the report. Everything the widget does, it does through this
        endpoint.
      </p>
      <Endpoint method="POST" path="/v1/{project_id}/reports" auth="Project id, secret key or browser token" />

      <H2>The smallest useful request</H2>
      <CodeTabs
        tabs={[
          {
            label: "curl",
            code: `curl -X POST ${urls.drop}/v1/prj_abc123/reports \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Checkout total is wrong with a discount code",
    "description": "Applying SPRING20 takes 20% off the shipping as well.",
    "severity": "high",
    "page_url": "https://shop.example.com/checkout",
    "environment": "production",
    "email": "sam@example.com"
  }'`,
          },
          {
            label: "Node",
            code: `const res = await fetch("${urls.drop}/v1/prj_abc123/reports", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: \`Bearer \${process.env.ISSUEIT_SECRET_KEY}\`,
  },
  body: JSON.stringify({
    title: "Checkout total is wrong with a discount code",
    severity: "high",
    environment: process.env.NODE_ENV,
    metadata: { order_id: order.id },
  }),
});
const { report_id } = await res.json();`,
          },
          {
            label: "Python",
            code: `import os, requests

requests.post(
    "${urls.drop}/v1/prj_abc123/reports",
    headers={"authorization": f"Bearer {os.environ['ISSUEIT_SECRET_KEY']}"},
    json={
        "title": "Nightly reconciliation found a mismatch",
        "description": f"{len(missing)} rows didn't match",
        "severity": "high",
        "fingerprint": "nightly-reconciliation-mismatch",
    },
    timeout=10,
)`,
          },
          {
            label: "Go",
            code: `body, _ := json.Marshal(map[string]any{
	"title":       "Worker queue is backing up",
	"severity":    "critical",
	"environment": os.Getenv("ENV"),
	"fingerprint": "queue-backlog",
})
req, _ := http.NewRequest("POST", "${urls.drop}/v1/prj_abc123/reports", bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+os.Getenv("ISSUEIT_SECRET_KEY"))
res, err := http.DefaultClient.Do(req)`,
          },
        ]}
      />
      <Code
        title="201 Created"
        lang="json"
        code={`{ "success": true, "report_id": "rep_xyz789", "message": "Report received", "duplicate": false }`}
      />
      <p>
        Only <C>title</C> is required. Every other field makes the report more useful; the full list, with types and rules, is in the{" "}
        <D to="/reference/intake">intake API reference</D>.
      </p>

      <H2>The fields worth setting</H2>
      <Params
        rows={[
          { name: "title", required: true, type: "string", children: "What went wrong, in a line. Up to 200 characters. Also the first half of the duplicate fingerprint." },
          { name: "description", type: "string", children: "The detail. Up to 20,000 characters — a stack trace, a log extract, the steps to reproduce." },
          { name: "severity", type: "low · medium · high · critical", children: <>Alias <C>priority</C>. Trackers that have their own priority scale get the matching one.</> },
          { name: "source", type: "string", children: <>Where this came from: <C>ios</C>, <C>cron</C>, <C>support</C>. A routing rule can match it. Defaults to <C>api</C>.</> },
          { name: "environment", type: "string", children: <>Usually <C>production</C> or <C>staging</C>. Worth setting even when you only have one, because one day you won't.</> },
          { name: "fingerprint", type: "string", children: <>Your own grouping key. Reports sharing one are <D to="/reports/duplicates">grouped</D>, however differently their titles read.</> },
          { name: "release", type: "string", children: <>Which build this happened on, so a minified stack can be read through that build's <D to="/reports/releases">source maps</D>.</> },
          { name: "metadata", type: "object", children: "Up to 16 KB of your own JSON. Delivered as-is." },
          { name: "email", type: "string", children: <>The reporter's address, or <C>{`reporter: { email, name }`}</C>. With <C>notify: true</C> they hear when it's fixed.</> },
          { name: "diagnostics", type: "object", children: <>The <D to="/collect/diagnostics">three lists</D>, if you keep your own.</> },
          { name: "attachments", type: "array", children: <>Files, inline as base64 or as multipart parts. See below.</> },
        ]}
      />

      <H2>Attachments</H2>
      <p>
        Either send <C>multipart/form-data</C> with a <C>report</C> part holding the JSON and repeated <C>attachments</C> parts, or put them inline in the JSON as base64. Multipart is cheaper for
        anything large; inline is easier when you already have the bytes in memory.
      </p>
      <CodeTabs
        tabs={[
          {
            label: "Multipart",
            code: `curl -X POST ${urls.drop}/v1/prj_abc123/reports \\
  -H "Authorization: Bearer sk_live_…" \\
  -F 'report={"title":"Export produced an empty file","severity":"high"};type=application/json' \\
  -F 'attachments=@export.csv' \\
  -F 'attachments=@screenshot.png'`,
          },
          {
            label: "Inline base64",
            code: `{
  "title": "Export produced an empty file",
  "attachments": [
    { "filename": "export.csv", "data": "aWQsbmFtZQoxLFNhbQo=" }
  ]
}`,
          },
        ]}
      />
      <p>
        Up to 5 files of 10 MB each by default, and the type is decided by sniffing the bytes rather than trusting the name: images, video, PDF, plain text and zip are accepted. SVG and HTML are
        refused, because both can carry script. The current numbers for this install are in <D to="/reference/limits">limits</D>.
      </p>

      <H2>Which credential to send</H2>
      <Table
        head={["Caller", "Send", "Why"]}
        rows={[
          ["A web page", <>The project id alone</>, <>Public submissions, limited to the project's allowed sites.</>],
          [
            "A server, a cron job, CI",
            <><C>Authorization: Bearer sk_live_…</C></>,
            <>A higher rate limit, and it works whether or not the project accepts public reports.</>,
          ],
          [
            "A single-page app on a closed project",
            <>A <D to="/collect/browser-tokens">browser token</D></>,
            <>Your server mints it; it lasts up to an hour and only works for that project.</>,
          ],
        ]}
      />
      <Callout kind="warning" title="A secret key in a web page is a leaked key">
        <p>
          Issueit refuses a request that carries both a secret key and a browser's <C>Origin</C> header, with <C>key_in_browser</C>, rather than accepting it and letting you find out later.
        </p>
      </Callout>

      <H2>Errors</H2>
      <p>Every failure has the same shape, with a message written for a person and a code to branch on.</p>
      <Code
        lang="json"
        code={`{ "success": false, "error": { "code": "invalid_request", "message": "title: Add a short title." } }`}
      />
      <Table
        head={["Status", "Usually means"]}
        rows={[
          ["400", <>A field didn't validate, and the message names it.</>],
          ["401", "The secret key is wrong, revoked, or belongs to another project."],
          ["403", "The project refuses public reports, or the page's origin isn't in its allowed sites."],
          ["413", "The body or one attachment is over the limit."],
          ["415", "An attachment isn't a type Issueit accepts."],
          ["429", <>Too many reports. Wait <C>Retry-After</C> seconds.</>],
        ]}
      />
      <p>
        The full list, including the plan and storage codes, is in <D to="/reference/errors">error codes</D>.
      </p>

      <H2>Being a good client</H2>
      <Facts
        rows={[
          ["Never block on it", "Report in the background. A bug reporter that slows down a response is worse than no bug reporter."],
          ["Never throw", "Treat a failure to report as a log line, not an exception. The SDKs do this for you."],
          ["Send a fingerprint", <>One fault should be one bug, however many times it fires. See <D to="/reports/duplicates">duplicates</D>.</>],
          ["Use an idempotency key", <>If a queue might deliver the same job twice, <D to="/collect/idempotency">say so</D>.</>],
          ["Honour 429", <>Back off for <C>Retry-After</C> seconds. The response says exactly how long.</>],
        ]}
      />
    </>
  );
}

function BrowserTokens() {
  const urls = useUrls();
  return (
    <>
      <p>
        A project can be closed: no public submissions, so the project id alone creates nothing. That protects you from someone else's script filing reports into your inbox — and it stops your own
        single-page app reporting, because a secret key can't go in a web page.
      </p>
      <p>A browser token is the way through. Your server mints one with its secret key and hands it to the page. It lasts up to an hour and works for one project.</p>
      <Endpoint method="POST" path="/v1/{project_id}/token" auth="Secret key" />

      <H2>Minting one</H2>
      <Code
        title="On your server, for a signed-in visitor"
        lang="js"
        code={`app.get("/api/report-token", requireSignIn, async (req, res) => {
  const r = await fetch("${urls.drop}/v1/prj_abc123/token?seconds=600", {
    method: "POST",
    headers: { authorization: \`Bearer \${process.env.ISSUEIT_SECRET_KEY}\` },
  });
  const { token, expires_at } = await r.json();
  res.json({ token, expires_at });   // hand this to the page
});`}
      />
      <Params
        rows={[
          { name: "seconds", type: "query, integer", children: "How long the token should live: 30 seconds to an hour, 300 by default. Shorter is better; the page can always ask for another." },
        ]}
      />
      <Code
        title="Response"
        lang="json"
        code={`{ "success": true, "token": "it_7n3k0q2m9x4b1c…",
  "expires_at": "2026-10-31T12:34:56.000Z", "max_seconds": 3600 }`}
      />

      <H2>Using it</H2>
      <p>
        Send it exactly as you would a secret key — <C>Authorization: Bearer it_…</C> — from the browser. Unlike a secret key, Issueit expects this one to come from a page.
      </p>
      <Code
        lang="js"
        code={`await fetch("${urls.drop}/v1/prj_abc123/reports", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: \`Bearer \${token}\` },
  body: JSON.stringify({ title, description, page_url: location.href }),
});`}
      />

      <H2>What the token can and can't do</H2>
      <Facts
        rows={[
          ["Can", "Create reports in the one project it was minted for."],
          ["Can't", "Read anything. Reach the management API. Work for another project. Outlive its expiry, which is at most an hour."],
          ["Rate limit", "The public per-visitor limit, not the secret key's higher one. A token is a browser, and is treated as one."],
          ["If it expires mid-session", <>Intake answers <C>401</C>. Fetch another and retry; a token is cheap to mint.</>],
        ]}
      />
      <Callout kind="tip" title="Do you need one?">
        <p>
          If your project accepts public reports — the default — you don't. Put the project id in the page and be done. Browser tokens are for when you want intake fenced to people who are signed in
          to <em>your</em> product, which is usually an internal tool or a paid app.
        </p>
      </Callout>

      <H2>Allowed sites, instead</H2>
      <p>
        There is a lighter option in between. A project's <strong>Settings → Allowed sites</strong> lists the origins that may use the project id. Requests from anywhere else are refused with{" "}
        <C>origin_not_allowed</C>. It is not a secret — an origin header can be forged outside a browser — but it stops the ordinary case of your project id being copied into somebody else's page.
      </p>
    </>
  );
}

function Idempotency() {
  const urls = useUrls();
  return (
    <>
      <p>Two things make automated reporting safe to deploy: a way to send the same report twice without filing it twice, and a way to find out what a report would do before it does it.</p>

      <H2>Idempotency keys</H2>
      <p>
        Send an <C>Idempotency-Key</C> header — or an <C>idempotency_key</C> field — and a repeat of that request files nothing new. You get the first report's id back, with{" "}
        <C>replayed: true</C> and an <C>idempotent-replay</C> header, so a queue that delivers at least once, or a retry after a timeout you never saw the answer to, is harmless.
      </p>
      <Code
        title="The same key twice"
        lang="sh"
        code={`curl -X POST ${urls.drop}/v1/prj_abc123/reports \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: job-5512-attempt" \\
  -d '{"title": "Nightly export failed"}'

# {"success":true,"report_id":"rep_xyz789","duplicate":false}
# …and again, same key:
# {"success":true,"report_id":"rep_xyz789","replayed":true}`}
      />
      <Facts
        rows={[
          ["Choose the key from the work, not the clock", "A job id, a message id, a build number. Something that is the same on the retry and different on the next piece of work."],
          ["Scope", "Per project. Two projects can use the same key for different reports."],
          ["Not the same as a fingerprint", <>A key says "this is the same request". A <D to="/reports/duplicates">fingerprint</D> says "this is the same fault". You often want both.</>],
        ]}
      />

      <H2>Dry runs</H2>
      <p>
        Add <C>?dry_run=1</C> and Issueit does everything except keep it: validates the report, scrubs it, works out its fingerprint, decides whether it would join an existing group, and names the
        destinations that would receive it and the ones that wouldn't, with the reason. Then it stores nothing and delivers nothing.
      </p>
      <Code
        title="What would happen"
        lang="sh"
        code={`curl -X POST "${urls.drop}/v1/prj_abc123/reports?dry_run=1" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Order #4821 failed to save", "page_url": "https://shop.example.com/orders/4821/edit"}'`}
      />
      <Code
        title="Response"
        lang="json"
        code={`{
  "success": true,
  "dry_run": true,
  "report": { "title": "Order #4821 failed to save", "priority": "medium",
              "source": "api", "environment": null, "release": null },
  "fingerprint": "t:4c1f8a90b7e2d653a1f0c8b94d27e3a6",
  "duplicate_of": { "id": "rep_abc", "number": 118,
                    "title": "Order #3310 failed to save", "seen": 7 },
  "destinations": [
    { "name": "acme/web", "provider": "github", "would_deliver": false,
      "why": "this report would join an open group, so it isn't delivered again" },
    { "name": "#incidents", "provider": "slack", "would_deliver": false,
      "why": "the destination's rule doesn't match this report" }
  ],
  "would_email": false,
  "message": "Nothing was stored."
}`}
      />

      <H3>What it's good for</H3>
      <Facts
        rows={[
          ["Testing a fingerprint", <>Change a <D to="/reports/duplicates">rule</D>, dry-run two real titles, see whether they'd merge.</>],
          ["Testing a routing rule", "Prove a critical report reaches on-call before you need it to."],
          ["Checking an integration", "Validate your client's payload in CI without filling an inbox with test bugs."],
          ["Debugging scrubbing", "See exactly what Issueit would have kept from a message that contains a token."],
        ]}
      />
      <Callout kind="note">
        <p>
          A dry run still costs a rate-limit slot, because the work is real; it does not count against a monthly allowance, because nothing was stored. Destinations are never contacted — to prove a
          destination itself works, use the test report on its settings page or <C>test_destination</C> from an <D to="/automate/mcp">agent</D>.
        </p>
      </Callout>
    </>
  );
}

function Sdks() {
  return (
    <>
      <p>
        Two thin packages over the intake API, for the two places a report usually comes from without anyone pressing a button. Both are MIT licensed, so they can be vendored into anything, and both
        default to the hosted service unless you point them at your own install.
      </p>

      <H2>@issueit/node</H2>
      <p>Errors from a server, with fingerprints and releases set properly so a thousand of one fault become one bug.</p>
      <Code title="Install" lang="sh" code="npm install @issueit/node" />
      <Code
        title="Set up once"
        lang="ts"
        code={`import { Issueit } from "@issueit/node";

const issueit = new Issueit({
  project: "prj_abc123",
  key: process.env.ISSUEIT_SECRET_KEY,   // keep this on the server
  release: process.env.GIT_SHA,
});

app.use(issueit.express());              // after your routes`}
      />
      <p>Two promises, because an error reporter that breaks the thing it watches is worse than no reporter at all:</p>
      <Facts
        rows={[
          ["It never throws into your code", "A failure to report is logged, not raised."],
          ["It never blocks a response", <>Middleware reports in the background. <C>await issueit.flush()</C> before a process exits.</>],
        ]}
      />
      <H3>Frameworks</H3>
      <Code
        lang="ts"
        code={`app.use(issueit.express());                  // Express, Connect
app.onError(issueit.hono());                 // Hono — re-throws, so your handler still runs
fastify.setErrorHandler(issueit.fastify());  // Fastify
issueit.catchAll();                          // uncaught exceptions and rejections`}
      />
      <H3>Reporting by hand</H3>
      <Code
        lang="ts"
        code={`await issueit.captureError(err, { metadata: { orderId } });

await issueit.report({
  title: "Nightly reconciliation found a mismatch",
  description: \`\${missing.length} rows didn't match\`,
  priority: "high",
  fingerprint: "nightly-reconciliation-mismatch",
});`}
      />
      <p>
        <C>captureError</C> builds the fingerprint from the error's name and the first frame of your own code, without line numbers — so the same fault doesn't become a new bug because somebody added
        an import above it.
      </p>
      <Params
        rows={[
          { name: "project", required: true, type: "string", children: "The project id." },
          { name: "key", type: "string", children: "A project secret key. Without one, the project must accept anonymous reports." },
          { name: "url", type: "string", children: <>Your Issueit, if you host it. Defaults to <C>ISSUEIT_URL</C>, then the hosted service.</> },
          { name: "release", type: "string", children: <>The build, so stacks can be mapped back. Defaults to <C>ISSUEIT_RELEASE</C>.</> },
          { name: "environment", type: "string", children: <>Defaults to <C>NODE_ENV</C>.</> },
          { name: "beforeSend", type: "(report) => report | null", children: "Change a report, or return null to drop it." },
          { name: "onError", type: "(error) => void", children: <>Called when a report can't be sent. Defaults to <C>console.warn</C>.</> },
        ]}
      />

      <H2>@issueit/react</H2>
      <p>An error boundary that files the bug, and a hook for reporting one yourself.</p>
      <Code title="Install" lang="sh" code="npm install @issueit/react" />
      <Code
        lang="tsx"
        code={`import { IssueitProvider, ErrorBoundary } from "@issueit/react";

<IssueitProvider project="prj_abc123" release={import.meta.env.VITE_GIT_SHA}>
  <ErrorBoundary fallback={({ retry }) => <Sorry onRetry={retry} />}>
    <App />
  </ErrorBoundary>
</IssueitProvider>;`}
      />
      <p>
        The boundary files the crash with the component stack attached, so you hear about a white screen even when nobody fills in a form. The provider also loads the{" "}
        <D to="/collect/widget">report widget</D>, whose questions and appearance are set in the dashboard rather than in your props.
      </p>
      <Code
        title="From your own code"
        lang="tsx"
        code={`const { report, open } = useIssueit();

await report({ title: "Upload rejected", metadata: { size: file.size } });
open();   // opens the widget's form`}
      />
      <Params
        rows={[
          { name: "project", required: true, type: "string", children: "The project id — public, and safe in a page." },
          { name: "url", type: "string", children: "Your Issueit, if you host it." },
          { name: "release", type: "string", children: "The build, so minified stacks can be mapped back." },
          { name: "environment", type: "string", children: <C>production</C> },
          { name: "widget", type: "boolean", children: <><C>false</C> to use the boundary without loading the widget.</> },
          { name: "debug", type: "boolean", children: "Log what would be sent and send nothing." },
        ]}
      />
      <Callout kind="note" title="Anything else">
        <p>
          There is no SDK for your language yet, and you don't need one: the <D to="/collect/intake-api">intake API</D> is one POST with a JSON body. If you write a wrapper worth sharing, we'd like
          to hear about it.
        </p>
      </Callout>
    </>
  );
}

/**
 * Roblox. Its game servers can't post to Discord, so most experiences send
 * webhooks through somebody's proxy; Issueit can be that, and send the
 * report on to everything else too.
 */
function Roblox() {
  const urls = useUrls();
  const hook = `${urls.drop}/v1/prj_abc123/webhook/sk_live_…`;
  return (
    <>
      <p>
        Discord refuses requests from Roblox game servers, so an experience that posts to a Discord webhook needs something in between. Issueit can be that: point the webhook at Issueit
        instead, and each post becomes a report that goes to Discord <em>and</em> to anything else the project delivers to, such as GitHub, Linear or Trello, with duplicates grouped and
        failed deliveries retried.
      </p>
      <p>There are two ways in. Use either, or both.</p>
      <Facts
        rows={[
          ["Change the webhook address", "Keep the code you have. Anything that posts Discord-style JSON works by swapping the URL."],
          ["The Issueit module", "A ModuleScript that sends script errors with the output before them, and lets players file reports from your own UI."],
        ]}
      />

      <H2>Before either</H2>
      <Steps>
        <Step title="Allow HTTP requests">
          <p>
            In Studio, <strong>Game Settings › Security › Allow HTTP Requests</strong>. Requests only ever go from the server: Roblox doesn't let clients make them.
          </p>
        </Step>
        <Step title="Create a secret key">
          <p>
            In the project, <strong>Overview › Collect reports › Roblox</strong> creates one and shows the address with it filled in. Name it after the experience, so you know what stops if you
            revoke it.
          </p>
        </Step>
        <Step title="Add a destination">
          <p>
            Reports go wherever the project delivers. To keep getting them in Discord, add a Discord destination to the project; it posts from Issueit's servers, which Discord accepts.
          </p>
        </Step>
      </Steps>
      <Callout kind="warning" title="The key is a password">
        <p>
          It only belongs in server Scripts, or in the experience's secrets read with <C>HttpService:GetSecret</C>. Never put it in a LocalScript, in ReplicatedStorage, or in a model you share.
          If it leaks, rotate it under <strong>API keys</strong>; the old one stops working at once.
        </p>
      </Callout>

      <H2>Change the webhook address</H2>
      <Endpoint method="POST" path="/v1/{project_id}/webhook/{secret_key}" auth="The secret key in the path" />
      <p>Replace the Discord URL in your game with this one. Nothing else changes.</p>
      <Code
        title="ServerScriptService"
        lang="lua"
        code={`local HttpService = game:GetService("HttpService")
local WEBHOOK = "${hook}"

HttpService:PostAsync(WEBHOOK, HttpService:JSONEncode({
	username = "Shop",
	embeds = {{
		title = "Purchase failed",
		description = "ProcessReceipt returned NotProcessedYet",
		fields = {
			{ name = "Player", value = player.Name },
			{ name = "Priority", value = "high" },
		},
	}},
}), Enum.HttpContentType.ApplicationJson)`}
      />
      <H3>How a post becomes a report</H3>
      <Table
        head={["From the post", "In the report"]}
        rows={[
          [<>The first embed's <C>title</C>, else the first line of <C>content</C></>, "Title, without its Markdown"],
          [<>The rest of <C>content</C>, every embed's description, fields and footer</>, "Description, as Markdown"],
          [<>A field named <C>Priority</C> or <C>Severity</C></>, <>Priority: <C>low</C>, <C>medium</C>, <C>high</C> or <C>critical</C></>],
          [<>A field named <C>Environment</C></>, "Environment"],
          ["Other fields", "Metadata, by field name"],
          [<C>username</C>, "Reporter name"],
          [<>The first embed's <C>url</C></>, "Page"],
        ]}
      />
      <p>
        Reports arrive in Discord formatted by Issueit, not as your original embed: the same title, description and fields, plus a link to the report. A post that is already an Issueit report
        (it has a <C>title</C>) is filed as it stands.
      </p>
      <Params
        rows={[
          { name: "priority", type: "query", children: "The priority when the post doesn't name one." },
          { name: "environment", type: "query", children: <>For example <C>studio</C> on the address your test place uses.</> },
          { name: "source", type: "query", children: <>Defaults to <C>roblox</C> from a game server, <C>webhook</C> from anywhere else.</> },
          { name: "wait", type: "query", children: <><C>true</C> answers 200 with the report id. Without it the answer is 204 and no body, as Discord's is.</> },
        ]}
      />
      <p>
        Multipart posts with the JSON in <C>payload_json</C> and files beside it work too; the files become attachments. A <C>GET</C> on the address checks the key without filing anything.
        Roblox labels a body as a form unless told otherwise, so the body is read as JSON whatever its content type says.
      </p>

      <H2>Channels: several webhooks from one game</H2>
      <p>
        A game that posts to several Discord webhooks — bug reports to one channel, purchases to another, moderation to a third — gets a channel in Issueit for each. Every channel has
        its own address, and you choose which destinations it goes to.
      </p>
      <Code title="One address per channel" lang="text" code={`${hook}           ← the default address
${hook}/shop      ← the Shop channel
${hook}/admin     ← the Admin channel`} />
      <Steps>
        <Step title="Add the destinations">
          <p>One per place posts should end up, such as a Discord destination for each Discord webhook the game used before.</p>
        </Step>
        <Step title="Add a channel for each">
          <p>
            In <strong>Overview › Collect reports › Roblox</strong>, <strong>Add channel</strong>, then tick the destinations it sends to. The address ends in the channel's name and doesn't
            change if you rename it.
          </p>
        </Step>
        <Step title="Swap each URL in the game">
          <p>Each Discord URL in your scripts becomes the address of its channel.</p>
        </Step>
      </Steps>
      <Facts
        rows={[
          ["A destination in a channel", "Gets only that channel's posts. It can be in several channels."],
          ["A destination in no channel", "Gets what's sent to the default address, the widget, the hosted form and the API — as before channels existed."],
          ["Deliver every post", <>On for a new channel. A log of purchases wants every line; turn it off and repeats of an open report group into it instead, as bug reports do.</>],
          ["Groups", "Never cross channels: a report only joins a group in its own channel."],
          ["An address with a channel that doesn't exist", <>Is refused with <C>404 unknown_channel</C>, so a typo shows up rather than vanishing.</>],
        ]}
      />
      <p>
        The intake API and the module take a <C>channel</C> too: <C>{'"channel": "shop"'}</C> in a report, or <C>channel</C>, <C>errorChannel</C> and <C>playerChannel</C> in{" "}
        <C>Issueit.init</C>.
      </p>

      <H2>The Issueit module</H2>
      <p>
        Copy the module from <strong>Overview › Collect reports › Roblox</strong> into a ModuleScript named <C>Issueit</C> in ReplicatedStorage, then start it from a server Script.
      </p>
      <Code
        title="ServerScriptService › Issueit"
        lang="lua"
        code={`local Issueit = require(game.ReplicatedStorage.Issueit)

Issueit.init({
	project = "prj_abc123",
	key = game:GetService("HttpService"):GetSecret("issueit"),
	endpoint = "${urls.drop}",
	playerReports = true,
})`}
      />
      <p>That's enough for every server script error to arrive as a report, with the last 50 lines of server output and the server it happened on. The same error is sent once a minute per server at most, and Issueit groups the rest.</p>
      <Params
        rows={[
          { name: "project", required: true, type: "string", children: "The project id." },
          { name: "key", required: true, type: "string | Secret", children: <>A secret key, or the <C>Secret</C> that <C>HttpService:GetSecret</C> returns.</> },
          { name: "endpoint", type: "string", children: <>Your Issueit, if you host it. Defaults to the hosted service.</> },
          { name: "environment", type: "string", children: <><C>studio</C> in Studio, <C>production</C> elsewhere.</> },
          { name: "release", type: "string", children: <>The place version, so every report says which build it came from.</> },
          { name: "captureErrors", type: "boolean", children: <>Server script errors. Default <C>true</C>.</> },
          { name: "captureLogs", type: "boolean", children: <>The last 50 lines of output, on each report. Default <C>true</C>.</> },
          { name: "playerReports", type: "boolean", children: <>Players may file reports with <C>Issueit.send</C>. Default <C>false</C>.</> },
          { name: "clientErrors", type: "boolean", children: <>Clients may send their own script errors. Default <C>false</C>.</> },
          { name: "playerReportLimit", type: "table", children: <><C>{"{ count = 3, per = 600 }"}</C>: reports one player may send in that many seconds.</> },
          { name: "channel", type: "string", children: "The project channel reports go to, unless one names another." },
          { name: "errorChannel", type: "string", children: <>The channel for captured script errors. Defaults to <C>channel</C>.</> },
          { name: "playerChannel", type: "string", children: <>The channel for reports players send. Defaults to <C>channel</C>.</> },
          { name: "beforeSend", type: "function", children: "Gets each report before it's sent; return it, changed or not, or nil to drop it." },
        ]}
      />
      <H3>Reporting from the server</H3>
      <Code
        lang="lua"
        code={`Issueit.report({
	title = "DataStore save failed",
	description = err,
	priority = "high",
	player = player,               -- who it happened to
	fingerprint = "datastore:save", -- reports with the same one are grouped
	metadata = { attempt = 3 },
})

local ok, answer = Issueit.reportAsync({ title = "..." }) -- waits for the answer`}
      />
      <H3>Reports from players</H3>
      <p>Behind your own button, in a LocalScript. The server adds who sent it and from which server, checks and trims what the client sent, and limits how often one player can.</p>
      <Code
        title="StarterPlayerScripts"
        lang="lua"
        code={`local Issueit = require(game.ReplicatedStorage.Issueit)
Issueit.startClient({ captureErrors = true }) -- client errors need clientErrors = true on the server

reportButton.Activated:Connect(function()
	Issueit.send({ title = titleBox.Text, description = detailsBox.Text, category = "Bug" })
end)`}
      />
      <H3>What each report carries</H3>
      <Facts
        rows={[
          ["The server", <><C>place_id</C>, <C>universe_id</C>, <C>place_version</C>, <C>job_id</C>, <C>server_kind</C> (public, private or reserved) and <C>players</C>, in metadata.</>],
          ["The player, when there is one", <><C>player_id</C>, <C>player_name</C>, <C>player_display_name</C> and <C>account_age_days</C>, and their locale.</>],
          ["The output", "The last 50 lines before the report, as console diagnostics. Lines the module writes itself are left out."],
          ["Retries", <>Each report is sent with an idempotency key and retried on 429 and 5xx, so a retry never files it twice. What's queued when the server shuts down gets 20 seconds to go.</>],
        ]}
      />
    </>
  );
}

/**
 * Spam and abuse. Written as one page because the parts only make sense
 * together: a project id is public, so intake has to assume strangers.
 */
function Spam() {
  return (
    <>
      <p>
        A project id is printed in the page source of every site that uses the widget. Anyone who views source can post to your intake endpoint, and a public form attracts link spam the way every
        public form has since forms existed. Issueit assumes that and stays useful anyway.
      </p>
      <p>
        The rule behind all of it: <strong>nothing is refused on a guess, and nothing is thrown away on a guess</strong>. A report that looks like spam is stored and held back from delivery, because
        delivery is the step that can't be undone — a Jira ticket exists, a channel has been pinged, a reporter has had an email. A false positive costs one click. A lost bug report from a real user
        costs a customer.
      </p>

      <H2>What happens to a public submission</H2>
      <Table
        head={["Step", "What it does"]}
        rows={[
          ["Rate limits", <>Ten reports a minute per visitor per project, a thousand an hour per project, five thousand an hour per organisation. Over any of them answers <C>429</C> with <C>Retry-After</C>.</>],
          ["Allowed sites", <>If the project names its sites, a browser on any other one is turned away. See <D to="/collect/widget">the widget</D>.</>],
          ["Blocked reporters", "Anyone the project has blocked is answered as though the report had been filed, and nothing is stored."],
          ["A honeypot", "A field a person never sees and never fills in. Anything that completes it gets the same pretend acceptance."],
          ["Spam scoring", "What's left is scored. At or above the project's threshold it's stored and held back instead of delivered."],
        ]}
      />
      <Callout kind="note" title="Only public submissions are scored">
        A report sent with a secret key or a <D to="/collect/browser-tokens">browser token</D> is never held back. Your server or your signed-in app has already decided who it believes, and
        second-guessing it would hold back reports you filed deliberately.
      </Callout>

      <H2>What a held-back report loses</H2>
      <Facts
        rows={[
          ["Delivery", "No destination hears about it. Nothing is created in your tracker."],
          ["Email", "The reporter gets no receipt, and your team gets no arrival alert."],
          ["Your allowance", "It doesn't count against the monthly report allowance. Nobody should pay for a spam run."],
          ["The inbox", <>It isn't in any other view. It's in <strong>Held as spam</strong>, with the reasons it was held.</>],
          ["A week", "Then it's deleted, with its attachments, whatever the plan's retention says."],
        ]}
      />
      <p>
        Open one and choose <strong>Not spam</strong> and it goes out to your destinations and emails the reporter exactly as if it had just arrived, and counts against the month from then on.
        Choose <strong>Block reporter</strong> and nothing more from them is accepted for that project.
      </p>

      <H2>What the score is made of</H2>
      <p>No single one of these is enough on its own. A real report can say “the casino page 404s”, so one weak signal never holds anything back.</p>
      <Table
        head={["Signal", "Why it counts"]}
        rows={[
          ["Several links, or a link in the title", "One link is how someone says which page they mean. Three, or any in the title, is a link farm."],
          ["Markup links", <><C>[url=…]</C> and <C>&lt;a href&gt;</C> in a plain-text field is a forum spammer's muscle memory.</>],
          ["Advertising language", "Words that belong to a trade being sold rather than to software that's broken."],
          ["Your own words", "Phrases you add in the project's settings, weighted higher than the built-in ones."],
          ["Volume from one reporter", "Dozens of reports in an hour from one address is a loop or a run."],
          ["The same text again and again", "If it were the same bug on the same page, duplicate grouping would have caught it."],
          ["A throwaway email address", "Mailinator and friends."],
          ["A long message with no page and nothing captured", "A sales pitch is addressed to a company. A bug report comes from a page."],
        ]}
      />

      <H2>Settings</H2>
      <p>
        Per project, under <strong>Settings › Spam</strong>. On every plan: not being spammed isn't a feature anyone should have to buy.
      </p>
      <Facts
        rows={[
          ["Hold likely spam back", "On by default. Turning it off delivers every public report, however it scores."],
          ["Links are normal here", "For a project whose reporters paste links as a matter of course. Stops links counting at all."],
          ["Blocked reporters", "Addresses, email domains, and reporters blocked from one of their reports."],
          ["Your own words", <>Phrases that mean spam for your product. Set them through <C>PATCH /projects/:id</C> with <C>protection.spam.keywords</C>.</>],
        ]}
      />
      <Callout kind="tip" title="An address is never stored">
        Issueit keeps a keyed hash of a reporter's IP address, never the address. That's why blocking one from a report shows no address to read: the hash is all there is. Typing an address into the
        block list hashes it the same way.
      </Callout>

      <H2>The quiet refusals</H2>
      <p>
        A blocked reporter and a filled honeypot both get <C>201</C> and a report id that belongs to nothing. A spammer who can tell refusal from acceptance tries again differently; one who can't
        carries on posting into nothing. This is the one place Issueit answers something other than the truth, and it's on purpose.
      </p>

      <H2>From the API</H2>
      <Table
        head={["Call", "What it does"]}
        rows={[
          [<C>GET /reports?spam=only</C>, <>The held-back reports. They're left out of every other listing, and <C>held</C> in any list response counts them.</>],
          [<C>POST /reports/:id/not-spam</C>, "Releases one: delivered and emailed as though it had just arrived."],
          [<C>POST /reports/:id/block</C>, "Blocks the reporter for that project, by address hash and optionally by email."],
          [<>Intake with <C>?dry_run=1</C></>, <>Reports the score and whether it would be held, without storing anything. See <D to="/collect/idempotency">dry runs</D>.</>],
        ]}
      />
    </>
  );
}

export const collectPages: Record<string, ComponentType> = {
  "/collect/widget": Widget,
  "/collect/widget-api": WidgetApi,
  "/collect/diagnostics": Diagnostics,
  "/collect/form": Form,
  "/collect/intake-api": IntakeApi,
  "/collect/browser-tokens": BrowserTokens,
  "/collect/idempotency": Idempotency,
  "/collect/spam": Spam,
  "/collect/roblox": Roblox,
  "/collect/sdks": Sdks,
};
