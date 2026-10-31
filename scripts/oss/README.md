# Issueit

**Capture a bug. Deliver it to the developer. Get out of the way.**

Issueit collects bug reports from your product — an embeddable widget, a hosted form or a REST API — with the screenshot, the console errors, the network requests and the steps that led there, then delivers them to the tools your team already uses. It is not an issue tracker; it is the thing that fills one in properly.

This is the self-hosted edition: your server, your database, your rules. No plans, no limits but the ones you set, nothing phoning home.

## Run it

```sh
git clone https://github.com/issueit/issueit-selfhost.git issueit
cd issueit
cp .env.example .env          # fill ENCRYPTION_KEY, SECRET_KEY, POSTGRES_PASSWORD and APP_URL
docker compose up -d --build
```

Open `APP_URL`, create an account, create a project, paste the snippet into your site. Migrations run on start.

Generate the two secrets with `openssl rand -base64 32`. **Back up `ENCRYPTION_KEY` with your database**: it decrypts stored integration credentials, and without it every connected account must be reconnected by hand. `scripts/backup.sh` takes all three things that matter — database, attachments and `.env` — and `scripts/restore.sh` puts them back.

## What's here

- **Intake**: the widget, the hosted form at `/r/{project_id}`, and `POST /v1/{project_id}/reports` with idempotency keys, a dry-run mode and short-lived browser tokens.
- **Delivery**: a Postgres outbox — one row per destination, claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff over about ten hours, idempotent per report and event. A failed delivery never loses the report.
- **Destinations**: GitHub, GitLab, Linear, Jira, ClickUp, Trello, Notion, Slack, Discord, email through your own SMTP or service, push and alerting services, and your own webhook with an HMAC signature.
- **Duplicates**: a fingerprint per report, with your own grouping and redaction rules, previewed against real reports before they're saved.
- **Releases and source maps**: minified stacks read as your own files, mapped when the report is read so maps that land after a crash still help.
- **Agents and tooling**: account tokens with scopes, an audit log, an OpenAPI description, the `/mcp` endpoint, the `issueit` command line, and SDKs for Node and React.
- **Closing the loop**: when the issue Issueit opened is closed in your tracker, the report resolves and everyone who asked for updates is told.
- **The lot**: every feature is on. The hosted service's plans and billing have no meaning here, and the limits come from your `.env`.

## Documentation

`/docs` in your own install, and `/platform` for the precise reference: every endpoint, limit, header and error code.

## Licence

[AGPL-3.0](LICENSE). Run it, change it, run your changed version for your own company — and if you offer it to others as a service, publish your changes. The client libraries (`issueit`, `@issueit/mcp`, `@issueit/node`, `@issueit/react`) are MIT, so you can vendor those anywhere.

A hosted service with a larger integration catalogue, plans and support is at [issueit.app](https://issueit.app).
