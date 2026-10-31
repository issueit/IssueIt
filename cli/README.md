# issueit

The Issueit command line. Watch bugs arrive, forward webhooks to your laptop, upload source maps, and keep a project's settings in your repository.

```sh
npx issueit login       # a code you approve in the dashboard; nothing secret is typed here
npx issueit init        # creates the project, writes .issueit.json, prints the snippet
npx issueit tail        # watch the first report arrive
```

## Commands

| | |
| --- | --- |
| `login` / `logout` / `whoami` | Signing in. In CI, set `ISSUEIT_TOKEN` and skip it. |
| `init` | Create the project, detect the framework, print the snippet. |
| `ls` | List reports: `--status`, `--priority`, `--q`, `--since`, `--failing`. |
| `show <report>` | One report in full, with the console errors, requests and steps captured before it was sent. |
| `resolve <report>` | Mark a bug fixed. Also resolves its duplicates and emails whoever asked. |
| `file "<title>"` | File a bug from here. A description can be piped in: `git log -1 \| issueit file "…"`. |
| `open [report]` | Open it in a browser. |
| `tail` | Watch reports arrive, one line each. |
| `listen --forward <url>` | Forward reports to a URL on this machine, signed exactly as a real webhook. |
| `pull` / `push` | A project's settings as a file you can commit. `push --dry-run` shows the difference. |
| `sourcemaps upload <dir>` | Upload a build's maps so minified stacks read as your own files. |
| `deliveries` / `retry` | Why a report never arrived, and making it try again. |
| `health` | Queue depth and failures. Exits non-zero when delivery is behind. |
| `doctor` | What's wrong with this project, worst first. |

Most commands take `--project`. In a directory with `.issueit.json` — written by `init` — they don't need it.

## Building a webhook receiver

`listen` solves the awkward part of webhook development: you can't receive one on localhost.

```sh
issueit listen --forward http://localhost:3000/hooks --secret whsec_local
```

Every report is POSTed to your URL with an `issueit-signature` header built the same way the real thing is, so the verification code you write here is the code you ship.

## In CI

```sh
export ISSUEIT_TOKEN=ak_live_…
export ISSUEIT_URL=https://your-issueit      # only if you host it yourself

issueit sourcemaps upload dist --release "$GITHUB_SHA" --prefix assets
issueit push --prune                          # apply the settings in this repository
issueit health                                # fail the job if delivery is behind
```

## Environment

| | |
| --- | --- |
| `ISSUEIT_TOKEN` | An account token. Overrides the saved sign-in. |
| `ISSUEIT_URL` | Your Issueit, if you host it. |
| `ISSUEIT_INGEST_KEY` | A project secret key, for `file` into a project that refuses anonymous reports. |
| `ISSUEIT_CONFIG_HOME` | Where credentials are kept. Defaults to `~/.config/issueit`. |
| `NO_COLOR` | Turns colour off. It is off anyway when output is piped. |

MIT.
