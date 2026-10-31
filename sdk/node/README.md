# @issueit/node

Send bug reports to [Issueit](https://issueit.app) from a Node server, with the fingerprints and releases set properly so a thousand of one fault become one bug.

```sh
npm install @issueit/node
```

```ts
import { Issueit } from "@issueit/node";

const issueit = new Issueit({
  project: "prj_abc123",
  key: process.env.ISSUEIT_SECRET_KEY,   // keep this on the server
  release: process.env.GIT_SHA,
});

app.use(issueit.express());              // after your routes
```

Two promises, because an error reporter that breaks the thing it watches is worse than no reporter:

- **It never throws into your code.** A failure to report is logged, not raised.
- **It never blocks a response.** Middleware reports in the background; `await issueit.flush()` before exiting.

## Frameworks

```ts
app.use(issueit.express());                  // Express, Connect
app.onError(issueit.hono());                 // Hono — re-throws, so your handler still runs
fastify.setErrorHandler(issueit.fastify());  // Fastify
issueit.catchAll();                          // uncaught exceptions and rejections
```

## Reporting by hand

```ts
await issueit.captureError(err, { metadata: { orderId } });

await issueit.report({
  title: "Nightly reconciliation found a mismatch",
  description: `${missing.length} rows didn't match`,
  priority: "high",
  fingerprint: "nightly-reconciliation-mismatch",
});
```

`captureError` builds the fingerprint from the error's name and the first frame of your own code — without line numbers, so the same fault doesn't become a new bug because someone added an import above it.

## Options

| | |
| --- | --- |
| `project` | Required. The project id. |
| `key` | A project secret key. Without one, the project must accept anonymous reports. |
| `url` | Your Issueit, if you host it. Defaults to `ISSUEIT_URL`, then the hosted service. |
| `release` | The build, so stacks can be mapped back. Defaults to `ISSUEIT_RELEASE`. |
| `environment` | Defaults to `NODE_ENV`. |
| `beforeSend` | Change a report, or return `null` to drop it. |
| `onError` | Called when a report can't be sent. Defaults to `console.warn`. |

MIT.
