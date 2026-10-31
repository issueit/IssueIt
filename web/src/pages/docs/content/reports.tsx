import type { ComponentType } from "react";
import { useUrls } from "../../../lib/urls";
import { C, Callout, Code, D, Facts, H2, H3, Params, Step, Steps, Table } from "../kit";

/** Working with reports: triage, duplicates, releases, reporter email, notifications, retention. */

function Triage() {
  return (
    <>
      <p>
        Issueit is not an issue tracker, and the inbox is deliberately small. But a report has to be dealt with by somebody, so it does the few things that take: say who's looking, write down what you
        found, and mark it done.
      </p>

      <H2>The inbox</H2>
      <p>
        <strong>Inbox</strong> is every project's reports in one list; a project's <strong>Reports</strong> tab is the same list fenced to that project. Filters sit above it — status, priority,
        project, assignee, "assigned to me" — and the list updates live as reports arrive, over server-sent events rather than polling.
      </p>
      <Table
        head={["Status", "Means", "Side effects"]}
        rows={[
          ["New", "Nobody has looked.", "Where everything starts."],
          ["Investigating", "Someone is on it.", "Set when you assign, or by hand."],
          ["Resolved", "Fixed.", <>Emails every reporter in the <D to="/reports/duplicates">group</D> who asked to hear. Ends the group, so the bug coming back starts a new one.</>],
          ["Closed", "Dealt with another way: not a bug, won't fix, a duplicate of something outside Issueit.", "Ends the group. Nobody is emailed."],
        ]}
      />

      <H2>What you can do to a report</H2>
      <Table
        head={["This", "Does that"]}
        rows={[
          ["Assign", "Puts someone's name on it. Filter by \"assigned to me\" to see yours."],
          ["Notes", "What you tried and what it turned out to be. Internal: never delivered anywhere, never shown to the reporter."],
          ["Priority", "Change what the reporter guessed. Doesn't re-deliver, but does go out as an update event if a destination asked for those."],
          ["Group or separate", <>Join this report to another, or pull it out of its group. See <D to="/reports/duplicates">duplicates</D>.</>],
          ["Retry a delivery", <>From the delivery list on the report. See <D to="/deliver/failures">when delivery fails</D>.</>],
          ["Delete", "Removes the report, its attachments and its diagnostics. Copies already delivered elsewhere stay where they are."],
        ]}
      />
      <p>Every change can be undone from the toast that follows it, which is the real reason the bulk actions are safe to use quickly.</p>

      <H2>The keyboard</H2>
      <p>The list takes focus, so you can work through a morning's reports without the mouse.</p>
      <Table
        head={["Key", "Does"]}
        rows={[
          [<><C>j</C> / <C>k</C></>, "Move down and up. Arrow keys do the same."],
          [<C>Enter</C>, "Open the focused report."],
          [<C>e</C>, "Resolve it."],
          [<C>m</C>, "Assign it to you."],
          [<C>x</C>, "Choose it, for a bulk action."],
          [<C>Esc</C>, "Close the panel."],
        ]}
      />
      <p>
        The checkbox on each row does what <C>x</C> does, and shift-clicking picks a run of them. With several chosen you can resolve, close, assign or delete the lot in one go.
      </p>

      <H2>Reading a report properly</H2>
      <p>Opening a report shows, in order: what the person wrote, the context, the attachments, and then the three diagnostic lists — which is where the bug usually is.</p>
      <Facts
        rows={[
          ["Console", <>Errors and warnings with stacks. Where a <D to="/reports/releases">source map</D> exists, both the minified frame and your own file and line are shown.</>],
          ["Network", "Every request the page made, with status and duration. The 500 is normally three lines above the exception."],
          ["Steps", "Clicks, page changes and which fields were edited, so you can reproduce it in order."],
          ["Delivered to", "Each destination, its status, and a link to the issue or message it created."],
          ["Group", "How many people reported this, and when."],
        ]}
      />
      <Callout kind="tip" title="Triage without a browser">
        <p>
          <C>issueit ls --status new</C> and <C>issueit show 42</C> print the same thing in a terminal. An <D to="/automate/mcp">agent</D> gets it as Markdown through{" "}
          <C>search_reports</C> and <C>get_report</C>, which is usually how a report gets fixed without anybody triaging it at all.
        </p>
      </Callout>

      <H2>Closing the loop automatically</H2>
      <p>
        Issueit asks GitHub, GitLab, Linear and Jira every few minutes whether the issues it opened have been closed. A closed issue resolves its report, which emails the people who asked to hear.
        So for most teams triage is: fix the bug, close the issue where you were already working, and the rest happens.
      </p>
    </>
  );
}

