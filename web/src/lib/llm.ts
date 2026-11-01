/**
 * The machine-readable half of the site, in one list.
 *
 * Everything Issueit publishes for something that isn't a person reading a
 * browser: the llms.txt index, the Markdown behind every documentation page,
 * and the endpoints that answer with JSON. The /llm page shows this list to
 * whoever asks, and the build writes the same list into llms.txt and
 * /llm/index.json, so the three can't drift apart.
 *
 * Addresses are built from the install's own URLs rather than written down,
 * because a self-hosted install serves all of this from one origin and the
 * hosted service spreads it across four.
 */

/** The addresses this install serves each thing from, as /api/urls reports them. */
export type LlmUrls = { app: string; docs: string; marketing: string; drop: string; cdn: string };

/** One line, for the top of llms.txt and anywhere else a model asks what this is. */
export const LLM_SUMMARY =
  "Issueit collects bug reports from a product — with the console errors, network requests and clicks from the moments before someone pressed send — and delivers them to the issue tracker, chat, help desk or webhook the team already uses.";

export const LLM_DETAIL =
  "It is not an issue tracker. Reports are stored before anything is sent, and a failed delivery is retried for about ten hours, so a tracker being down is a delay rather than a lost bug. Everything the dashboard does is in a public API, an MCP server and a command line, and the whole thing runs on one container and a PostgreSQL database if you'd rather host it yourself.";

export type LlmResource = {
  id: string;
  title: string;
  /** What is in it, and when it's the right one to fetch. */
  what: string;
  media: string;
  url: (urls: LlmUrls) => string;
  /** Takes a POST rather than answering a browser, so the address isn't a link. */
  post?: true;
  /** Shown on the page as the thing to copy, where the address isn't the whole story. */
  example?: (urls: LlmUrls) => string;
};

/** The documentation, written out for machines. */
export const LLM_FILES: LlmResource[] = [
  {
    id: "index",
    title: "llms.txt",
    what: "The index: every documentation page and support article, each with a line saying what it covers and where its Markdown is. Start here.",
    media: "text/plain",
    url: (u) => `${u.marketing}/llms.txt`,
  },
  {
    id: "full",
    title: "llms-full.txt",
    what: "The whole corpus in one file — all documentation pages and all support articles, in reading order, as Markdown. For filling a context window in one request.",
    media: "text/plain",
    url: (u) => `${u.marketing}/llms-full.txt`,
  },
  {
    id: "page",
    title: "Any page, as Markdown",
    what: "Add .md to the address of a documentation page or a support article and you get the same prose as Markdown: tables, code samples and all.",
    media: "text/markdown",
    url: (u) => `${u.docs}/quickstart.md`,
    example: (u) => `${u.docs}/collect/intake-api.md\n${u.app}/articles/en/add-the-bug-report-button-to-your-website.md`,
  },
  {
    id: "manifest",
    title: "/llm/index.json",
    what: "The same index as JSON: every page and article with its title, summary, HTML address and Markdown address, plus every endpoint on this list.",
    media: "application/json",
    url: (u) => `${u.marketing}/llm/index.json`,
  },
];

/** The product itself, for an agent that wants to do something rather than read. */
export const LLM_ENDPOINTS: LlmResource[] = [
  {
    id: "mcp",
    title: "MCP server",
    what: "Tools for reading a report with its diagnostics, fixing it, resolving it, and setting a project up. Over HTTP here, or locally with npx -y @issueit/mcp.",
    media: "application/json",
    post: true,
    url: (u) => `${u.app}/mcp`,
    example: (u) => `POST ${u.app}/mcp\nAuthorization: Bearer ak_live_…`,
  },
  {
    id: "openapi",
    title: "openapi.json",
    what: "Every management API endpoint, described from the router itself rather than kept by hand, so it matches what the server actually accepts.",
    media: "application/json",
    url: (u) => `${u.app}/openapi.json`,
  },
  {
    id: "intake",
    title: "Intake API",
    what: "One POST files a bug report, from a server, a mobile app, a failing test or a CI job. The project id is public; no account is needed to send one.",
    media: "application/json",
    post: true,
    url: (u) => `${u.drop}/v1/{project}/reports`,
    example: (u) => `POST ${u.drop}/v1/prj_abc123/reports`,
  },
  {
    id: "catalogue",
    title: "/api/catalogue",
    what: "Every destination Issueit can deliver to, with its category and a line on what it creates. Public, and the list the documentation itself reads.",
    media: "application/json",
    url: (u) => `${u.app}/api/catalogue`,
  },
  {
    id: "plans",
    title: "/api/plans",
    what: "The plans, their prices and their limits, as the pricing page reads them.",
    media: "application/json",
    url: (u) => `${u.app}/api/plans`,
  },
  {
    id: "urls",
    title: "/api/urls",
    what: "Which address this install serves intake, the widget, the dashboard and the documentation from. Ask here before writing a sample that someone will run.",
    media: "application/json",
    url: (u) => `${u.app}/api/urls`,
  },
  {
    id: "health",
    title: "/health",
    what: "Whether this install is up, with no authentication.",
    media: "application/json",
    url: (u) => `${u.app}/health`,
  },
];

export const LLM_RESOURCES = [...LLM_FILES, ...LLM_ENDPOINTS];
