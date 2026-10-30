import type { ReactNode } from "react";
import { Link } from "react-router";
import { C, Code, Note } from "../prose";

/**
 * Blog posts. Each is written from work that's in the codebase, with the
 * real numbers. Newest first.
 */

export type Post = { slug: string; title: string; summary: string; date: string; tag: string; minutes: number; body: () => ReactNode };

export const posts: Post[] = [
  {
    slug: "drawing-the-background-for-less",
    title: "5,600 characters a frame, and then 130",
    summary: "The animated field of dots and slashes behind this site was quietly eating most of a CPU core. Here's how we found it, and the three changes that fixed it.",
    date: "30 October 2026",
    tag: "Performance",
    minutes: 6,
    body: () => (
      <>
        <p>
          Behind this site is a field of monospace characters that drifts like wind over water. It looked right. It also made the page feel heavy, and on slower machines scrolling stuttered. The first
          rule of fixing that is not to guess, so we measured.
        </p>
        <h2>Measure first</h2>
        <p>
          We drove the page in a headless browser at 1440 by 900 and twice the pixel density, sampled frame times, and read the browser's own counters for script, style and layout time. Then we ran
          the same thing with each suspect switched off in turn: the background, the integration wall's animation, the frosted header.
        </p>
        <p>
          With everything on, the main thread was busy for about 900 ms of every second while the page sat still. Scrolling ran at 28 frames a second. Hiding the background saved about 350 ms a
          second. Stopping the wall's animation cut style recalculation from 215 ms a second to 11.
        </p>
        <h2>Only draw what changed</h2>
        <p>
          The background is a canvas of about 5,600 cells. Every frame, every cell worked out its character and was drawn again, 30 times a second, at double resolution. But the motion is slow: from
          one frame to the next, almost every cell shows the same character in the same shade.
        </p>
        <p>So each cell now remembers what it last drew as a single byte, and is only cleared and redrawn when that byte changes. On an idle page that's about 130 cells a frame instead of 5,600.</p>
        <Code
          what="the core of it"
          code={`const code = glyph * SHADES + shade + 1; // 0 means empty
if (code === drawn[i]) continue;
drawn[i] = code;
ctx.clearRect(x, y, CELL_W, CELL_H);
if (code) ctx.drawImage(atlas, /* source cell */, x, y, CELL_W, CELL_H);`}
        />
        <h2>One sine per cell</h2>
        <p>
          Each cell's flow was a sum of four sine waves over its column and row. Most of those phases are a column part plus a row part, so the identity sin(a + b) = sin a cos b + cos a sin b lets us
          do the trigonometry once per column and once per row, and combine with multiplications. The quiet zone behind the headline is a Gaussian, which also splits into a column factor times a row
          factor. Each cell is down to one real sine.
        </p>
        <h2>Let the compositor scroll</h2>
        <p>
          The field scrolls at a third of the page's speed. Previously every pixel of scroll moved every cell, which forced a full redraw. Now the canvas moves by a CSS transform for anything less
          than a row, which the graphics hardware handles without a redraw. When a whole row passes, the existing picture is shifted by a row with one copy of the canvas onto itself, and only the
          cells that differ are drawn.
        </p>
        <p>As a side effect, the background now keeps step with the page on every display frame, where before it caught up 30 times a second and juddered slightly.</p>
        <h2>The other two</h2>
        <p>
          The integration wall animated the colour and border of 134 tiles forever, even off-screen. Colour can't be animated by the compositor, so every tile was restyled and repainted every frame.
          The wave is now a ring that only changes opacity, and it pauses when the wall isn't on screen. The hero's spotlight repainted a gradient the size of the whole hero on every mouse move; it's
          now a fixed-size glow moved by a transform.
        </p>
        <h2>Result</h2>
        <p>
          Main-thread work at the top of the page fell from 898 ms a second to 346. At the wall, from 28 to 59 frames a second. Scrolling went from 28 to the mid 40s, measured in a browser with no
          graphics card, where every pixel is drawn by the processor.
        </p>
        <Note>The rule we took away: animate opacity and transform, draw only what changed, and keep a profile next to every claim that something got faster.</Note>
      </>
    ),
  },
  {
    slug: "from-ten-integrations-to-134",
    title: "From ten integrations to 134",
    summary: "How a short, declarative spec per service let us add 124 destinations without 124 bespoke modules, and what we did to keep them honest.",
    date: "30 October 2026",
    tag: "Engineering",
    minutes: 7,
    body: () => (
      <>
        <p>
          Issueit started with ten destinations, each a hand-written provider with its own sign-in flow: GitHub, Linear, Jira, Slack and friends. Teams kept asking for the one they use, and the list
          of "the one they use" is long. Help desks, on-call tools, chat apps, spreadsheets, cloud queues.
        </p>
        <h2>A spec, not a module</h2>
        <p>
          Most services need the same handful of things: a few credentials, perhaps where to put the report, a request to check the connection and a request to deliver. So a new integration is now a
          short spec passed to <C>define()</C>, which turns it into a full provider the dashboard and delivery worker treat exactly like the originals.
        </p>
        <Code
          what="a spec"
          code={`{
  id: "shortcut",
  name: "Shortcut",
  category: "tracker",
  summary: "Creates a bug story in Shortcut for each new report.",
  fields: [secret("token", "API token", "In Shortcut, open Settings, then API Tokens.")],
  target: { label: "Workflow state", fields: [optional(text("state", "Workflow state ID"))] },
  async check(creds) {
    const { data } = await call("Shortcut", "https://api.app.shortcut.com/api/v3/member", { headers: { "shortcut-token": creds.token } });
    return { label: data.profile?.name ?? "Shortcut member" };
  },
  async send({ report, creds, target, isTest }) {
    // POST /api/v3/stories with story_type "bug", then return its id and link
  },
}`}
        />
        <p>Target fields such as "which project" or "which channel" belong to the destination, not the connection, so one connected account can feed many destinations without connecting again.</p>
        <h2>Every request through one door</h2>
        <p>
          Many of these hosts are typed in by users: your Jira Data Center, your Mattermost, your n8n. Any of them could point at an internal address. So every catalogue request goes through a single
          helper that forces the guarded client: the hostname is resolved once, private ranges are refused, the connection is pinned to the address that was checked, and redirects aren't followed.
          There's no way for a spec to forget.
        </p>
        <h2>Signing three clouds</h2>
        <p>
          Amazon SNS, SQS, EventBridge and SES need AWS Signature Version 4. We wrote it as a pure function and checked it against AWS's own published example, byte for byte, in a test. Google Pub/Sub
          and Sheets use a service account's private key to sign a short-lived token. Azure Service Bus uses a shared-access signature. None of these pulled in an SDK.
        </p>
        <h2>Keeping them honest</h2>
        <p>
          A test sends a report through all 124 with the network replaced by a stand-in that answers anything. It checks that every request is https, goes through the guarded client, contains no{" "}
          <C>undefined</C> or <C>[object Object]</C>, and ends in a write. It can't prove a service accepts the request; only the service can. That's why every destination has a{" "}
          <strong>Send test</strong> button, and why a failure shows the service's own error message rather than ours.
        </p>
        <h2>Real logos only</h2>
        <p>
          59 of the new services show their own brand mark from Simple Icons. The rest show a plain icon for their kind. We'd rather show an honest checklist icon than a lookalike of somebody's logo.
        </p>
        <p>
          The full list is on the <Link to="/#destinations">home page</Link> and in the <Link to="/platform#catalogue">catalogue endpoint</Link>, both read from the same place as the dashboard.
        </p>
      </>
    ),
  },
  {
    slug: "the-blur-that-turned-safari-black",
    title: "The blur that turned Safari black",
    summary: "A soft-focus entrance animation crashed WebKit's renderer and left a black page on every iPhone. A short post about a long afternoon.",
    date: "30 October 2026",
    tag: "Debugging",
    minutes: 4,
    body: () => (
      <>
        <p>
          The first version of this site had a lovely entrance: headings rose into place while coming out of a soft blur. In Chrome and Firefox it looked right. Then came the report: "screen's just
          black when loaded up".
        </p>
        <h2>Reproduce it</h2>
        <p>
          Every browser on iOS uses WebKit underneath, so "it works in Chrome" means nothing on an iPhone. Running the page in WebKit through Playwright reproduced it at once: after a moment, the
          whole page went black. No error in the console, nothing in the network panel. The renderer had simply given up.
        </p>
        <h2>Bisect it</h2>
        <p>
          We switched animations off one at a time. The page survived with everything off, and died again as soon as the blurred entrances came back: elements animating a CSS <C>filter: blur()</C>.
        </p>
        <h2>The fix, and the rule</h2>
        <p>
          Every entrance now uses only <C>opacity</C> and <C>transform</C>, the two properties browsers can animate on the graphics hardware without repainting. It looks almost the same. The
          stylesheet carries a comment where the next person would reach for a blur, and every visual change is now checked in Chromium, Firefox and WebKit, including a long soak in WebKit, before it
          ships.
        </p>
        <Note>Animated filters are expensive everywhere and fatal somewhere. If it moves, give it opacity and transform, and nothing else.</Note>
      </>
    ),
  },
  {
    slug: "stored-first-delivered-second",
    title: "Stored first, delivered second",
    summary: "Why Issueit never delivers a report in the request that created it, and how a single PostgreSQL table gives us retries, idempotency and recovery without another queue.",
    date: "30 October 2026",
    tag: "Architecture",
    minutes: 6,
    body: () => (
      <>
        <p>
          The obvious way to build a bug reporter is to receive the report and immediately create the GitHub issue. It works in a demo. Then GitHub has a bad afternoon, or a token expires on a Sunday,
          and the report is gone, along with the user's goodwill.
        </p>
        <h2>Two steps, always</h2>
        <p>
          Ingestion does one job: validate the report, store it with its attachments, and answer <C>201</C>. Then it queues one delivery per destination that should receive it. Nothing the
          destinations do can make the reporter's request fail, or make it slow.
        </p>
        <h2>The queue is a table</h2>
        <p>
          Deliveries are rows in PostgreSQL. Workers claim a batch with <C>FOR UPDATE SKIP LOCKED</C>, which lets several workers share the table without ever taking the same row, and hold a lock for
          up to two minutes. If a worker dies mid-delivery, the lock lapses and another picks it up. There's no second system to run, back up or keep consistent with the first.
        </p>
        <Code
          what="claiming work"
          code={`update deliveries set status = 'delivering', attempts = attempts + 1,
  locked_until = now() + make_interval(secs => 120), updated_at = now()
where id in (
  select id from deliveries
  where (status in ('pending', 'retrying') and next_attempt_at <= now())
     or (status = 'delivering' and locked_until < now())
  order by next_attempt_at
  for update skip locked
  limit 10
)
returning id;`}
        />
        <h2>Patient retries</h2>
        <p>
          A failed attempt waits 30 seconds, then 2 minutes, 10, 30, an hour, 3 hours and 6: eight attempts across about ten hours, long enough to ride out most outages. Errors that waiting can't fix,
          such as a deleted repository or a revoked token, stop at once with a message that says what to do.
        </p>
        <h2>Exactly one issue</h2>
        <p>
          Every delivery has an idempotency key made of the report, the event and the destination, enforced by a unique index. Queueing the same thing twice inserts nothing. Webhook receivers get the
          delivery's id in <C>Issueit-Delivery</C> on every attempt, so they can drop a duplicate if a response was lost on the way back.
        </p>
        <h2>Live, without polling</h2>
        <p>
          When a delivery changes, the worker sends a PostgreSQL <C>NOTIFY</C>. The server turns it into a server-sent event, and the dashboard updates the report's delivery list as it happens. The
          same database again; no extra moving parts.
        </p>
        <p>
          The full contract, including every header and limit, is in the <Link to="/platform#delivery">platform reference</Link>.
        </p>
      </>
    ),
  },
];
