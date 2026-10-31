import { C, Code, Doc, H2, H3, More, Note, Step, Steps, Table, UI } from "../kit";
import type { Article } from "../types";

/** Getting started, and collecting reports. */

export const basicArticles: Article[] = [
  {
    slug: "create-your-first-project",
    title: "Create your first project in Issueit",
    summary: "A project is one website, product or app. Creating one gives you a report button, a public form and an address to send reports to.",
    category: "start",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT1001",
    updated: "31 October 2026",
    keywords: "new project add project setup project id",
    related: ["add-the-bug-report-button-to-your-website", "send-bug-reports-to-github-issues", "invite-your-team-and-set-their-roles"],
    body: () => (
      <>
        <p>Everything in Issueit belongs to a project: the report button's appearance, where reports are sent, and the reports themselves. Most teams have one project per product, and a second for staging.</p>

        <H2>Create the project</H2>
        <Steps>
          <Step>
            Select <UI>Projects</UI> in the sidebar, then <UI>New project</UI>.
          </Step>
          <Step>Give it the name your team uses for the product — it appears in delivered issues, so "Website" is better than "Project 1".</Step>
          <Step>
            Select <UI>Create project</UI>.
          </Step>
        </Steps>
        <p>The project's overview opens, showing three things you will need:</p>
        <Table
          head={["This", "Is for"]}
          rows={[
            [
              <>
                The <strong>project id</strong>, which looks like <C>prj_abc123</C>
              </>,
              "Putting in your website, so reports know where to go. It is public and safe to publish.",
            ],
            ["The widget snippet", "Copying into your pages. One line of HTML."],
            ["The hosted form's address", "Sending to anyone who needs to report a bug without your product open."],
          ]}
        />

        <H2>Send a test report</H2>
        <p>Before you change any of your own code, prove the project works.</p>
        <Steps>
          <Step>
            On the project's overview, select <UI>Send a test report</UI>.
          </Step>
          <Step>
            Open <UI>Inbox</UI>. The report appears straight away.
          </Step>
        </Steps>
        <Note>
          <p>The test report is marked as a test and left out of your monthly counts, so you can send as many as you like while you set things up.</p>
        </Note>

        <H2>What to do next</H2>
        <Steps>
          <Step>
            <strong>Collect reports.</strong> Add the report button to your site, or share the hosted form's address.
          </Step>
          <Step>
            <strong>Add a destination.</strong> Until you do, reports are collected and nobody is told. Open the project's <UI>Integrations</UI> tab and connect your issue tracker or chat.
          </Step>
          <Step>
            <strong>Decide who hears about new reports.</strong> Under <UI>Settings → Notifications</UI>, choose whether you want an email for every report, only the critical ones, or none.
          </Step>
        </Steps>

        <More title="Creating a project from the command line">
          <p>
            If you'd rather not use the dashboard, <C>npx issueit init</C> creates the project, detects your framework, writes the project id into <C>.issueit.json</C> and prints the snippet to paste.
          </p>
          <Code title="Terminal" code={`npx issueit login\nnpx issueit init`} />
          <p>
            See <Doc to="/automate/cli">the command line</Doc> in the developer documentation.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "add-the-bug-report-button-to-your-website",
    title: "Add the bug report button to your website",
    summary: "One line of HTML puts a report button in the corner of every page, and attaches the details a developer needs to each report.",
    category: "start",
    appliesTo: ["Issueit widget"],
    id: "IT1002",
    updated: "31 October 2026",
    keywords: "install script tag snippet embed widget button javascript wordpress shopify",
    related: ["change-what-the-report-form-asks-for", "the-bug-report-button-is-not-appearing", "collect-bug-reports-without-adding-code"],
    body: () => (
      <>
        <p>
          The report button is a single script that you add once. It draws a small button in the corner of the page, opens a short form, and attaches the page address, the browser, a screenshot and
          the errors that happened just before — so nobody has to ask "what were you doing?".
        </p>

        <H2>Add the script</H2>
        <Steps>
          <Step>
            Open the project, then select the <UI>Widget</UI> tab.
          </Step>
          <Step>
            Select <UI>Copy snippet</UI>.
          </Step>
          <Step>
            Paste it into your site's HTML, just before the closing <C>&lt;/body&gt;</C> tag, in whichever template appears on every page.
          </Step>
          <Step>Publish the change, open your site, and the button appears in the corner.</Step>
        </Steps>
        <Code
          title="The snippet"
          code={`<script
  src="https://cdn.issueit.app/widget.js"
  data-project="prj_abc123"
  defer
></script>`}
        />
        <Note>
          <p>
            Use your own project id in place of <C>prj_abc123</C>. The snippet on the <UI>Widget</UI> tab already has it filled in.
          </p>
        </Note>

        <H2>Where to paste it</H2>
        <Table
          head={["If your site is", "Paste it into"]}
          rows={[
            ["Plain HTML", "Every page's template, before </body>."],
            ["WordPress", "Appearance → Theme file editor → footer.php, or a plugin that inserts code into the footer."],
            ["Shopify", "Online store → Themes → Edit code → theme.liquid, before </body>."],
            ["Webflow, Squarespace or Wix", "The site-wide custom code or footer code setting."],
            ["React, Vue, Svelte or Angular", <>The <C>index.html</C> in your project root, not a component.</>],
            ["Next.js, Nuxt or SvelteKit", "The root layout or document file, so it is on every route."],
          ]}
        />

        <H2>Check that it works</H2>
        <Steps>
          <Step>Open a page of your site and select the report button.</Step>
          <Step>Write a sentence and send it.</Step>
          <Step>
            Open <UI>Inbox</UI> in Issueit. The report is there, with the page address and the browser already filled in.
          </Step>
        </Steps>
        <p>
          If the button doesn't appear, see <strong>The bug report button is not appearing</strong> in the related articles below.
        </p>

        <H2>If you can't add a script</H2>
        <p>Every project also has a public form you can link to, with nothing to install. See "Collect bug reports without adding code".</p>

        <More title="Options for the snippet">
          <p>A few extras can be set on the script tag itself. Everything else — the button's label, size, colour and position, and which questions the form asks — is set in the dashboard.</p>
          <Table
            head={["Add this", "To"]}
            rows={[
              [<C>data-theme="dark"</C>, "Force the dark or light appearance instead of following the visitor's system."],
              [<C>data-source="ios-webview"</C>, "Label where these reports came from, so you can route them separately."],
              [<C>data-capture="off"</C>, "Record nothing on that page — a checkout or an account page, say."],
              [<C>data-mode="inline" data-target="#report"</C>, "Draw the form inside your own element instead of a floating button."],
            ]}
          />
          <p>
            The full list is in <Doc to="/collect/widget">the widget documentation</Doc>.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "collect-bug-reports-without-adding-code",
    title: "Collect bug reports without adding code",
    summary: "Every project has a public page that collects reports. Share the link and anybody can use it — no script, no account, nothing to install.",
    category: "start",
    appliesTo: ["Issueit hosted form"],
    id: "IT1003",
    updated: "31 October 2026",
    keywords: "hosted form link url qr code support email no javascript",
    related: ["add-the-bug-report-button-to-your-website", "change-what-the-report-form-asks-for"],
    body: () => (
      <>
        <p>
          The hosted form is the same form the report button opens, on a page of its own. It is the answer when you can't add a script to the page, or when the person reporting isn't in your product at
          all.
        </p>

        <H2>Find the link</H2>
        <Steps>
          <Step>Open the project.</Step>
          <Step>
            On the overview, find <UI>Hosted form</UI> and select <UI>Copy link</UI>.
          </Step>
        </Steps>
        <Code title="What it looks like" code={`https://drop.issueit.app/r/prj_abc123`} />

        <H2>Good places to use it</H2>
        <Table
          head={["Use it", "Because"]}
          rows={[
            ["In a reply to a support email", "You get back something a developer can act on, instead of three more emails."],
            ["As a bookmark for testers", "Nobody has to find the button, or be on the right page."],
            ["In a native app", "Open it in a web view, or link to it from the about screen."],
            ["As a QR code", "On a kiosk, a printed card, or a sticker on a machine."],
            ["On an internal tool", "A site you'd rather not add any JavaScript to."],
          ]}
        />

        <H2>What's different from the button</H2>
        <Table
          head={["", "Report button", "Hosted form"]}
          rows={[
            ["Where it lives", "Inside your product", "A page on Issueit"],
            ["The page address", "Filled in automatically", "Only what the person types"],
            ["Errors from the page", "Attached automatically", "None — there is no page to watch"],
            ["Screenshot", "Taken from the tab, with permission", "Uploaded as a file"],
            ["Appearance", "Your project's widget settings", "The same settings"],
            ["Labelled as", <C>widget</C>, <C>form</C>],
          ]}
        />
        <Note kind="tip">
          <p>
            Because reports from the form are labelled <C>form</C>, you can send them somewhere different — a support queue rather than the engineering tracker. See "Send only urgent reports to a
            destination" for how the filters work.
          </p>
        </Note>

        <H2>Branding it</H2>
        <p>
          The page uses the project's logo, brand name, colour, title and success message from the <UI>Widget</UI> tab, so it looks like you rather than like us. See "Change what the report form asks
          for".
        </p>
        <Note>
          <p>
            If the project has been set to refuse public reports, the hosted form stops working too and says so, because it is public by nature. Turn public reports back on under{" "}
            <UI>Settings → Collecting reports</UI>, or collect them through your own server instead.
          </p>
        </Note>
      </>
    ),
  },

  {
    slug: "invite-your-team-and-set-their-roles",
    title: "Invite your team and set their roles",
    summary: "Add people to your organisation, choose what each of them can change, and remove them when they leave.",
    category: "start",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT1004",
    updated: "31 October 2026",
    keywords: "members invite roles owner admin permissions remove user team",
    related: ["choose-which-emails-issueit-sends-you", "reset-a-forgotten-password"],
    body: () => (
      <>
        <p>Reports, projects and destinations belong to an organisation, and people are invited into it. Everyone sees the same reports; the role decides what they can change.</p>

        <H2>Invite somebody</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Members</UI>.
          </Step>
          <Step>
            Select <UI>Invite</UI>, enter their email address, and choose a role.
          </Step>
          <Step>
            Select <UI>Send invitation</UI>.
          </Step>
        </Steps>
        <p>
          They get an email with a link that lasts seven days. The link is also shown in the dashboard, so you can send it to them yourself — useful when your install has no mail server, or when their
          inbox is being difficult.
        </p>

        <H2>The three roles</H2>
        <Table
          head={["Role", "Can", "Can't"]}
          rows={[
            ["Owner", "Everything, including billing, members, ingest keys and deleting the organisation.", "—"],
            ["Admin", "Create and change projects, destinations, connections and rules. Triage reports.", "Billing, inviting or removing people, creating ingest keys."],
            ["Member", "Read and triage reports, and read settings.", "Change projects, destinations or connections."],
          ]}
        />
        <Note>
          <p>An account token never has more access than the person who created it, and their role is checked on every request — so demoting somebody immediately narrows their tokens too.</p>
        </Note>

        <H2>Change somebody's role</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Members</UI>.
          </Step>
          <Step>
            Select the role beside their name and choose a new one. It takes effect at once.
          </Step>
        </Steps>

        <H2>When somebody leaves</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Members</UI>, then <UI>Remove</UI> beside their name.
          </Step>
          <Step>
            Check <UI>Settings → Account tokens</UI> for tokens they created, and revoke any that are still in use somewhere. A token survives its creator's removal only until you revoke it, so this is
            worth doing the same day.
          </Step>
          <Step>
            Check <UI>Settings → Connections</UI> for accounts connected through their sign-in — a GitHub account, for instance. Reconnect those with an account the team shares.
          </Step>
        </Steps>
        <Note kind="important">
          <p>
            Removing somebody doesn't delete the reports they triaged or the notes they wrote; those stay, with their name on them. An organisation must always have at least one owner, so promote
            somebody before removing the last one.
          </p>
        </Note>
      </>
    ),
  },

  {
    slug: "change-what-the-report-form-asks-for",
    title: "Change what the report form asks for",
    summary: "Set the title, the questions, the button and the colours for your report form, and see the result before you save it.",
    category: "collect",
    appliesTo: ["Issueit widget", "Issueit hosted form"],
    id: "IT1005",
    updated: "31 October 2026",
    keywords: "widget studio customise appearance fields questions branding logo colour button label",
    related: ["add-the-bug-report-button-to-your-website", "stop-the-widget-recording-sensitive-information"],
    body: () => (
      <>
        <p>
          Everything about the form is a project setting rather than something in your code, so you can change it without a deploy. The <UI>Widget</UI> tab shows a live preview beside the settings.
        </p>

        <H2>Open the editor</H2>
        <Steps>
          <Step>Open the project.</Step>
          <Step>
            Select the <UI>Widget</UI> tab.
          </Step>
          <Step>Change something on the left; the preview on the right follows.</Step>
          <Step>
            Select <UI>Save</UI>. Pages pick it up within a minute — there is nothing to republish.
          </Step>
        </Steps>

        <H2>What you can change</H2>
        <Table
          head={["Setting", "Does"]}
          rows={[
            ["Title and description", "The heading and the line above the form. \"Report a problem\" works better than \"Feedback\" if bugs are what you want."],
            ["Fields", "Which questions appear, and which are required: the email address, the priority, a description."],
            ["Email updates tick box", "Offers to tell the reporter when it's fixed. Needs reporter emails turned on for the project."],
            ["Button label, size, shape and position", "The launcher in the corner. It can also be hidden on small screens."],
            ["Logo, brand name and accent colour", "Makes the form look like your product. Used by the hosted form too."],
            ["Theme", "Light, dark, or following the visitor's own setting."],
            ["Keyboard shortcut", "Opens the form from anywhere on your site."],
            ["Success message", "What somebody sees after sending. A good place to say how long you usually take."],
          ]}
        />

        <H2>Hide the button and open the form yourself</H2>
        <p>If you already have a "Report a problem" item in a menu, keep the script and use your own control.</p>
        <Steps>
          <Step>
            On the <UI>Widget</UI> tab, turn off <UI>Show the floating button</UI>.
          </Step>
          <Step>Call the form from your own click handler.</Step>
        </Steps>
        <Code title="Your own button" code={`document.querySelector("#report-bug")\n  .addEventListener("click", () => Issueit.open());`} />

        <Note kind="tip">
          <p>
            If people are already signed in to your product, you can skip the email question entirely: tell Issueit who they are with one call and the field disappears. See{" "}
            <Doc to="/collect/widget-api">the widget runtime</Doc>.
          </p>
        </Note>

        <More title="Trying it without sending anything">
          <p>
            Add <C>data-debug="true"</C> to the script tag and the form prints exactly what it would send to the browser console and sends nothing. It is the way to see what is captured before real
            visitors use it.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "stop-the-widget-recording-sensitive-information",
    title: "Stop the report form recording sensitive information",
    summary: "What Issueit records from a page, what it never records, and the four ways to turn each part off.",
    category: "collect",
    appliesTo: ["Issueit widget"],
    id: "IT1006",
    updated: "31 October 2026",
    keywords: "privacy gdpr console network steps capture redact scrub personal data pii session replay",
    related: ["change-what-the-report-form-asks-for", "delete-a-report-project-or-organisation"],
    body: () => (
      <>
        <p>
          To make a report fixable, the form attaches what happened on the page just before it: errors from the console, the requests the page made, and which things were clicked. That is also the part
          most likely to worry somebody, so it is narrow by design and can be switched off in four different places.
        </p>

        <H2>What is recorded</H2>
        <Table
          head={["List", "Contains", "How much"]}
          rows={[
            ["Console", "Errors and warnings, uncaught errors, and files that failed to load — with stack traces where the browser provides one.", "The last 40"],
            ["Network", "The method, path, status and duration of requests the page made.", "The last 40"],
            ["Steps", "Clicks, page changes, and which field was edited.", "The last 30"],
          ]}
        />

        <H2>What is never recorded</H2>
        <Table
          head={["Not recorded", "Detail"]}
          rows={[
            ["What anybody typed", "Steps say which field changed, never its contents. Password fields aren't recorded at all."],
            ["Request or response bodies", "Never read."],
            ["Headers or cookies", "Never read."],
            ["Values in a web address", <>Parameter names are kept and values replaced: <C>/search?q=…</C></>],
            ["The screen", "Nothing like session replay. A screenshot only happens when somebody presses the button and the browser asks permission."],
          ]}
        />
        <p>
          On top of that, email addresses, tokens, authorisation headers and card-shaped numbers are removed from anything that is recorded — once in the browser, and again on our side.
        </p>

        <H2>Turn it off</H2>
        <H3>For a whole project</H3>
        <Steps>
          <Step>
            Open the project, then the <UI>Widget</UI> tab.
          </Step>
          <Step>
            Under <UI>What to capture</UI>, turn off <UI>Console messages</UI>, <UI>Network requests</UI> or <UI>Steps</UI> — each is separate.
          </Step>
          <Step>
            Select <UI>Save</UI>.
          </Step>
        </Steps>

        <H3>For one page</H3>
        <p>
          Add <C>data-capture="off"</C> to the script tag on that page. Nothing is recorded there at all — the right answer for a checkout, an account page or anywhere you'd rather not have a list of
          requests.
        </p>
        <Code code={`<script src="https://cdn.issueit.app/widget.js"\n  data-project="prj_abc123" data-capture="off" defer></script>`} />

        <H3>By the person reporting</H3>
        <p>The form shows what will be attached, with a tick box. Somebody who unticks it sends a report with none of it.</p>

        <H3>Afterwards</H3>
        <p>
          Attachments and these lists are deleted on a schedule, while the report itself stays. You can also delete a single report's attachments and recording from the report at any time. See "Delete
          a report, project or organisation".
        </p>

        <H2>Remove your own patterns too</H2>
        <Steps>
          <Step>
            Open the project, then the <UI>Rules</UI> tab.
          </Step>
          <Step>
            Under <UI>Redaction</UI>, add a pattern — an account number format, a customer reference.
          </Step>
          <Step>
            Issueit previews it against this project's last hundred reports so you can see exactly what would have been removed. Then select <UI>Save</UI>.
          </Step>
        </Steps>
        <Note kind="important">
          <p>
            Patterns apply to reports that arrive from then on. They don't rewrite reports you already have — delete those instead if something sensitive was captured before you added the pattern.
          </p>
        </Note>
      </>
    ),
  },

  {
    slug: "the-bug-report-button-is-not-appearing",
    title: "The report button is not appearing on your site",
    summary: "Work through the five things that stop the button being drawn, in the order they're most likely.",
    category: "collect",
    appliesTo: ["Issueit widget"],
    id: "IT1007",
    updated: "31 October 2026",
    keywords: "widget not showing missing broken console error csp blocked script 404 troubleshooting",
    related: ["add-the-bug-report-button-to-your-website", "reports-are-not-reaching-your-issue-tracker"],
    body: () => (
      <>
        <p>
          <strong>Symptoms.</strong> You've added the script to your site, but no button appears in the corner, and no report arrives when you try.
        </p>
        <p>
          Open your browser's developer tools and look at the <strong>Console</strong> tab while you reload the page. The reason is almost always there, and these are the five it will be.
        </p>

        <H2>1. The script isn't on the page</H2>
        <p>
          In developer tools, open <strong>Network</strong>, reload, and search for <C>widget.js</C>.
        </p>
        <Table
          head={["What you see", "What it means"]}
          rows={[
            ["No request at all", "The snippet isn't in the HTML that was served. Check you edited the template this page actually uses, and that the change was published."],
            ["404", "The address is wrong. Copy the snippet again from the project's Widget tab."],
            ["200, but no button", "The script loaded. Carry on to the next cause."],
          ]}
        />

        <H2>2. The project id is missing or wrong</H2>
        <p>
          The script needs <C>data-project</C> on the tag itself. Without it the script loads and deliberately does nothing — which is how a copied snippet with the attribute stripped behaves.
        </p>
        <Code title="It must look like this" code={`<script src="https://cdn.issueit.app/widget.js" data-project="prj_abc123" defer></script>`} />
        <p>Compare the id with the one on your project's overview, character for character.</p>

        <H2>3. Your content security policy is blocking it</H2>
        <p>
          A console message mentioning <strong>Content Security Policy</strong> means your own site refused to load the script or let it reach us. Add both of these to your policy:
        </p>
        <Code
          title="Content-Security-Policy"
          code={`script-src 'self' https://cdn.issueit.app;
connect-src 'self' https://drop.issueit.app;`}
        />
        <p>
          Images also need <C>data:</C> and <C>blob:</C> in <C>img-src</C> for screenshot previews.
        </p>

        <H2>4. The site isn't on the project's allowed list</H2>
        <p>
          If the project has allowed sites set, a page on any other address is refused and the console shows a message about the origin not being allowed.
        </p>
        <Steps>
          <Step>
            Open the project, then <UI>Settings</UI>.
          </Step>
          <Step>
            Under <UI>Allowed sites</UI>, add the exact origin, for example <C>https://www.example.com</C>. The scheme and any subdomain both matter.
          </Step>
          <Step>Or clear the list entirely to accept reports from anywhere.</Step>
        </Steps>

        <H2>5. The button is hidden, not missing</H2>
        <Table
          head={["Check", "Where"]}
          rows={[
            [
              <>
                <UI>Show the floating button</UI> is turned off
              </>,
              "The project's Widget tab. If you turned it off, open the form from your own control instead.",
            ],
            [<><UI>Hide on mobile</UI> is on</>, "The same tab. Try a wider window."],
            ["Something of yours is on top of it", "Your own CSS. The button is at a high stacking order but a higher one wins; try the other corner."],
            [<>An ad blocker</>, "Try a private window with extensions off. Blockers occasionally match on filenames."],
          ]}
        />

        <Note kind="tip">
          <p>
            <C>npx issueit doctor</C> checks the project from the outside: whether anything has ever arrived, whether anybody is being told, and whether delivery is healthy. It is quicker than guessing.
          </p>
        </Note>
      </>
    ),
  },
];
