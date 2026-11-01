import { C, Code, Doc, H2, H3, More, Note, Step, Steps, Table, UI } from "../kit";
import type { Article } from "../types";

/** Accounts, plans, and running Issueit yourself. */

export const accountArticles: Article[] = [
  {
    slug: "reset-a-forgotten-password",
    title: "Reset a forgotten password",
    summary: "Get a reset link by email, and what to do when it doesn't arrive.",
    category: "account",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT4001",
    updated: "31 October 2026",
    keywords: "password forgot reset locked out sign in cannot log in email link expired",
    related: ["turn-on-two-step-verification", "issueit-is-not-sending-any-email"],
    body: () => (
      <>
        <H2>Reset it</H2>
        <Steps>
          <Step>
            On the sign-in page, select <UI>Forgotten your password?</UI>.
          </Step>
          <Step>Enter the address you sign in with and send the form.</Step>
          <Step>Open the email and select the link. It lasts an hour and works once.</Step>
          <Step>Choose a new password.</Step>
        </Steps>
        <Note kind="important">
          <p>
            Resetting signs out every other session, on every device. If you have two-step verification on, you will still be asked for a code afterwards — an inbox alone is not enough to get into
            your account.
          </p>
        </Note>

        <H2>The email hasn't arrived</H2>
        <Table
          head={["Check", "Detail"]}
          rows={[
            ["Spam and junk", "Look there first, and search for the sender rather than scrolling."],
            ["The address", "It has to be the one on the account. A typo gets no email and no error, on purpose — the page can't say whether an address exists."],
            ["Your address is confirmed", "Until a new or changed address is confirmed, Issueit won't send a reset to it. Somebody in your organisation can see this on the Members page."],
            ["Wait a minute", "Mail is queued and retried rather than sent in the request, so it can be a moment behind."],
            ["Self-hosted installs", <>With no mail server configured, nothing is sent at all. See "Issueit is not sending any email".</>],
          ]}
        />

        <H2>If you can't get an email at all</H2>
        <Steps>
          <Step>Ask an owner or admin in your organisation to check your address on the Members page, and to correct it if it's wrong.</Step>
          <Step>Or ask them to invite you again at an address you can reach, and sign in with that.</Step>
        </Steps>

        <More title="Self-hosted, and nobody can receive email">
          <p>
            This is the situation <C>SMTP_URL</C> exists to prevent, and the reason it should be set before anybody else signs up. With no mail at all, a password can only be reset by whoever has
            access to the database. Set up a mail server first; it fixes resets, invitations and everything else in one go.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "turn-on-two-step-verification",
    title: "Turn on two-step verification",
    summary: "Add a six-digit code from an authenticator app to your sign-in, and keep the recovery codes somewhere safe.",
    category: "account",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT4002",
    updated: "31 October 2026",
    keywords: "2fa mfa totp authenticator google authy 1password recovery codes lost phone",
    related: ["reset-a-forgotten-password", "invite-your-team-and-set-their-roles"],
    body: () => (
      <>
        <p>Two-step verification means a password alone isn't enough to get into your account. Issueit uses the standard six-digit codes, so any authenticator app works.</p>

        <H2>Turn it on</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Account</UI>.
          </Step>
          <Step>
            Under <UI>Two-step verification</UI>, select <UI>Set up</UI>.
          </Step>
          <Step>Scan the square with your authenticator app, or copy the key into it by hand.</Step>
          <Step>
            Enter the six-digit code the app shows, and select <UI>Turn on</UI>. Issueit waits for a working code before switching it on, so you can't lock yourself out by scanning the wrong thing.
          </Step>
          <Step>
            <strong>Save the ten recovery codes.</strong> In a password manager, or printed and put somewhere sensible. Each works once.
          </Step>
        </Steps>
        <Note kind="important">
          <p>The recovery codes are shown once and stored only as hashes, so nobody — including us — can show them to you again. If you lose them, generate a new set while you still have your app.</p>
        </Note>

        <H2>Signing in afterwards</H2>
        <p>Email address, password, then the current code from your app. A recovery code is accepted in place of it, and is then used up.</p>

        <H2>A new phone</H2>
        <Steps>
          <Step>While you still have the old one: sign in, go to Settings → Account, turn two-step off and set it up again on the new phone.</Step>
          <Step>If the old phone has gone: sign in with a recovery code, then turn it off and set it up again.</Step>
        </Steps>

        <H3>Generate fresh recovery codes</H3>
        <p>
          Under <UI>Settings → Account</UI>, select <UI>Generate new recovery codes</UI>. The old ten stop working immediately.
        </p>

        <H2>Locked out entirely</H2>
        <Table
          head={["Situation", "What to do"]}
          rows={[
            ["You have a recovery code", "Use it to sign in, then set two-step up again."],
            ["Hosted service, no codes and no app", "Write to support from the address on the account. We will ask you to prove it's yours; it isn't instant, by design."],
            ["Self-hosted, no codes and no app", "Whoever runs the install can clear the two-step settings on your row in the database."],
          ]}
        />
        <Note>
          <p>
            Account tokens are not affected by two-step verification — they are credentials in their own right, with their own scopes. See <Doc to="/automate/tokens">account tokens</Doc>.
          </p>
        </Note>
      </>
    ),
  },

  {
    slug: "delete-a-report-project-or-organisation",
    title: "Delete a report, a project or everything",
    summary: "What deleting removes, what it can't reach, and how to make Issueit hold less in the first place.",
    category: "account",
    appliesTo: ["Issueit hosted service", "Issueit self-hosted"],
    id: "IT4003",
    updated: "31 October 2026",
    keywords: "delete remove gdpr data request retention privacy erase attachments screenshots close account",
    related: ["stop-the-widget-recording-sensitive-information", "install-issueit-on-your-own-server"],
    body: () => (
      <>
        <H2>Delete one report</H2>
        <Steps>
          <Step>
            Open the report from the <UI>Inbox</UI>.
          </Step>
          <Step>
            Select <UI>Delete</UI>, then confirm.
          </Step>
        </Steps>
        <p>The report, its screenshots and files, its recordings, its notes and its delivery history all go. Several at once: tick the rows and use the bulk action.</p>
        <Note>
          <p>
            To remove just the heavy, personal part and keep the bug, use <UI>Delete attachments and recording</UI> on the report instead. The title, page and status stay.
          </p>
        </Note>

        <H2>Delete a project</H2>
        <Steps>
          <Step>
            Open the project, then <UI>Settings</UI>.
          </Step>
          <Step>
            Scroll to the bottom and select <UI>Delete project</UI>.
          </Step>
          <Step>Type the project's name to confirm.</Step>
        </Steps>
        <p>Its reports, destinations, ingest keys, rules and releases go with it. The report button on your site stops working, so remove the snippet too.</p>

        <H2>Delete the organisation</H2>
        <Steps>
          <Step>
            Select <UI>Settings → General</UI> — you must be an owner.
          </Step>
          <Step>
            Select <UI>Delete organisation</UI> and type its name.
          </Step>
        </Steps>
        <p>Every project, report, destination, connection, token and member goes. On the hosted service any subscription is cancelled with it. There is no undo and no recycle bin.</p>

        <H2>What deleting cannot reach</H2>
        <Note kind="important">
          <p>
            Issues already created in GitHub, messages already posted to Slack and requests already sent to your own webhook stay where they are. Issueit won't reach into another service to tidy up —
            it has no right to, and quietly editing your issue history would be worse than leaving it. If you're answering a data request, those copies are yours to deal with.
          </p>
        </Note>

        <H2>Hold less, automatically</H2>
        <Table
          head={["Setting", "Where", "Does"]}
          rows={[
            [<UI>Delete reports after</UI>, "Settings → General", "Deletes whole reports older than a number of days. Off by default."],
            ["Attachment and recording retention", "Set by your plan, or by the install", "Screenshots and recordings are deleted on a schedule while the report stays. Shown on the billing page."],
            ["What's captured", "The project's Widget tab", <>Record less to begin with. See "Stop the report form recording sensitive information".</>],
            ["What's delivered", "Each destination's Delivery settings", "Leave the reporter, your metadata or the recordings out of what's sent elsewhere."],
          ]}
        />

        <H2>Export before you delete</H2>
        <p>
          Reports can be read through the API and the command line, so taking a copy is a loop over one endpoint — see <Doc to="/automate/management-api">the management API</Doc>. A project's settings
          can be written to a file with <C>issueit pull</C>, which also makes recreating it later a single command.
        </p>
        <Code title="Terminal" code={`npx issueit pull           # the project's settings, as a file to commit`} />
      </>
    ),
  },


  {
    slug: "install-issueit-on-your-own-server",
    title: "Install Issueit on your own server",
    summary: "Docker Compose, four settings, and the two things people most often forget.",
    category: "selfhost",
    appliesTo: ["Issueit self-hosted"],
    id: "IT6001",
    updated: "31 October 2026",
    keywords: "self host docker compose install postgres setup server deploy backup upgrade",
    related: ["issueit-is-not-sending-any-email", "reports-are-not-reaching-your-issue-tracker"],
    body: () => (
      <>
        <p>Issueit runs as one container plus a PostgreSQL database. The self-hosted edition has every feature on, and the only limits are the ones you set.</p>

        <H2>Install it</H2>
        <Steps>
          <Step>
            Copy the example environment file: <C>cp .env.example .env</C>.
          </Step>
          <Step>Generate the three secrets and set the address people will use.</Step>
          <Step>
            Start it: <C>docker compose up -d --build</C>. Database migrations run on start, so there is no separate step.
          </Step>
          <Step>Open the address and sign up. The first account is an owner.</Step>
        </Steps>
        <Code
          title=".env"
          code={`APP_URL=https://issueit.example.com

# openssl rand -base64 32, one each
ENCRYPTION_KEY=…
SECRET_KEY=…
POSTGRES_PASSWORD=…`}
        />

        <H2>The two things people forget</H2>
        <H3>1. A mail server</H3>
        <p>
          Set <C>SMTP_URL</C> and <C>SMTP_FROM</C> <strong>before anybody else signs up</strong>. Without them there is no way to reset a forgotten password, and invitations have to be passed on by
          hand. See "Issueit is not sending any email".
        </p>

        <H3>2. Backups</H3>
        <Code title="Terminal" code={`./scripts/backup.sh                       # database, attachments and .env\n./scripts/restore.sh backups/<directory>  # put one back`} />
        <Code title="From cron" code={`15 3 * * *  cd /path/to/IssueIt && ./scripts/backup.sh >> backups/backup.log 2>&1`} />
        <Note kind="important">
          <p>
            Copy backups off the machine, and try a restore before you need one. <C>ENCRYPTION_KEY</C> matters most: it decrypts every stored integration credential, so a database restored without it
            leaves every connected account to be reconnected by hand.
          </p>
        </Note>

        <H2>Behind a reverse proxy</H2>
        <p>
          Set <C>TRUST_PROXY=true</C> so rate limits and the dashboard's map see the visitor's address rather than your proxy's. Also turn response buffering off for the app, because the live inbox
          holds a connection open.
        </p>

        <H2>Connecting GitHub, Slack and the rest</H2>
        <p>
          Every integration works with a token pasted from that service. To offer your team the nicer "sign in with…" option, register an OAuth app per service and set its client id and secret — the
          redirect address is <C>{"{APP_URL}/api/oauth/{service}/callback"}</C>. See <Doc to="/self-host/oauth">OAuth apps</Doc>.
        </p>

        <H2>Upgrading</H2>
        <Steps>
          <Step>Take a backup.</Step>
          <Step>
            <C>git pull && docker compose up -d --build</C>.
          </Step>
          <Step>
            Check <C>/health</C> answers, and that the queue is draining.
          </Step>
        </Steps>
        <Note>
          <p>
            Expect a few seconds of downtime while the container restarts. Reports sent during it fail at the browser and the person is asked to try again; nothing already accepted is lost.
          </p>
        </Note>

        <More title="If nothing is ever delivered">
          <p>
            One process has to be running the delivery worker. The default setting does both jobs, but if you've set <C>ROLE=api</C> everywhere, reports are collected and never delivered — and
            nothing complains loudly. See <Doc to="/self-host/operations">backups and operations</Doc>.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "issueit-is-not-sending-any-email",
    title: "Issueit is not sending any email",
    summary: "No password resets, no invitations, no alerts. On a self-hosted install this is almost always one missing setting.",
    category: "selfhost",
    appliesTo: ["Issueit self-hosted"],
    id: "IT6002",
    updated: "31 October 2026",
    keywords: "smtp email not sending mail server reset invitation digest alert failed queue",
    related: ["install-issueit-on-your-own-server", "reset-a-forgotten-password", "tell-people-when-their-bug-is-fixed"],
    body: () => (
      <>
        <p>
          <strong>Symptoms.</strong> Password resets never arrive, invitations have to be copied by hand, nobody gets report alerts or digests, and the notifications page says email isn't configured.
        </p>
        <p>
          <strong>Cause.</strong> The install has no mail server. Everything Issueit sends on its own behalf goes through <C>SMTP_URL</C>, and without it those messages are skipped and the server logs
          a warning on start.
        </p>

        <H2>Set a mail server</H2>
        <Steps>
          <Step>
            Add both settings to <C>.env</C>:
          </Step>
        </Steps>
        <Code
          title=".env"
          code={`# Over TLS on 465:
SMTP_URL=smtps://user:password@smtp.example.com:465
# Or STARTTLS on 587:
# SMTP_URL=smtp://user:password@smtp.example.com:587

SMTP_FROM=Issueit <no-reply@example.com>`}
        />
        <Steps>
          <Step>
            Restart: <C>docker compose up -d</C>.
          </Step>
          <Step>
            Select <UI>Settings → Notifications</UI> and use <UI>Send me a digest now</UI> to prove it works.
          </Step>
        </Steps>
        <Note>
          <p>
            Any SMTP provider works. If a password contains <C>@</C>, <C>:</C> or <C>/</C>, percent-encode it — otherwise the address is parsed wrongly and the connection fails with something
            unhelpful.
          </p>
        </Note>

        <H2>It's set, and still nothing</H2>
        <Table
          head={["Check", "How"]}
          rows={[
            ["The container has the settings", <><C>docker compose exec app printenv | grep SMTP</C></>],
            ["The server's own log", <><C>docker compose logs app | grep -i mail</C>. A rejected login or a blocked port shows up there.</>],
            ["The port isn't blocked", "Many hosting providers block outbound 25, and some block 465 and 587 until you ask. Try your provider's documented port."],
            ["The sender is allowed", <>Most providers refuse a <C>SMTP_FROM</C> on a domain you haven't verified with them.</>],
            ["Spam", "Set up SPF and DKIM for the sending domain, or the mail will arrive and be filed as junk — which looks the same from the inside."],
          ]}
        />

        <H2>Email that's queued, not lost</H2>
        <p>
          Issueit queues messages and retries them rather than sending inside the request, so fixing the settings sends what was waiting. The organisation's health endpoint counts email waiting and
          email failed in the last day, and <C>issueit health</C> prints both — see <Doc to="/automate/monitoring">health and metrics</Doc>.
        </p>

        <H2>Reporter email is separate</H2>
        <p>
          Email to the people who report bugs can go through one of your own connected email services instead of the install's mail server — Resend, Postmark, SendGrid, Mailgun and others. That means
          reporters can be emailed from your domain even while the install's own mail is unconfigured. See "Tell people when their bug is fixed".
        </p>
        <Note kind="important">
          <p>
            It does not work the other way round: password resets, confirmations and invitations only ever use <C>SMTP_URL</C>, because they belong to the install rather than to a project.
          </p>
        </Note>
      </>
    ),
  },
];
