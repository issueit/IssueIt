# @issueit/mcp

The [Issueit](https://issueit.app) MCP server. It gives a coding agent the bug reports your users sent — with the console errors, network requests and clicks the widget captured in the moments before they pressed send — so the agent can find the fault, fix it, and mark the report resolved.

Issueit collects bug reports and delivers them to more than 130 services. It is not an issue tracker, and this is not a tracker client: it is the short path from *a user hit this* to *here is the line that's wrong*.

## Add it

Create an account token in Issueit under **Settings › Account tokens**, then:

```sh
claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… -- npx -y @issueit/mcp
```

Or by hand, in any MCP client's configuration:

```json
{
  "mcpServers": {
    "issueit": {
      "command": "npx",
      "args": ["-y", "@issueit/mcp"],
      "env": { "ISSUEIT_TOKEN": "ak_live_…" }
    }
  }
}
```

| Variable | |
| --- | --- |
| `ISSUEIT_TOKEN` | Required. An account token, `ak_live_…`. Not a project secret key. |
| `ISSUEIT_URL` | Your own Issueit, if you host it. Defaults to the hosted service. |
| `ISSUEIT_INGEST_KEY` | Optional. A project secret key, needed only to file reports into a project that refuses anonymous ones. |

If you host Issueit yourself, it also speaks MCP over HTTP at `POST {your-issueit}/mcp` with the same token as a bearer header, so a client that supports remote servers needs nothing installed.

## What it can do

**Read and fix bugs** — `search_reports`, `get_report`, `update_report`, `resolve_report`, `group_reports`, `separate_report`, `create_report`

**Set a project up** — `setup_project`, `get_install_snippet`, `configure_widget`, `diagnose_install`

**Send reports somewhere** — `list_providers`, `list_connections`, `list_destinations`, `create_destination`, `update_destination`, `test_destination`

**Keep delivery honest** — `list_deliveries`, `retry_delivery`

**Decide what to work on** — `get_analytics`, `whoami`

It also offers prompts for the jobs people actually bring — `triage`, `fix_bug`, `set_up_bug_reporting`, `weekly_digest` — and resources, so you can attach one report (`issueit://report/{id}`) or the API reference to a conversation by hand.

## Scopes

A token carries only the scopes it was given, and never more than its owner's role allows. The suggested set for an agent can read reports, resolve them, and look at everything else without changing it. Anything the token lacks comes back as a plain refusal naming the scope, rather than a silent failure.

A token can never mint or revoke another token. That stays with a person signed in to the dashboard.

## Development

```sh
npm install
npm run dev          # run against ISSUEIT_URL with tsx
npm run typecheck
npm run build        # dist/index.js
```

The tools are declared in `src/tools.ts` as one table; `src/render.ts` turns Issueit's JSON into the Markdown the model reads. Both are shared with Issueit's own `/mcp` endpoint, so there is one definition of each tool rather than two.

MIT.