function Duplicates() {
  return (
    <>
      <p>
        One broken page can produce four hundred reports in an hour. Without grouping that's four hundred issues, and the team stops reading any of them. Issueit gives each report a fingerprint and
        joins matches to the report that is already open.
      </p>

      <H2>How a fingerprint is made</H2>
      <Steps>
        <Step title="Your own key wins">
          <p>
            Send a <C>fingerprint</C> and that's the answer. An error's name and location, a crash signature, a failing job's name: anything stable. This is always better than letting Issueit guess,
            and it is what the <D to="/collect/sdks">Node SDK</D> does for you.
          </p>
        </Step>
        <Step title="Otherwise, the title, normalised">
          <p>
            Lower-cased, accents folded, punctuation dropped, UUIDs removed and numbers taken out — except three-digit HTTP statuses, because a 500 and a 404 are different bugs. So{" "}
            <C>Error #4012 on save!</C> and <C>error 77 on save</C> are one fault, and <C>500 on /orders</C> and <C>404 on /orders</C> are two.
          </p>
        </Step>
        <Step title="And the page, normalised">
          <p>
            Host and path, without the query string or hash, with numeric and id-looking segments replaced: <C>/orders/8812/edit</C> and <C>/orders/91/edit</C> are the same page. A title that
            normalises to fewer than three characters doesn't group at all — "!!!" and "???" are not the same bug.
          </p>
        </Step>
      </Steps>
      <Code
        title="What gets stored"
        code={`x:9f41c0…   a key you sent, hashed
t:4c1f8a…   the normalised title and page, hashed`}
      />

      <H2>What happens to a match</H2>
      <p>A report whose fingerprint matches a report in the same project that is still new or being investigated joins that report's group.</p>
      <Facts
        rows={[
          ["The first report", "Delivered normally. It is the one with an issue in your tracker."],
          ["The rest", "Stored in full — every diagnostic list, every screenshot — and not delivered again."],
          ["Your tracker", "Gets a comment at 2, 3, 5, 10, 25, 50, 100, 250 and 500 reports, then every thousand. A handful of comments rather than hundreds."],
          ["Webhooks", <>Can subscribe to <C>report.duplicate</C>, which carries the first report's id and the size of the group.</>],
          ["Notifications", "Nobody is emailed about a duplicate. You were told about that bug already."],
          ["When it's resolved", "The group ends. The next matching report starts a new one, so a bug that comes back is noticed rather than filed away silently."],
        ]}
      />

      <H2>Changing how it matches</H2>
      <p>
        A project's <strong>Rules</strong> tab is for the cases where the default is wrong. Every change is previewed against that project's last hundred real reports before you save, so you can see
        exactly what would have merged.
      </p>
      <Params
        rows={[
          {
            name: "Title patterns",
            children: (
              <>
                Regular expressions removed from the title before comparing. <C>order #\d+</C> stops two orders failing the same way counting as two bugs; a build id or a customer name in the title is
                the other common case. Up to twenty patterns.
              </>
            ),
          },
          { name: "Path depth", children: <>Compare only the first few segments, so <C>/docs/a</C> and <C>/docs/b</C> count as one page.</> },
          { name: "Ignore the page", children: "Match on the title alone. Right for an app where the same fault can happen anywhere." },
          { name: "Redaction patterns", children: <>Your own patterns, removed from text on top of the built-in <D to="/collect/diagnostics">scrubbing</D>.</> },
        ]}
      />
      <p>
        Grouping can also be turned off entirely in the project's settings, and any report can be joined to another or separated from its group by hand — from the report, from{" "}
        <C>group_reports</C> and <C>separate_report</C> in <D to="/automate/mcp">MCP</D>, or from the API.
      </p>

      <H2>Getting it right</H2>
      <Callout kind="tip" title="Test it with a dry run">
        <p>
          <C>?dry_run=1</C> returns the fingerprint a report would get and the group it would join, and stores nothing. Two dry runs with two real titles answer "would these merge?" in a second. See{" "}
          <D to="/collect/idempotency">idempotency and dry runs</D>.
        </p>
      </Callout>
      <Table
        head={["Symptom", "Usually", "Fix"]}
        rows={[
          ["Hundreds of issues for one fault", "The title carries something unique: an id, a timestamp, a name.", <>A title pattern, or send a <C>fingerprint</C>.</>],
          ["Different bugs merged into one", "Titles are too generic — \"Something went wrong\".", "Make the title say what broke, or separate the report and send distinct fingerprints."],
          ["A bug's return went unnoticed", "It joined a group that was never resolved, only ignored.", "Resolve or close reports when they're done. The group's end is what makes the next one new."],
          ["Nothing groups at all", "Grouping is off for the project, or every title is unique.", "Turn it on, and look at the fingerprints a dry run reports."],
        ]}
      />
    </>
  );
}

function Releases() {
  return (
    <>
      <p>
        A minified stack trace is no use to anyone: <C>at o (main.4f2c.js:1:92841)</C>. Tell Issueit which build a report came from and give it that build's source maps, and the stack is read back
        into your own files and lines.
      </p>
      <Callout kind="note" title="Resolved when read, not when received">
        <p>
          Stacks are mapped when somebody opens the report, not when it arrives. Maps uploaded an hour after a crash still make that crash readable, which matters because the deploy that broke
          production is rarely the deploy that remembered to upload its maps.
        </p>
      </Callout>

      <H2>Three steps</H2>
      <Steps>
        <Step title="Name the build">
          <p>Any stable string — a commit SHA is the obvious one. Use the same value in both places that follow.</p>
        </Step>
        <Step title="Upload the maps in CI">
          <Code
            title="After the build"
            lang="sh"
            code={`npx issueit sourcemaps upload dist --release "$GITHUB_SHA" --prefix assets`}
          />
          <p>
            <C>--prefix</C> is the path the browser sees: <C>dist/app.js</C> served at <C>/assets/app.js</C> needs <C>--prefix assets</C>. Uploading the same file again replaces it, so a pipeline
            that runs twice is harmless.
          </p>
        </Step>
        <Step title="Send the same value with every report">
          <Code
            lang="js"
            code={`// The widget, through its runtime API:
Issueit.setMetadata({ build: import.meta.env.VITE_GIT_SHA });

// @issueit/react:
<IssueitProvider project="prj_abc123" release={import.meta.env.VITE_GIT_SHA}>

// The intake API:
{ "title": "…", "release": "a1b2c3d" }`}
          />
        </Step>
      </Steps>

      <H2>What you get</H2>
      <p>
        Each console entry keeps both: <C>stack</C> as the browser saw it, and <C>original</C> read through the maps. Nothing is thrown away, in case a map turns out to be the wrong one.
      </p>
      <Code
        title="A console entry, after mapping"
        lang="json"
        code={`{
  "t": 4210,
  "level": "error",
  "message": "TypeError: Cannot read properties of undefined (reading 'id')",
  "stack": "at o (main.4f2c.js:1:92841)",
  "original": "at submitOrder (src/checkout/submit.ts:41:12)"
}`}
      />

      <H2>Managing releases</H2>
      <p>
        A project's <strong>Releases</strong> tab lists every build Issueit has maps for, when they were uploaded, how many files each has and how many reports named it. Delete a release and its maps
        go with it; the reports keep their minified stacks.
      </p>
      <p>
        <C>issueit sourcemaps upload &lt;dir&gt;</C> uploads every <C>.map</C> under that directory for one <C>--release</C>, with <C>--prefix</C> applied to the paths it records.
      </p>
      <Callout kind="warning" title="Don't ship the maps to browsers">
        <p>
          Upload them to Issueit and delete them from the public build, or don't emit the <C>sourceMappingURL</C> comment. A map in production hands your source to anyone who asks for it. Issueit
          never serves a map it holds; it only reads them to resolve stacks.
        </p>
      </Callout>

      <H2>The decoder</H2>
      <p>
        Issueit reads the Source Map v3 format itself rather than taking a dependency for it: base64 VLQ segments, <C>sources</C>, <C>names</C>, <C>sourceRoot</C> and index maps with sections. Maps
        that are invalid are ignored rather than failing the report — a report you can read badly is better than a report you can't read at all.
      </p>
    </>
  );
}

function Emails() {
  const urls = useUrls();
  return (
    <>
      <p>
        The person who reported the bug is the one person who never hears what happened to it. Turn on reporter emails and they get a receipt when they send it and a note when it's fixed — however
        many of them reported the same thing.
      </p>

      <H2>Turning it on</H2>
      <Steps>
        <Step title="Enable it for the project">
          <p>
            The project's <strong>Settings</strong> has the switch. The widget and the hosted form then show a tick box under the email field: "Email me when this is fixed". Nobody is emailed who
            didn't ask.
          </p>
        </Step>
        <Step title="Decide who sends it">
          <p>
            By default it goes out through the install's own mail server (<C>SMTP_URL</C>). Connect an email service — Resend, Postmark, SendGrid, Mailgun, Brevo, Mailjet, SparkPost, Amazon SES or
            any SMTP server — and the mail comes from your domain instead.
          </p>
        </Step>
        <Step title="Report through the API, if you do">
          <p>
            Send <C>notify: true</C> with an email address, and that report behaves as though the box had been ticked.
          </p>
        </Step>
      </Steps>

      <H2>What gets sent</H2>
      <Table
        head={["Email", "When", "Contains"]}
        rows={[
          ["Receipt", "The report is accepted.", "The project's logo and brand name, the report's title, and a link to stop emails about it."],
          [
            "Fixed",
            <>
              The report is resolved in Issueit, or its GitHub, GitLab, Linear or Jira issue is closed as done — Issueit checks those trackers every few minutes.
            </>,
            "The same, plus the fact that it's fixed. No internal notes, no diagnostics, no other reporters' details.",
          ],
        ]}
      />
      <p>
        Everyone in a <D to="/reports/duplicates">group</D> who asked to hear gets the "fixed" email once, when the group's first report is resolved. Nobody hears twice, and nobody hears about
        somebody else's report.
      </p>

      <H2>What reporters never see</H2>
      <Facts
        rows={[
          ["Your notes", "Internal, always."],
          ["The diagnostics", "Never in an email."],
          ["Each other", "No reply-all, no shared thread, no other addresses in the headers."],
          ["Your tracker", "The issue's link is not in the email."],
        ]}
      />

      <H2>Stopping</H2>
      <p>
        Every email carries a one-click stop link. Opening it shows a button rather than acting immediately, so a mail scanner that fetches links can't unsubscribe anybody; a mail client's own
        one-click header does act, as it should.
      </p>
      <Code title="The link in every email" code={`${urls.app}/e/{id}/stop?sig=…`} />

      <H2>How it's sent</H2>
      <p>
        Reporter email is an outbox, like deliveries: a row per message, retried, so a mail server having a bad afternoon doesn't lose a receipt. A message that can't be sent at all is visible rather
        than silent — <D to="/automate/monitoring">health</D> counts email waiting and email failed in the last day.
      </p>
      <Callout kind="warning" title="Without a mail server">
        <p>
          With no <C>SMTP_URL</C> and no email connection, nothing is sent and the settings page says so. On a <D to="/self-host/install">self-hosted install</D> this is the most common thing to
          forget, and it also silently disables password resets and invitations.
        </p>
      </Callout>
    </>
  );
}

function Notifications() {
  return (
    <>
      <p>
        A pipeline nobody is told about is one you have to remember to check. Notifications are per person and per organisation, under <strong>Settings → Notifications</strong>, so you can take
        everything from your own project and nothing from a colleague's.
      </p>

      <H2>What Issueit will email you</H2>
      <Table
        head={["Email", "When", "Default"]}
        rows={[
          [
            "A report arrived",
            <>
              Off, critical only, high and above, or everything. A <D to="/reports/duplicates">duplicate</D> joining an open bug never emails anyone — you were told about that one already.
            </>,
            "Critical only",
          ],
          [
            "A destination was paused",
            <>
              Issueit stopped sending to a destination whose deliveries kept failing. Reports are still being collected; nothing is leaving. At most once a day per destination.
            </>,
            "On, to owners and admins",
          ],
          ["Digest", "Daily or weekly: what arrived, what was resolved, what's stuck. Nothing is sent on a quiet day.", "Off"],
          ["You're near the allowance", "Hosted plans only, to owners: once at 80% of the monthly allowance, and again when reports start being turned away.", "On"],
          ["Payment problems", "Hosted plans only, to owners: a card that failed, a subscription about to lapse.", "On"],
        ]}
      />
      <Callout kind="warning" title="The one not to filter">
        <p>
          "A destination was paused" is the failure mode that looks like everything working: reports keep arriving in Issueit, and nothing reaches your tracker. If you turn off one notification, don't
          make it that one.
        </p>
      </Callout>

      <H2>Trying it</H2>
      <p>
        The notifications page can send you a digest on the spot, which is the quickest way to find out whether the install's mail actually works — and what the thing looks like before you set it
        loose on the team.
      </p>

      <H2>Alerting, rather than email</H2>
      <p>
        Email is for people. For a monitor, use <C>GET /api/orgs/current/health</C>, which answers "how old is the oldest thing still waiting" rather than "is the server up", or{" "}
        <C>/metrics</C> in Prometheus format. Both are under <D to="/automate/monitoring">health and metrics</D>, and <C>issueit health</C> exits non-zero when delivery is behind, so a CI job can
        fail on it.
      </p>

      <H2>Needs a mail server</H2>
      <p>
        All of it goes through the install's <C>SMTP_URL</C>. Without one, the page says so and nothing is sent — including password resets and invitations, which is why{" "}
        <D to="/self-host/install">installing</D> says to set it before anybody else signs up.
      </p>
    </>
  );
}

function Retention() {
  return (
    <>
      <p>
        Screenshots, video and captured diagnostics are the heavy and the personal part of a bug report. They are deleted on a schedule. The report itself — title, page, status, who reported it —
        stays until somebody deletes it.
      </p>

      <H2>What's kept, and for how long</H2>
      <Table
        head={["Data", "Kept until"]}
        rows={[
          [
            "Attachments and diagnostics",
            <>
              The retention period for the install or the plan passes. On the hosted service that's between a week and a year, shown under <strong>Settings → Plan and billing</strong>.
            </>,
          ],
          [
            "Reports",
            <>
              Deleted by hand, with their project, or with their organisation. An owner can also set a period under <strong>Settings → General</strong>, after which reports go on their own.
            </>,
          ],
          ["Delivery records", "Their report is deleted."],
          ["Sent email and used links", "A month for notices; a week for expired reset and confirmation codes."],
          ["Audit events", "They are the record of who changed what, and are not deleted on a schedule."],
        ]}
      />

      <H2>How the deletion happens</H2>
      <p>
        Once a day, at <C>JOBS_HOUR_UTC</C>, the daily round walks every organisation and applies its period: attachment rows and their files go, and <C>diagnostics</C> is emptied on reports older
        than the window while the report itself stays. The row is deleted before the file, so a crash mid-way leaves an orphaned file to tidy next time rather than a broken link.
      </p>
      <Facts
        rows={[
          [<C>RETENTION_ENABLED=false</C>, "Keeps attachments and diagnostics for ever. A self-hosted choice; there is no plan that does this."],
          ["An organisation's own period", "Deletes whole reports after a number of days. Off by default, because most people want the history."],
          ["By hand", "Delete a report, or a project, or the organisation. Everything below goes with it."],
        ]}
      />

      <H2>What deletion doesn't reach</H2>
      <p>
        Copies already delivered to your tracker, your chat or your webhook receiver stay where they are. Deleting a report in Issueit never reaches into another service to tidy up — it has no right
        to, and silently editing your issue history would be worse than leaving it.
      </p>
      <Callout kind="note" title="If you're answering a data request">
        <p>
          The things that identify a person are the reporter's email address, the metadata you chose to attach, and whatever is quoted inside the description or the diagnostics. Deleting the report
          removes all of it here. You will also want to think about the copy in your tracker, which is outside Issueit's reach.
        </p>
      </Callout>

      <H3>Reducing what you hold in the first place</H3>
      <Facts
        rows={[
          ["Capture less", <>Turn off any of the three <D to="/collect/diagnostics">diagnostic lists</D> per project, or all of them per page.</>],
          ["Deliver less", <>A destination's <D to="/deliver/routing">policy</D> can leave out the reporter, the metadata or the diagnostics.</>],
          ["Scrub more", <>Add your own redaction patterns under the project's <strong>Rules</strong> tab, previewed against real reports before you save.</>],
          ["Keep it shorter", "Set an organisation retention period. A bug report is worth most in its first week."],
        ]}
      />
    </>
  );
}

export const reportPages: Record<string, ComponentType> = {
  "/reports/triage": Triage,
  "/reports/duplicates": Duplicates,
  "/reports/releases": Releases,
  "/reports/emails": Emails,
  "/reports/notifications": Notifications,
  "/reports/retention": Retention,
};
