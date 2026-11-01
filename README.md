# Issueit

Capture a bug. Deliver it to the developer. Get out of the way.

Issueit collects bug reports from your product (an embeddable widget, a hosted form or a REST API) and delivers them to more than 130 services: issue trackers such as GitHub Issues, Linear, Jira and Asana, chat such as Slack, Teams and Discord, help desks, on-call tools, email, spreadsheets, automation platforms, cloud queues, or your own webhook. It is not an issue tracker.

## Run it

```sh
cp .env.example .env          # then fill ENCRYPTION_KEY, SECRET_KEY, POSTGRES_PASSWORD and APP_URL
docker compose up -d --build
```

Open `APP_URL` (on this server: http://192.168.0.62:8380), create an account, then create a project. Migrations run on start.

`ENCRYPTION_KEY` protects stored integration credentials and API keys. Back it up with the database; without it, connected accounts must be reconnected.

Set `SMTP_URL` and `SMTP_FROM` before anyone else signs up: password resets, address confirmations, invitations, report alerts and digests all go through it.

```sh
./scripts/backup.sh                       # database + attachments + .env, into ./backups, 30 days kept
./scripts/restore.sh backups/<directory>  # put one back
```

Nightly, from cron, as the user that owns the compose project:

```
15 3 * * *  cd /home/you/srv/IssueIt && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Copy them off the machine too. A backup on the same disk as the database is not a backup.

## Develop

```sh
docker run -d --name issueit-devdb -e POSTGRES_USER=issueit -e POSTGRES_PASSWORD=issueit -e POSTGRES_DB=issueit -p 127.0.0.1:55432:5432 postgres:17-alpine
DATABASE_URL=postgres://issueit:issueit@127.0.0.1:55432/issueit PORT=8391 APP_URL=http://localhost:5174 npm run dev:server
npm run dev:web               # Vite on :5174, proxies the API to :8391
npm run build:widget          # dist/cdn/widget.js, served at /widget.js
npm run build:mcp             # mcp/dist/index.js, the published @issueit/mcp
npm run build:cli             # cli/dist/index.js, the published issueit
npm run build:sdk             # sdk/node and sdk/react
npm run typecheck && npm test
npm run db:generate           # after changing server/db/schema.ts
```

## Layout

| Path | What lives there |
| --- | --- |
| `server/` | Hono API, one process: dashboard API (`api/`), ingestion (`ingest/`), delivery worker (`delivery/`) |
| `server/integrations/` | Provider framework: hand-written providers with OAuth in `providers/`, token-based services as short specs in `catalogue/` |
| `server/db/schema.ts` | Drizzle schema; migrations in `drizzle/` |
| `web/` | React dashboard, marketing site, documentation and support articles. Design tokens in `web/src/styles/tokens.css`, shared components in `web/src/components/ui` |
| `web/src/pages/docs/` | The documentation platform: `nav.ts` is the index, `content/` is the writing. Served at `/docs`, and at the root of `DOCS_URL`'s host when it has one |
| `web/src/pages/support/` | Support articles at `/articles/{locale}/{slug}`: task-shaped, with steps, for people rather than for clients |
| `web/src/hosted.tsx`, `server/hosted.ts` | The seam between the two editions: every page, route, footer column, settings entry, support article, API description and daily job that exists only because there is a business behind the hosted service |
| `scripts/llm/` | Renders those same pages to Markdown at build time: `llms.txt`, `llms-full.txt`, a `.md` per page and a JSON manifest, served from `dist/llm` |
| `widget/` | The embeddable widget, no dependencies; the hosted form at `/r/{project_id}` reuses it |
| `mcp/` | `@issueit/mcp`, the MCP server for coding agents. Its tools are shared with the app's own `/mcp` endpoint |
| `cli/` | `issueit`, the command line. Shares the API client and renderers with `mcp/` |
| `sdk/` | `@issueit/node` and `@issueit/react`, thin wrappers over the intake API |
| `server/billing/` | Plans, entitlements and Stripe. `entitlements.ts` is the only thing that knows whether this is the hosted service or somebody's own install |
| `server/jobs/` | The daily round: retention, digests, trials |
| `scripts/publish-oss.mjs` | Exports the self-hosted edition to its own repository |

## How it works

- **Ingestion** (`POST /v1/{project_id}/reports`) validates, rate-limits, sniffs attachment types, stores the report, then queues deliveries in the same database. The project id is public; secret keys (`sk_live_…`) are for servers and are refused from browsers.
- **Delivery** is a Postgres outbox: one `deliveries` row per destination, claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff (8 attempts over about ten hours), idempotent per report, event and destination. A failed delivery never loses the report.
- **Delivery policy**: attempts, backoff (standard, exponential, linear, fixed), timeouts, which failures retry, send delay, rate limit, auto-pause and what each report carries are set as organisation defaults (Settings › Delivery defaults) and overridden per destination. See `server/delivery/policy.ts`.
- **Duplicates**: each report gets a fingerprint (normalised title and page, or the caller's own `fingerprint`). A match for an open report joins its group instead of being delivered again; trackers get a comment at a few group sizes. See `server/ingest/grouping.ts`.
- **Diagnostics**: the widget keeps recent console errors, requests and steps in memory and sends them with a report. Text is scrubbed in the widget and again on the server (`server/lib/scrub.ts`).
- **Closing the loop**: `server/delivery/sync.ts` polls GitHub, GitLab, Linear and Jira for issues Issueit opened. A closed issue resolves its report, and resolving emails everyone in the group who asked for updates.
- **Reporter emails**: an outbox like deliveries (`server/mail/outbox.ts`), sent through `SMTP_URL` or one of the organisation's email connections. Every email has a one-click stop link.
- **Releases and source maps** (`server/lib/sourcemap.ts`, `server/api/releases.ts`): a report names its build; maps uploaded for that build turn minified frames back into files and lines when the report is read, not when it arrives, so maps that land after a crash still help. The decoder is written out rather than taken as a dependency.
- **Project rules** (`projects.rules`): patterns removed from a title before duplicates are compared, how much of the path counts, and redaction patterns of your own. Both are previewed against the project's last hundred reports before saving (`server/api/config.ts`).
- **Config as code**: `GET`/`POST /projects/:id/config` is a project as a document with no ids in it — destinations matched by name, connections by account — so one file applies to staging and production. `issueit pull` / `push`.
- **Intake extras**: `Idempotency-Key` makes a repeated submission file one report; `?dry_run=1` says what would happen and stores nothing; `POST /v1/{project}/token` mints a short-lived browser token (`it_…`) so a single-page app can report while the project stays closed.
- **Health**: `GET /api/orgs/current/health` answers "how old is the oldest thing still waiting", and `/metrics` serves the same install-wide in Prometheus format when `METRICS_TOKEN` is set.
- **Location**: a report's country comes from a proxy's country header when `TRUST_PROXY` is set, otherwise from the reporter's time zone. No IP lookups. It feeds the dashboard's world map.
- **Throwaway signups**: on a hosted install a disposable email domain is refused at signup, new organisations per address are capped daily, and the two things worth abusing — destinations, which post text of your choosing anywhere, and reporter email — wait until an owner has confirmed their address. Collecting reports never waits: the end user filing a bug did nothing wrong.
- **Dashboard** layout and chart options are saved per person per organisation (`memberships.preferences`); numbers come from one `/analytics` request.
- **Plans and limits**: `server/billing/plans.ts` is the one table the pricing page, the billing page, the limit checks and Stripe all read. `server/billing/entitlements.ts` decides what an organisation may do, and is the only place that knows the edition: `EDITION=selfhost` (the default) means every feature on and the operator's own env limits; `hosted` means per-organisation plans. Which endpoints a plan must include is one route table beside the scope rules it mirrors.
- **Billing**: Stripe over its REST API with `fetch`, no SDK. Checkout and the customer portal are the only ways money moves; the webhook's signature is verified before its body is read, and the webhook is the only thing that writes a plan.
- **Intake limits**: the monthly allowance accepts a tenth over before refusing with `plan_limit`, counts what it turned away in `usage_refusals`, and emails the owners once at 80% and once when it starts refusing. Fixed-window counters live in `rate_limits` in Postgres (`server/lib/ratelimit.ts`), so every API process counts into one window and a restart doesn't clear it; the counter falls back to process memory if the database can't be reached.
- **Spam and abuse** (`server/ingest/protection.ts`): a project id is public, so intake assumes strangers. A honeypot field and a project's block list are answered with a pretend `201` so a spammer learns nothing. What's left is scored — links, advertising language, volume from one address, the same text repeatedly, throwaway addresses — and a public submission at or above the project's threshold is stored but held back: no delivery, no email, not counted against the allowance, deleted after a week. "Not spam" delivers it as though it had just arrived. Reports sent with a secret key or a browser token are never scored, because the project's own server already vouched for them. On every plan.
- **The caller's address**: `clientIp` counts back from the right-hand end of `X-Forwarded-For` by `TRUST_PROXY_HOPS`, because anything further left was supplied by the caller — a per-address limit keyed on a header the caller controls is no limit. Stored as a keyed hash, never as an address, which is why blocking a reporter shows no address to read.
- **System email** (`server/mail/notices.ts`): an outbox beside the reporter one, holding the context rather than the rendered message, so fixing a template reaches everything still queued. Resets, confirmations, invitations, report alerts, paused destinations, digests, allowance warnings and payment problems.
- **Two-factor** (`server/auth/totp.ts`): RFC 6238 written out rather than taken as a dependency, checked against the RFC's own vectors. Setting it up proves a code works before it's turned on, and recovery codes are stored as hashes.
- **Retention** (`server/jobs/retention.ts`): attachments and captured diagnostics are deleted when the plan or the install says to; the report keeps its title, page and status. An organisation can also ask for reports to be deleted outright after a period.
- **Editions**: `scripts/publish-oss.mjs` copies an allowlist into the public self-hosted repository and refuses to guess — a new top-level directory has to be listed. Two things stay behind: the token-based integration catalogue, and the hosted business (Stripe, the pricing page, the company and legal pages, the billing articles, the trial sweep). The second group is registered in `web/src/hosted.tsx` and `server/hosted.ts` and nowhere else, so the export replaces those two files with copies that register nothing rather than patching the router, the footer and the settings rail. `--verify` installs, typechecks, tests and builds the result on its own.
- **Live updates** use Postgres `LISTEN/NOTIFY` and server-sent events, so the dashboard doesn't poll.
- **Domains**: set `DROP_URL`, `CDN_URL` and `DOCS_URL` to split hosting (drop./cdn./docs.issueit.app); by default everything is served from `APP_URL`.
- **OAuth**: each integration offers sign-in when its client id and secret are set (see `.env.example`), and a token or webhook-URL connection otherwise.
- **Account tokens** (`ak_live_…`, `server/auth/tokens.ts`) authenticate the management API for things with no browser. They are organisation-wide, carry scopes, can be fenced to some projects, and never exceed their owner's role, which is read fresh on every request. One table of rules decides what each endpoint costs; an endpoint no rule covers refuses every token, so a new route is closed until someone decides. Tokens can't mint tokens.
- **Audit**: every state-changing request, by a person or a token, is recorded in `audit_events` and shown under Settings › Audit log.
- **Agents**: `mcp/` is the MCP server: twenty-one tools, four prompts and a few resources over the same API. `POST /mcp` serves it over HTTP from the app itself, dispatching into the router rather than calling itself over the network.
- **API description**: `GET /openapi.json` is generated from Hono's own route table plus `server/api/openapi.ts`, with the scope each endpoint needs read from the code that enforces it. `server/api/openapi.test.ts` fails if a route is added without a line in it.
- **Writing**: two sets of pages, on purpose. The documentation (`web/src/pages/docs/`) is for somebody building against Issueit: 44 pages behind a sidebar, a contents list read back out of each rendered page, and a search index that is the nav itself, so a page not listed in `nav.ts` doesn't exist. The support articles (`web/src/pages/support/`) are for somebody trying to get something done: one job each, numbered steps, what it applies to and when it was last checked. Anchors from the old single-page docs and from the old `/platform` reference are mapped to their new pages in `nav.ts`.

- **Machines**: the same pages are published as Markdown. `npm run build:llms` walks the React element tree of every documentation page and support article (`scripts/llm/markdown.ts` knows both kits by identity) and writes `dist/llm`: `llms.txt`, `llms-full.txt`, a file per page and `index.json`. Addresses are left as `__DOCS_URL__`-style tokens and filled in by `server/api/llm.ts` as a file is served, so a self-hosted install's samples are its own. `/llms.txt`, `/llms-full.txt`, `/llm/index.json` and any page with `.md` on the end; `/llm` is the page about it, and `scripts/llm/build.test.ts` fails if a page renders to nothing.

Documentation is at `/docs` in the running app — or at the root of `DOCS_URL` when that is its own subdomain, which the client detects from the hostname rather than from a setting. Support articles are at `/articles/en`, `/platform` describes the product, and the management API is described at `/openapi.json`. `GET /api/urls` tells a page which addresses this install serves intake, the CDN and the documentation from, so copyable examples are right on a split install and on a single-origin one.

## Agents

Create an account token under Settings › Account tokens, then:

```sh
claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… --env ISSUEIT_URL=https://your-issueit -- npx -y @issueit/mcp
```

An agent can then read a report with the console errors, requests and clicks captured just before it was sent, fix the bug, and resolve the report. See `mcp/README.md`.

## Command line

```sh
npx issueit login             # a code you approve in the dashboard
npx issueit init              # create the project, write .issueit.json, print the snippet
npx issueit tail              # watch reports arrive
npx issueit listen --forward http://localhost:3000/hooks
```

`issueit pull` and `issueit push` keep a project's settings in the repository; `issueit sourcemaps upload` makes minified stacks readable. See `cli/README.md`.

## Design

The interface follows the Kern design criteria: greyscale, colour only for state, compact rows, sentence case, British English, Solar icons only (brand marks from Simple Icons).

## Editions and licence

This repository is the private source of the hosted service, and is not licensed for redistribution (`LICENSE`).

```sh
node scripts/publish-oss.mjs --out ../issueit-selfhost --verify
```

That exports the **self-hosted edition** — everything but the token-based integration catalogue — into its own directory under AGPL-3.0, ready to commit and push. Plans and billing travel with it and sit inert, because `EDITION` defaults to `selfhost`: every feature on, limits from the operator's own `.env`. The client libraries (`issueit`, `@issueit/mcp`, `@issueit/node`, `@issueit/react`) stay MIT so they can be vendored anywhere.
