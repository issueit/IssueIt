import { C, Doc, H2, H3, More, Note, Step, Steps, Table, UI } from "../kit";
import type { Article } from "../types";

/** Destinations and delivery, and working through the reports that arrive. */

export const deliveryArticles: Article[] = [
  {
    slug: "send-bug-reports-to-github-issues",
    title: "Send bug reports to GitHub Issues",
    summary: "Connect GitHub once, choose a repository, and every new report opens an issue with the screenshot and the console errors attached.",
    category: "deliver",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted", "GitHub and GitHub Enterprise Cloud"],
    id: "IT2001",
    updated: "31 October 2026",
    keywords: "github connect integration repository labels issue token oauth",
    related: ["send-bug-reports-to-slack", "send-only-urgent-reports-to-a-destination", "reports-are-not-reaching-your-issue-tracker"],
    body: () => (
      <>
        <p>Issueit opens one issue per new report, with the page, the browser, the screenshot and the errors from just before it happened in the body. You work in GitHub; Issueit notices when you close it.</p>

        <H2>Connect GitHub and choose a repository</H2>
        <Steps>
          <Step>
            Open the project, then the <UI>Integrations</UI> tab.
          </Step>
          <Step>
            Select <UI>Add destination</UI>, then <UI>GitHub Issues</UI>.
          </Step>
          <Step>
            Select <UI>Sign in with GitHub</UI> and authorise Issueit. If you'd rather use a token, select <UI>Use a token instead</UI> — see below.
          </Step>
          <Step>Choose the repository from the list. Private repositories the connected account can see are included.</Step>
          <Step>
            Optionally add labels — <C>bug</C> and something like <C>from-users</C> are a good pair — then select <UI>Add destination</UI>.
          </Step>
          <Step>
            Select <UI>Send a test report</UI>. It goes through the whole pipeline, so an issue appearing in GitHub means the next real report will arrive too.
          </Step>
        </Steps>

        <H2>What the issue looks like</H2>
        <Table
          head={["In the issue", "From the report"]}
          rows={[
            ["The title", "What the person wrote, with any prefix you set on the destination."],
            ["The body", "Their description, the page, the browser, the viewport, your own metadata, and the console errors with stack traces."],
            ["Screenshots and files", "Linked, not uploaded. The links work for anyone who can see the issue, for 30 days by default."],
            ["Labels", "Whichever you chose on the destination."],
            ["Later comments", "Added as more people report the same bug, at 2, 3, 5, 10, 25, 50 and 100 reports and so on."],
          ]}
        />

        <H2>Closing the loop</H2>
        <p>
          Issueit asks GitHub every few minutes whether the issues it opened have been closed. When you close one, the report is marked resolved — and if the person who reported it asked to hear, they
          get an email saying it's fixed. You don't have to touch Issueit at all.
        </p>
        <Note kind="tip">
          <p>That means your normal workflow is enough: fix the bug, close the issue, and everything else happens. See "Tell people when their bug is fixed".</p>
        </Note>

        <H2>Using a token instead of signing in</H2>
        <Steps>
          <Step>
            In GitHub, go to <UI>Settings → Developer settings → Personal access tokens → Fine-grained tokens</UI>.
          </Step>
          <Step>
            Create a token with access to the repositories you'll use, and set <UI>Issues</UI> to <strong>Read and write</strong>.
          </Step>
          <Step>Paste it into Issueit when adding the destination.</Step>
        </Steps>
        <Note kind="important">
          <p>
            A token belongs to a person. If they leave, issues stop being created — Issueit will say the account needs reconnecting. For a team, a machine account or an organisation-owned token lasts
            longer.
          </p>
        </Note>

        <More title="Sending to more than one repository">
          <p>
            Add a second GitHub destination to the same project. Both can use the same connection, and each can have its own filter — frontend reports to one repository, API reports to another — using
            the source label. See "Send only urgent reports to a destination".
          </p>
        </More>

        <More title="GitHub Enterprise Server">
          <p>
            Self-hosted GitHub isn't supported directly yet. Use a <Doc to="/deliver/webhooks">webhook destination</Doc> and create the issue through your own small service, or send reports to an
            automation platform that can reach it.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "send-bug-reports-to-slack",
    title: "Send bug reports to a Slack channel",
    summary: "Post each new report into a channel, with the important facts and a link, so somebody notices without watching the inbox.",
    category: "deliver",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted", "Slack"],
    id: "IT2002",
    updated: "31 October 2026",
    keywords: "slack channel message webhook incoming notify chat teams discord",
    related: ["send-bug-reports-to-github-issues", "send-only-urgent-reports-to-a-destination", "choose-which-emails-issueit-sends-you"],
    body: () => (
      <>
        <p>A chat destination is how people find out; a tracker is where the work happens. Most teams want both, and sending to two destinations is just adding two.</p>

        <H2>Connect Slack</H2>
        <Steps>
          <Step>
            Open the project, then the <UI>Integrations</UI> tab.
          </Step>
          <Step>
            Select <UI>Add destination</UI>, then <UI>Slack</UI>.
          </Step>
          <Step>
            Select <UI>Sign in with Slack</UI> and choose the workspace. Or select <UI>Use a webhook URL instead</UI> and paste an incoming webhook from your Slack app.
          </Step>
          <Step>Choose the channel. Issueit lists the channels the connection can post to; a private channel needs the app invited to it first.</Step>
          <Step>
            Select <UI>Add destination</UI>, then <UI>Send a test report</UI>.
          </Step>
        </Steps>
        <Note>
          <p>With a webhook URL, the channel is fixed by Slack when you create the webhook, so Issueit doesn't ask. To change it, create a new webhook in Slack.</p>
        </Note>

        <H2>Make the channel worth reading</H2>
        <p>A channel that gets every report is a channel people mute. Two settings prevent that.</p>
        <Steps>
          <Step>
            <strong>Filter it.</strong> On the destination, set <UI>Priorities</UI> to high and critical. Everything still reaches your tracker; only the ones worth interrupting someone reach chat.
          </Step>
          <Step>
            <strong>Let duplicates be quiet.</strong> They already are: a report that joins an open bug isn't posted again. See "Stop getting hundreds of reports for one bug".
          </Step>
        </Steps>

        <H2>Other chat tools</H2>
        <Table
          head={["Tool", "Connect with"]}
          rows={[
            ["Microsoft Teams", "A channel webhook URL from Teams."],
            ["Discord", "Sign-in, or a channel webhook URL."],
            ["Google Chat, Mattermost, Rocket.Chat, Zulip and others", "A webhook URL from that tool. They are all in the destination list."],
          ]}
        />

        <More title="Sending less to a shared channel">
          <p>
            If the channel includes people who shouldn't see everything, open the destination's <UI>Delivery</UI> settings and turn off <UI>Reporter</UI>, <UI>Metadata</UI> or <UI>Diagnostics</UI>.
            Issueit keeps the full report; the message just carries less.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "send-only-urgent-reports-to-a-destination",
    title: "Send only some reports to a destination",
    summary: "Filter a destination by priority, by where the report came from, or by environment — so on-call only hears about the ones that matter.",
    category: "deliver",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT2003",
    updated: "31 October 2026",
    keywords: "routing rules filter priority critical source environment staging production oncall",
    related: ["send-bug-reports-to-slack", "a-destination-was-paused-and-what-to-do", "stop-getting-hundreds-of-reports-for-one-bug"],
    body: () => (
      <>
        <p>By default every new report goes to every destination on the project. A filter narrows one destination without affecting the others.</p>

        <H2>Add a filter</H2>
        <Steps>
          <Step>
            Open the project, then the <UI>Integrations</UI> tab.
          </Step>
          <Step>Select the destination.</Step>
          <Step>
            Under <UI>Which reports</UI>, tick the priorities, sources or environments this destination should take.
          </Step>
          <Step>
            Select <UI>Save</UI>.
          </Step>
        </Steps>
        <p>An empty list means "any". A report has to match every list you did fill in, so priorities <em>and</em> environments together means both must match.</p>

        <H2>The three things you can filter on</H2>
        <Table
          head={["Filter", "Values", "Useful for"]}
          rows={[
            ["Priority", "Low, medium, high, critical", "Keeping on-call and chat for the serious ones."],
            [
              "Source",
              <>
                <C>widget</C>, <C>form</C>, <C>api</C>, or any label you set
              </>,
              "Sending support's reports to a help desk and the product's to engineering.",
            ],
            ["Environment", "Whatever your product sends, usually production or staging", "Keeping staging noise out of the tracker your team watches."],
          ]}
        />

        <H2>A set-up that works</H2>
        <Table
          head={["Destination", "Filter", "Why"]}
          rows={[
            ["GitHub Issues", "None", "Everything should be written down somewhere."],
            ["#bugs in Slack", "High and critical", "So the channel stays readable."],
            ["PagerDuty", "Critical, production only", "So nobody is woken for a typo on staging."],
            ["The help desk", <>Source is <C>form</C></>, "Reports that came from a person writing in, not from the product."],
          ]}
        />

        <H2>Check a filter without filing a bug</H2>
        <p>
          You can ask Issueit what would happen to a report without storing it. It names the destinations that would receive it and why the others wouldn't. See{" "}
          <Doc to="/collect/idempotency">dry runs</Doc> — or just send a test report at the priority you want to check and look at the delivery list on it.
        </p>
        <Note kind="tip">
          <p>
            To label where reports come from, add <C>data-source="checkout"</C> to the script tag on those pages, or send <C>source</C> with a report from your server. Then you can route by it.
          </p>
        </Note>

        <H2>Changing how hard Issueit tries</H2>
        <p>
          The same settings page has a <UI>Delivery</UI> section: how many attempts, how long to wait for the service, whether to slow down to suit its rate limit, and whether to pause the destination
          after repeated failures. The defaults — eight attempts over about ten hours — suit almost everybody. See <Doc to="/deliver/routing">routing and policy</Doc>.
        </p>
      </>
    ),
  },

  {
    slug: "reports-are-not-reaching-your-issue-tracker",
    title: "Reports are not reaching your issue tracker",
    summary: "Reports are arriving in Issueit but no issue appears. Work through the six causes in order of likelihood.",
    category: "deliver",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT2004",
    updated: "31 October 2026",
    keywords: "delivery failed not delivered missing issue tracker troubleshooting retry log 404 403",
    related: ["a-destination-was-paused-and-what-to-do", "send-only-urgent-reports-to-a-destination", "the-bug-report-button-is-not-appearing"],
    body: () => (
      <>
        <p>
          <strong>Symptoms.</strong> Reports appear in the Issueit inbox, but nothing appears in GitHub, Linear, Slack or wherever you send them.
        </p>
        <p>Open the report and look at its delivery list — every destination, its status and the service's own message. That usually names the cause, and these are the six it will be.</p>

        <H2>1. There is no destination</H2>
        <p>
          A project with no destinations collects reports happily and sends them nowhere. Open the project's <UI>Integrations</UI> tab; if the list is empty, that's the answer.
        </p>

        <H2>2. The destination's filter doesn't match</H2>
        <p>
          A destination set to <strong>critical</strong> ignores a medium report, correctly and silently. The report's delivery list says so for each destination. See "Send only some reports to a
          destination".
        </p>

        <H2>3. The report is a duplicate</H2>
        <p>
          A report that matches one that is already open joins it and isn't delivered again — your tracker gets a comment at certain group sizes instead. The report says which group it joined, and the
          first report of the group is the one with the issue.
        </p>

        <H2>4. The connected account has lost access</H2>
        <Table
          head={["Message", "Means", "Fix"]}
          rows={[
            ["Reconnect this account", "The token was revoked or expired, or the person who connected it lost access.", <>Reconnect under <UI>Settings → Connections</UI>, then retry the failed deliveries.</>],
            ["Not found (404)", "The repository, board or channel was renamed, deleted, or is invisible to the connected account.", "Point the destination at the right target, or reconnect with an account that can see it."],
            ["Not allowed (403)", "The credential is valid but can't create issues there.", "Widen the token's permissions in that service, or connect by signing in."],
            ["A private channel", "The app hasn't been invited to it.", "Invite it in the chat tool, then retry."],
          ]}
        />

        <H2>5. The destination is paused</H2>
        <p>Repeated failures can pause a destination. Reports are still collected; nothing is leaving. See "A destination was paused, and what to do".</p>

        <H2>6. It is still trying</H2>
        <p>
          A failure that might pass on its own is retried: eight attempts over about ten hours. A status of <strong>retrying</strong> means Issueit will try again, and the row says when. Nothing is
          lost in the meantime.
        </p>

        <H2>Retry once you've fixed the cause</H2>
        <Steps>
          <Step>
            Open the report and select <UI>Retry</UI> beside the failed delivery — or
          </Step>
          <Step>
            Select <UI>Integrations → Log</UI>, filter by <UI>Failed</UI>, and retry in bulk.
          </Step>
        </Steps>
        <p>Retrying is safe. Issueit won't file a second issue for a report that already has one where the service can be asked.</p>

        <Note kind="important">
          <p>
            Self-hosting? If every process is set to <C>ROLE=api</C> with no worker, nothing is ever delivered and nothing complains loudly. See "Install Issueit on your own server".
          </p>
        </Note>
        <Note kind="tip">
          <p>
            <C>npx issueit health</C> prints the queue, the failures and any paused destinations, and exits non-zero when delivery is behind — so a scheduled job can tell you before anybody notices.
          </p>
        </Note>
      </>
    ),
  },

  {
    slug: "a-destination-was-paused-and-what-to-do",
    title: "A destination was paused, and what to do",
    summary: "Issueit stops sending to a destination whose deliveries keep failing. Here's what that means, and how to get it running again.",
    category: "deliver",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT2005",
    updated: "31 October 2026",
    keywords: "paused destination disabled failing auto pause resume email alert",
    related: ["reports-are-not-reaching-your-issue-tracker", "choose-which-emails-issueit-sends-you"],
    body: () => (
      <>
        <p>
          <strong>Symptoms.</strong> You've had an email saying a destination was paused, or a destination is marked <strong>Paused</strong> in the dashboard.
        </p>
        <p>
          It means several deliveries in a row failed for a reason retrying won't fix — usually a revoked credential or a target that no longer exists. Rather than keep hammering a service that is
          refusing, Issueit stops and tells you.
        </p>
        <Note kind="important">
          <p>
            Reports are still being collected. Nothing is being lost. But nothing is reaching that destination either, which is the failure mode that looks like everything working — so it is worth
            fixing the same day.
          </p>
        </Note>

        <H2>Get it running again</H2>
        <Steps>
          <Step>
            Open the project's <UI>Integrations</UI> tab and select the paused destination. The reason it paused is shown at the top.
          </Step>
          <Step>Fix that cause. Most often: reconnect the account, or point the destination at a target that still exists.</Step>
          <Step>
            Select <UI>Resume</UI>.
          </Step>
          <Step>
            Select <UI>Send a test report</UI> to prove it before you rely on it.
          </Step>
          <Step>
            Open <UI>Integrations → Log</UI>, filter by <UI>Failed</UI>, and retry the deliveries that failed while it was paused. Those reports then arrive, late but intact.
          </Step>
        </Steps>

        <H2>Why it paused</H2>
        <Table
          head={["Reason", "What to do"]}
          rows={[
            ["The account needs reconnecting", <>Settings → Connections → <UI>Reconnect</UI>. Then resume the destination.</>],
            ["The repository, board or channel is gone", "Change the destination's target, or create the thing it expects."],
            ["The service kept refusing the request", "Check the credential's permissions in that service. A token that can read but not write looks like this."],
            ["Your own webhook kept failing", "Check it answers a 2xx quickly — 20 seconds is the default limit — and that it isn't redirecting, because redirects aren't followed."],
          ]}
        />

        <H2>Turn pausing on, off, or up</H2>
        <p>
          Pausing is a per-destination setting and is off unless somebody turns it on. Open the destination, find <UI>Delivery</UI>, and set <UI>Pause after</UI> to the number of consecutive permanent
          failures you'll tolerate — or to zero to never pause.
        </p>
        <Note>
          <p>The warning email goes to owners and admins, at most once a day per destination, and needs a mail server on the install. Check who gets it under <UI>Settings → Notifications</UI>.</p>
        </Note>
      </>
    ),
  },

  {
    slug: "work-through-your-bug-reports",
    title: "Work through your bug reports",
    summary: "Assign, note, resolve and close reports, handle several at once, and do it all from the keyboard.",
    category: "reports",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT3001",
    updated: "31 October 2026",
    keywords: "inbox triage assign notes resolve close bulk keyboard shortcuts status filter search",
    related: ["stop-getting-hundreds-of-reports-for-one-bug", "tell-people-when-their-bug-is-fixed"],
    body: () => (
      <>
        <p>
          Issueit isn't an issue tracker — your destinations are for that — but reports still have to be dealt with. The inbox does the few things that take: say who's looking, write down what you
          found, and mark it done.
        </p>

        <H2>The four statuses</H2>
        <Table
          head={["Status", "Means", "What happens"]}
          rows={[
            ["New", "Nobody has looked.", "Where every report starts."],
            ["Investigating", "Somebody is on it.", "Set automatically when you assign it."],
            ["Resolved", "Fixed.", "Everyone who reported it and asked to hear gets an email. The duplicate group ends."],
            ["Closed", "Dealt with another way — not a bug, won't fix.", "The group ends. Nobody is emailed."],
          ]}
        />

        <H2>Deal with one report</H2>
        <Steps>
          <Step>
            Select <UI>Inbox</UI>, then a report. It opens beside the list.
          </Step>
          <Step>
            Select <UI>Assign</UI> and choose somebody — yourself, usually. The status becomes <strong>Investigating</strong>.
          </Step>
          <Step>
            Scroll to <UI>Notes</UI> and write what you tried. Notes are internal: never delivered anywhere, never shown to the reporter.
          </Step>
          <Step>
            When it's fixed, select <UI>Resolve</UI>.
          </Step>
        </Steps>
        <Note kind="tip">
          <p>
            If the report created an issue in your tracker, you don't need this step: closing the issue there resolves the report here within a few minutes. See "Tell people when their bug is fixed".
          </p>
        </Note>

        <H2>Several at once</H2>
        <Steps>
          <Step>
            Tick the box on each row — or press <kbd>x</kbd> with the row focused. Shift-click picks a whole run.
          </Step>
          <Step>Use the bar that appears to resolve, close, assign or delete the lot.</Step>
        </Steps>
        <p>Every change can be undone from the message that follows it, which is what makes working quickly safe.</p>

        <H2>The keyboard</H2>
        <Table
          head={["Key", "Does"]}
          rows={[
            [<><kbd>j</kbd> and <kbd>k</kbd></>, "Move down and up the list. Arrow keys work too."],
            [<kbd>Enter</kbd>, "Open the focused report."],
            [<kbd>e</kbd>, "Resolve it."],
            [<kbd>m</kbd>, "Assign it to you."],
            [<kbd>x</kbd>, "Choose it, for a bulk action."],
            [<kbd>Esc</kbd>, "Close the panel."],
          ]}
        />

        <H2>Find the ones that matter</H2>
        <Table
          head={["Filter", "Shows"]}
          rows={[
            ["Status", "The new ones, or everything still being investigated."],
            ["Priority", "Critical first, on a bad morning."],
            ["Assigned to me", "Your own queue."],
            ["Project", "One product at a time."],
            ["Failed delivery", "Reports nobody outside Issueit has been told about. Worth checking weekly."],
            ["Search", "Matches the title, the description, the reporter's address, or a report id pasted whole."],
          ]}
        />

        <H3>What's in a report</H3>
        <p>
          Below what the person wrote you'll find the page and browser, any screenshots, and then the three recordings: the console errors with stack traces, the requests the page made with their
          status codes, and the clicks and page changes in order. The bug is usually visible in those three — a 500 two lines above an exception, say.
        </p>

        <More title="Triage from a terminal, or with an agent">
          <p>
            <C>issueit ls --status new</C> and <C>issueit show 42</C> print the same thing in a terminal. A coding agent connected through <Doc to="/automate/mcp">the MCP server</Doc> can read a
            report with its recordings, fix the code and resolve the report — which, for a lot of teams, is now how triage happens.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "stop-getting-hundreds-of-reports-for-one-bug",
    title: "Stop getting hundreds of reports for one bug",
    summary: "Issueit groups reports of the same fault so your tracker gets one issue, not four hundred. Here's how to make the grouping fit your product.",
    category: "reports",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT3002",
    updated: "31 October 2026",
    keywords: "duplicates grouping merge noise spam same bug fingerprint rules title pattern",
    related: ["work-through-your-bug-reports", "reports-are-not-reaching-your-issue-tracker"],
    body: () => (
      <>
        <p>
          One broken page can produce hundreds of reports in an hour. Issueit joins reports of the same fault into a group: the first is delivered, the rest are stored, and your tracker gets a comment
          as the group grows rather than a new issue each time.
        </p>

        <H2>How reports are matched</H2>
        <p>Two reports are the same bug when they have the same title and the same page, compared loosely:</p>
        <Table
          head={["Compared", "Ignoring"]}
          rows={[
            ["The title", "Capitals, punctuation, accents and numbers — except three-digit error codes, because a 500 and a 404 are different bugs."],
            ["The page", "Anything after the question mark, and id-like parts of the path, so /orders/8812/edit and /orders/91/edit are one page."],
          ]}
        />
        <p>So "Error #4012 on save!" and "error 77 on save" are one bug. A title that comes down to fewer than three characters isn't grouped at all.</p>

        <H2>When too much is grouped together</H2>
        <p>
          <strong>Symptom.</strong> Different bugs are landing in one group, usually because the titles are generic — "Something went wrong".
        </p>
        <Steps>
          <Step>Make the form ask for a title that says what broke. The question is yours to change, on the project's Widget tab.</Step>
          <Step>
            On a report in the wrong group, select <UI>Separate from group</UI>. It becomes its own bug, and is delivered.
          </Step>
        </Steps>

        <H2>When too little is grouped together</H2>
        <p>
          <strong>Symptom.</strong> Hundreds of issues for one fault, because the title carries something unique: an order number, a date, a customer's name.
        </p>
        <Steps>
          <Step>
            Open the project, then the <UI>Rules</UI> tab.
          </Step>
          <Step>
            Under <UI>Grouping</UI>, add a title pattern for the part that varies, for example <C>order #\d+</C>.
          </Step>
          <Step>
            Issueit previews the change against this project's last hundred reports, so you can see exactly what would merge. Then select <UI>Save</UI>.
          </Step>
        </Steps>
        <Table
          head={["Also on that tab", "Use when"]}
          rows={[
            [<UI>Path depth</UI>, <>Only the first few parts of the address should count, so <C>/docs/a</C> and <C>/docs/b</C> are one page.</>],
            [<UI>Ignore the page</UI>, "The same fault can happen anywhere in your app."],
            [<UI>Group duplicates</UI>, "You want grouping off entirely — every report delivered, however many there are."],
          ]}
        />

        <H2>What a group does to your tracker</H2>
        <Table
          head={["", "What happens"]}
          rows={[
            ["The first report", "Delivered as usual. It's the one with the issue."],
            ["The rest", "Stored in full, with their own screenshots and recordings. Not delivered again."],
            ["Your issue", "Gets a comment at 2, 3, 5, 10, 25, 50, 100, 250 and 500 reports, then every thousand."],
            ["Email about it", "Nobody is emailed about a duplicate — you were told about that bug already."],
            ["When you resolve it", "Everyone in the group who asked to hear is emailed, once each. The group then ends, so the bug coming back starts a new one."],
          ]}
        />
        <Note kind="tip">
          <p>
            If your product files reports automatically, send your own grouping key with each one — an error's name and location. That is always better than letting Issueit guess from the title. See{" "}
            <Doc to="/reports/duplicates">duplicates and fingerprints</Doc>.
          </p>
        </Note>
      </>
    ),
  },

  {
    slug: "tell-people-when-their-bug-is-fixed",
    title: "Tell people when their bug is fixed",
    summary: "Turn on reporter emails and the person who reported a bug gets a receipt, and a note when you've fixed it — from your own domain.",
    category: "reports",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT3003",
    updated: "31 October 2026",
    keywords: "reporter email notify fixed receipt resolved unsubscribe branding domain resend postmark",
    related: ["work-through-your-bug-reports", "choose-which-emails-issueit-sends-you", "issueit-is-not-sending-any-email"],
    body: () => (
      <>
        <p>
          The person who reported the bug is usually the only one who never hears what happened to it. Reporter emails fix that, and they are the cheapest goodwill in the product: two emails, no
          account, no portal.
        </p>

        <H2>Turn it on</H2>
        <Steps>
          <Step>
            Open the project, then <UI>Settings</UI>.
          </Step>
          <Step>
            Turn on <UI>Email reporters about their bug</UI>.
          </Step>
          <Step>
            Open the <UI>Widget</UI> tab and check <UI>Offer email updates</UI> is on, so the form shows the tick box.
          </Step>
        </Steps>
        <p>The form now offers "Email me when this is fixed" under the email field. Nobody is emailed who didn't ask.</p>

        <H2>What they get</H2>
        <Table
          head={["Email", "When", "Contains"]}
          rows={[
            ["A receipt", "They send the report.", "Your logo and brand name, the report's title, and a link to stop emails about it."],
            ["It's fixed", "You resolve the report, or close the issue it created in GitHub, GitLab, Linear or Jira.", "The same, plus the news. No internal notes, no recordings, no other reporters."],
          ]}
        />
        <p>Everyone in a duplicate group who asked to hear gets the "fixed" email once. Nobody hears twice, and nobody sees anybody else's address.</p>

        <H2>Send it from your own domain</H2>
        <p>By default these go out through the Issueit install's own mail server. To send as you instead:</p>
        <Steps>
          <Step>
            Select <UI>Settings → Connections</UI>.
          </Step>
          <Step>
            Connect an email service: Resend, Postmark, SendGrid, Mailgun, Brevo, Mailjet, SparkPost, Amazon SES, or any SMTP server.
          </Step>
          <Step>
            On the project's <UI>Settings</UI>, choose that connection under <UI>Send reporter email through</UI>.
          </Step>
        </Steps>
        <Note>
          <p>Make sure the domain you send from is set up properly in that service — SPF and DKIM — or the mail will go to spam, which is worse than not sending it.</p>
        </Note>

        <H2>Stopping</H2>
        <p>
          Every email has a one-click stop link. Opening it shows a button rather than acting immediately, so a mail scanner that fetches links can't unsubscribe somebody by accident.
        </p>

        <H2>If nothing arrives</H2>
        <Table
          head={["Check", "Where"]}
          rows={[
            ["The project has reporter emails on", "The project's Settings."],
            ["The reporter actually ticked the box", "The report shows whether they asked."],
            ["There is an email address", "An email with no address can't be sent."],
            ["The install has a mail server", <>No <C>SMTP_URL</C> and no email connection means nothing is sent. See "Issueit is not sending any email".</>],
          ]}
        />
      </>
    ),
  },

  {
    slug: "choose-which-emails-issueit-sends-you",
    title: "Choose which emails Issueit sends you",
    summary: "Set what you hear about: new reports, paused destinations, a daily or weekly digest. The settings are per person and per organisation.",
    category: "reports",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT3004",
    updated: "31 October 2026",
    keywords: "notifications email alerts digest daily weekly too many emails mute unsubscribe",
    related: ["a-destination-was-paused-and-what-to-do", "work-through-your-bug-reports", "issueit-is-not-sending-any-email"],
    body: () => (
      <>
        <p>
          A bug pipeline nobody is told about is one you have to remember to check. These settings are yours alone, and separate for each organisation you belong to — so your own product can shout and
          a colleague's can stay quiet.
        </p>

        <H2>Change them</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Notifications</UI>.
          </Step>
          <Step>Set each one. Changes save as you make them.</Step>
          <Step>
            Select <UI>Send me a digest now</UI> to see what one looks like — also the quickest way to prove email works at all.
          </Step>
        </Steps>

        <H2>What's on offer</H2>
        <Table
          head={["Email", "Options", "Suggested"]}
          rows={[
            ["A report arrived", "Off · critical only · high and above · everything", "Critical only. A duplicate joining an open bug never emails anybody, so this is quieter than it sounds."],
            ["A destination was paused", "On or off", <>On. See the note below.</>],
            ["Digest", "Off · daily · weekly", "Daily if you own the queue, weekly otherwise. Nothing is sent on a quiet day."],
            ["Near your monthly allowance", "On or off", "On. Hosted plans only, and it goes to owners."],
          ]}
        />
        <Note kind="important">
          <p>
            If you turn off only one of these, don't make it "a destination was paused". That's the failure where reports keep arriving in Issueit and nothing reaches your tracker — it looks exactly
            like everything working.
          </p>
        </Note>

        <H2>Getting too much</H2>
        <Steps>
          <Step>
            Set <UI>A report arrived</UI> to critical only, and rely on the digest for the rest.
          </Step>
          <Step>Send fewer reports to chat instead of to your inbox: filter the chat destination to high and critical. See "Send only some reports to a destination".</Step>
          <Step>If a single bug is filling your inbox, it is probably not being grouped. See "Stop getting hundreds of reports for one bug".</Step>
        </Steps>

        <H2>Getting nothing</H2>
        <Table
          head={["Check", "Detail"]}
          rows={[
            ["Your address is confirmed", <>Settings → Account. Until it's confirmed, Issueit won't email you — including password resets.</>],
            ["You're in the right organisation", "These settings are per organisation. Switch with the picker at the top of the sidebar."],
            ["The install can send mail", <>Self-hosted installs need <C>SMTP_URL</C>. See "Issueit is not sending any email".</>],
            ["Spam", "Add the sender to your contacts, and ask whoever runs your mail to allow it."],
          ]}
        />
        <Note kind="tip">
          <p>
            For monitoring rather than reading, don't use email at all: Issueit answers "how old is the oldest thing still waiting" on an endpoint, and serves Prometheus metrics. See{" "}
            <Doc to="/automate/monitoring">health and metrics</Doc>.
          </p>
        </Note>
      </>
    ),
  },
];
