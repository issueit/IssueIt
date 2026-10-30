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

## Develop

```sh
docker run -d --name issueit-devdb -e POSTGRES_USER=issueit -e POSTGRES_PASSWORD=issueit -e POSTGRES_DB=issueit -p 127.0.0.1:55432:5432 postgres:17-alpine
DATABASE_URL=postgres://issueit:issueit@127.0.0.1:55432/issueit PORT=8391 APP_URL=http://localhost:5174 npm run dev:server
npm run dev:web               # Vite on :5174, proxies the API to :8391
npm run build:widget          # dist/cdn/widget.js, served at /widget.js
npm run typecheck && npm test
npm run db:generate           # after changing server/db/schema.ts
```

## Layout

| Path | What lives there |
| --- | --- |
| `server/` | Hono API, one process: dashboard API (`api/`), ingestion (`ingest/`), delivery worker (`delivery/`) |
| `server/integrations/` | Provider framework: hand-written providers with OAuth in `providers/`, token-based services as short specs in `catalogue/` |
| `server/db/schema.ts` | Drizzle schema; migrations in `drizzle/` |
| `web/` | React dashboard. Design tokens in `web/src/styles/tokens.css`, shared components in `web/src/components/ui` |
| `widget/` | The embeddable widget, no dependencies; the hosted form at `/r/{project_id}` reuses it |

## How it works

- **Ingestion** (`POST /v1/{project_id}/reports`) validates, rate-limits, sniffs attachment types, stores the report, then queues deliveries in the same database. The project id is public; secret keys (`sk_live_…`) are for servers and are refused from browsers.
- **Delivery** is a Postgres outbox: one `deliveries` row per destination, claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff (8 attempts over about ten hours), idempotent per report, event and destination. A failed delivery never loses the report.
- **Delivery policy**: attempts, backoff (standard, exponential, linear, fixed), timeouts, which failures retry, send delay, rate limit, auto-pause and what each report carries are set as organisation defaults (Settings › Delivery defaults) and overridden per destination. See `server/delivery/policy.ts`.
- **Duplicates**: each report gets a fingerprint (normalised title and page, or the caller's own `fingerprint`). A match for an open report joins its group instead of being delivered again; trackers get a comment at a few group sizes. See `server/ingest/grouping.ts`.
- **Diagnostics**: the widget keeps recent console errors, requests and steps in memory and sends them with a report. Text is scrubbed in the widget and again on the server (`server/lib/scrub.ts`).
- **Closing the loop**: `server/delivery/sync.ts` polls GitHub, GitLab, Linear and Jira for issues Issueit opened. A closed issue resolves its report, and resolving emails everyone in the group who asked for updates.
- **Reporter emails**: an outbox like deliveries (`server/mail/outbox.ts`), sent through `SMTP_URL` or one of the organisation's email connections. Every email has a one-click stop link.
- **Location**: a report's country comes from a proxy's country header when `TRUST_PROXY` is set, otherwise from the reporter's time zone. No IP lookups. It feeds the dashboard's world map.
- **Dashboard** layout and chart options are saved per person per organisation (`memberships.preferences`); numbers come from one `/analytics` request.
- **Live updates** use Postgres `LISTEN/NOTIFY` and server-sent events, so the dashboard doesn't poll.
- **Domains**: set `DROP_URL`, `CDN_URL` and `DOCS_URL` to split hosting (drop./cdn./docs.issueit.app); by default everything is served from `APP_URL`.
- **OAuth**: each integration offers sign-in when its client id and secret are set (see `.env.example`), and a token or webhook-URL connection otherwise.

Full API, webhook and self-hosting documentation is at `/docs` in the running app.

## Design

The interface follows the Kern design criteria: greyscale, colour only for state, compact rows, sentence case, British English, Solar icons only (brand marks from Simple Icons).
