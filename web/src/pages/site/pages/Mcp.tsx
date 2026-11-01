import { useState, type ComponentType, type CSSProperties } from "react";
import { Link } from "react-router";
import { siClaudecode, siCursor, siGithubcopilot } from "simple-icons";
import {
  BugMinimalisticIcon,
  CheckCircleIcon,
  Code2Icon,
  GlobalIcon,
  KeyMinimalistic2Icon,
  MagicWandIcon,
  PlugCircleIcon,
  Routing2Icon,
  ServerIcon,
  Tuning2Icon,
  WidgetIcon,
} from "../../../components/ui/icons";
import { CopyButton, copyText } from "../../../components/ui/Copy";
import { DocsLink } from "../../../lib/docs-link";
import { useUrls } from "../../../lib/urls";
import { PageHead, SitePage } from "../chrome";

/**
 * The MCP page: what a coding agent can do with the bug reports Issueit
 * collected, and the one line that gives it access. The contract itself —
 * every argument, every scope — stays in the developer documentation; this
 * page is here to show that reading a user's bug and fixing it is one
 * conversation.
 */

type Mark = { path: string; title: string };

/** A client's own mark where Simple Icons has one, a plain glyph where it doesn't. */
function ClientMark({ mark, icon: Icon, size = 15 }: { mark?: Mark; icon?: ComponentType<{ size?: number }>; size?: number }) {
  if (mark)
    return (
      <svg role="img" aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d={mark.path} />
      </svg>
    );
  return Icon ? <Icon size={size} /> : null;
}

const SERVER_JSON = `{
  "mcpServers": {
    "issueit": {
      "command": "npx",
      "args": ["-y", "@issueit/mcp"],
      "env": { "ISSUEIT_TOKEN": "ak_live_…" }
    }
  }
}`;

function clients(app: string) {
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      mark: siClaudecode,
      file: "terminal",
      code: `claude mcp add issueit --env ISSUEIT_TOKEN=ak_live_… -- npx -y @issueit/mcp`,
    },
    {
      id: "codex",
      label: "Codex",
      icon: Code2Icon,
      file: "~/.codex/config.toml",
      code: `[mcp_servers.issueit]
command = "npx"
args = ["-y", "@issueit/mcp"]
env = { ISSUEIT_TOKEN = "ak_live_…" }`,
    },
    { id: "cursor", label: "Cursor", mark: siCursor, file: ".cursor/mcp.json", code: SERVER_JSON },
    {
      id: "vscode",
      label: "VS Code",
      mark: siGithubcopilot,
      file: ".vscode/mcp.json",
      code: `{
  "servers": {
    "issueit": {
      "command": "npx",
      "args": ["-y", "@issueit/mcp"],
      "env": { "ISSUEIT_TOKEN": "ak_live_…" }
    }
  }
}`,
    },
    { id: "any", label: "Any client", icon: PlugCircleIcon, file: "mcp.json", code: SERVER_JSON },
    {
      id: "remote",
      label: "Nothing installed",
      icon: GlobalIcon,
      file: "a client that connects to a remote server",
      code: `POST ${app}/mcp
Authorization: Bearer ak_live_…`,
    },
  ];
}

/** Pick a client, get the exact thing to paste. */
function Install() {
  const app = useUrls().app;
  const tabs = clients(app);
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  return (
    <div className="mcp-install" data-rv>
      <div className="mcp-clients" role="tablist" aria-label="MCP clients">
        {tabs.map((t, i) => (
          <button key={t.id} type="button" role="tab" aria-selected={i === active} className="mcp-client" onClick={() => setActive(i)}>
            <ClientMark mark={t.mark} icon={t.icon} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="mcp-code" role="tabpanel" aria-label={tab.label}>
        <div className="mcp-code-head">
          <span className="mono">{tab.file}</span>
          <CopyButton text={tab.code} what={`${tab.label} configuration`} />
        </div>
        <pre className="mono">{tab.code}</pre>
      </div>
    </div>
  );
}

const WAYS = [
  {
    icon: ServerIcon,
    title: "Local, over stdio",
    text: (
      <>
        <code>npx -y @issueit/mcp</code> with an account token in the environment. Nothing to deploy, nothing kept between calls — the token decides what it can see.
      </>
    ),
  },
  {
    icon: GlobalIcon,
    title: "Remote, over HTTP",
    text: (
      <>
        <code>POST /mcp</code> on your install serves the identical tools from the app itself. A client that speaks remote MCP needs no install at all.
      </>
    ),
  },
];

const PROMPTS = [
  "Read the newest critical report in Acme and fix it.",
  "What came in this week, and which of it is one bug reported forty times?",
  "Fix #118, then resolve it with a note saying what changed.",
  "Set up bug reporting for this app and put the widget in.",
  "Check my widget install and tell me what's wrong with it.",
  "Which destinations are failing, and retry everything stuck in the outbox.",
  "Send this project's critical production reports to PagerDuty.",
  "Group the reports about the broken export under one issue.",
  "Summarise the last seven days of bugs for standup.",
];

const TOOLS = [
  {
    icon: BugMinimalisticIcon,
    title: "Read and fix bugs",
    text: "The whole report as Markdown — what they said, the console errors with mapped stacks, the failed requests, the clicks before it — then the status change when it's fixed.",
    names: ["search_reports", "get_report", "update_report", "resolve_report", "create_report"],
  },
  {
    icon: MagicWandIcon,
    title: "Duplicates",
    text: "Issueit groups the obvious ones itself. These are for the two descriptions of one bug that don't look alike, and for undoing a merge that was wrong.",
    names: ["group_reports", "separate_report"],
  },
  {
    icon: WidgetIcon,
    title: "Set a project up",
    text: "An agent that is already in your codebase can create the project, write the snippet into the right file for your framework, and then prove reports arrive.",
    names: ["setup_project", "get_install_snippet", "configure_widget", "diagnose_install"],
  },
  {
    icon: Routing2Icon,
    title: "Send reports somewhere",
    text: "Find a service among 130-odd, see what the organisation has already connected, and point a project's reports at it with a routing rule.",
    names: ["list_providers", "list_connections", "list_destinations", "create_destination", "update_destination", "test_destination"],
  },
  {
    icon: Tuning2Icon,
    title: "Try before you change",
    text: "A dry run says which destinations a report would reach and why. A project's settings come out as a document with no ids in it, to review and apply elsewhere.",
    names: ["preview_report", "export_project_config", "apply_project_config"],
  },
  {
    icon: CheckCircleIcon,
    title: "Keep delivery honest",
    text: "What failed, what it said, what is still waiting in the outbox — and the retry, without opening the dashboard. Analytics for deciding what to work on at all.",
    names: ["list_deliveries", "retry_delivery", "get_health", "get_analytics", "whoami"],
  },
];

const EXTRAS = [
  { kind: "Prompt", name: "triage", text: "Read the open reports, group the duplicates, set honest priorities, and say what to fix first." },
  { kind: "Prompt", name: "fix_bug", text: "Read one report's evidence, reproduce it, fix it in this codebase, and mark it resolved." },
  { kind: "Prompt", name: "set_up_bug_reporting", text: "Create a project, put the widget in, send the reports somewhere, and prove it works." },
  { kind: "Prompt", name: "weekly_digest", text: "What came in, what it means, and what is quietly broken in the delivery pipeline." },
  { kind: "Resource", name: "issueit://report/{id}", text: "One report, attached to a conversation by hand rather than searched for." },
  { kind: "Resource", name: "issueit://docs/api", text: "The API reference, for when the agent wants an endpoint no tool covers." },
];

const TRUST = [
  ["Scopes, not trust", "A token carries only the scopes it was given, and never more than its owner's role allows. The suggested set for an agent reads reports, resolves them, and looks at the rest without changing it."],
  ["A refusal, not a silence", "Anything the token lacks comes back as plain text naming the missing scope, so the model can say what it needs instead of guessing around a failure."],
  ["It can't mint its own keys", "No tool creates or revokes a token. That stays with a person signed in to the dashboard, whatever the agent decides it would like."],
  ["Everything is in the log", "Every state-changing call is in the audit log with the token that made it, so a tool-calling loop is as reviewable as a person clicking."],
  ["No new surface", "The server is a client of the management API like anything else. Turning it on doesn't open a door that an account token couldn't already walk through."],
  ["Yours, if you host it", "Point ISSUEIT_URL at your own install and the agent's work never leaves it — same tools, same tokens, no third party in the middle."],
] as const;

/** An excerpt of what `get_report` actually returns, in the shape it returns it. */
function AgentView() {
  return (
    <div className="mcp-out" data-rv style={{ "--d": "80ms" } as CSSProperties}>
      <div className="mcp-out-head">
        <span className="mono">get_report</span>
        <span className="mono tk-p">report: "118"</span>
      </div>
      <pre className="mono">
        <span className="tk-k"># #118 Export times out on large accounts</span>
        {"\n"}
        <span className="tk-p">**open** · critical priority · project Acme · reported 11 minutes ago via widget · environment production · release 4.21.0</span>
        {"\n\n"}
        <span className="tk-k">**Where:** </span>
        <span className="tk-s">Chrome 141 · macOS 15 · viewport 1512×982</span>
        {"\n"}
        <span className="tk-k">**Page:** </span>
        <span className="tk-s">https://acme.example/settings/exports</span>
        {"\n\n"}
        <span className="tk-k">## What they said</span>
        {"\n\n"}
        <span className="tk-s">I pressed Export and after a minute the page just went blank.</span>
        {"\n\n"}
        <span className="tk-k">## Console, in the moments before it was sent</span>
        {"\n"}
        <span className="tk-s">- **error** 14:03:12: TypeError: Cannot read properties of undefined (reading 'rows')</span>
        {"\n"}
        <span className="tk-a">{"    at submitExport (src/settings/export.ts:41:18)"}</span>
        {"\n"}
        <span className="tk-a">{"    at onClick (src/components/ExportButton.tsx:22:7)"}</span>
        {"\n"}
        <span className="tk-p">{"    (mapped from the built file through this release's source maps)"}</span>
        {"\n\n"}
        <span className="tk-k">## Requests the page made</span>
        {"\n"}
        <span className="tk-s">- 14:02:11 `POST /api/exports/run` → 504 in 61204ms</span>
        {"\n"}
        <span className="tk-s">- 14:03:12 `GET /api/exports/9f21` → 404 in 88ms</span>
        {"\n\n"}
        <span className="tk-k">## Reported 47 times</span>
        {"\n"}
        <span className="tk-s">Last seen 4 minutes ago. Others: #119, #121, #124, #126…</span>
        {"\n\n"}
        <span className="tk-k">## Delivered to</span>
        {"\n"}
        <span className="tk-s">- Engineering backlog (github): open there — https://github.com/acme/app/issues/2041</span>
      </pre>
    </div>
  );
}

export default function Mcp() {
  return (
    <SitePage title="MCP">
      <PageHead
        eyebrow="MCP"
        title={
          <>
            Give the bug to the agent
            <br />
            <span className="text-text-3">that can fix it.</span>
          </>
        }
        lead={
          <>
            A report arrives with the console errors, the failing requests and the clicks from the moments before someone pressed send. The Issueit MCP server hands all of it to a coding agent, along
            with the tools to fix it, file it and close it — so the path from <em>a user hit this</em> to <em>here is the line that's wrong</em> is one conversation.
          </>
        }
      >
        <div className="hero-ctas mcp-ctas" style={{ "--d": "240ms" } as CSSProperties}>
          <Link to="/signup" className="btn btn--primary site-btn site-btn--lg">
            Get started
          </Link>
          <DocsLink to="/automate/mcp" className="btn site-btn site-btn--lg site-btn--ghost">
            Read the MCP docs
          </DocsLink>
        </div>
      </PageHead>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Connect
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              One line in the client you already use.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Create an account token under <strong>Settings › Account tokens</strong> — the agent preset is the right starting point — and paste one of these. There is no separate MCP account, no
              second API and nothing to deploy.
            </p>
          </div>
          <Install />
          <div className="mcp-ways">
            {WAYS.map((w, i) => (
              <article key={w.title} data-rv style={{ "--d": `${i * 80}ms` } as CSSProperties}>
                <h3>
                  <w.icon size={17} />
                  {w.title}
                </h3>
                <p>{w.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              The evidence
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Everything the browser saw, as text.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Most of what makes a bug hard is missing context. <code>get_report</code> returns all of it in one message — already rendered, already ordered, with minified stacks put back through the
              release's source maps so the agent reads your filenames rather than <code>bundle.js:1:98213</code>.
            </p>
          </div>
          <div className="mcp-see">
            <ul className="mcp-has" data-rv>
              {[
                "What the person actually wrote, and whether they want to hear when it's fixed",
                "Console errors with stacks mapped to your source, newest last",
                "The requests the page made, with status codes and how long they took",
                "The clicks, inputs and navigations that led there",
                "Screenshots, video and files, as addresses the agent can fetch",
                "How many other people reported the same thing, and where it was already filed",
              ].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <AgentView />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Prompts
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Ask your agent to…
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Copy one of these into your MCP client. Everything here is one sentence of plain English, because the tools are named after the jobs rather than the endpoints.
            </p>
          </div>
          <ul className="mcp-prompts">
            {PROMPTS.map((p, i) => (
              <li key={p} data-rv style={{ "--d": `${(i % 3) * 70}ms` } as CSSProperties}>
                <button type="button" onClick={() => copyText(p, "prompt")}>
                  <span>{p}</span>
                  <i aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Agentic tools
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Twenty-five tools, one API.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              Each one is a named verb over the same management API the dashboard uses — a model chooses better from twenty-five clear tools than from a mirror of every endpoint. They are declared
              once and shared by the local server and the HTTP endpoint, so the two can't drift.
            </p>
          </div>
          <div className="detail-grid">
            {TOOLS.map((t, i) => (
              <article key={t.title} className="detail" data-rv style={{ "--d": `${(i % 3) * 80}ms` } as CSSProperties}>
                <t.icon size={18} className="detail-icon" />
                <h3>{t.title}</h3>
                <p>{t.text}</p>
                <div className="mcp-chips">
                  {t.names.map((n) => (
                    <code key={n}>{n}</code>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Also in the box
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              Prompts and resources, not only tools.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              The jobs people actually bring, written down once so nobody has to describe them again — and a way to attach a single report, or the API reference, to a conversation by hand.
            </p>
          </div>
          <ul className="mcp-extras">
            {EXTRAS.map((e, i) => (
              <li key={e.name} data-rv style={{ "--d": `${(i % 3) * 60}ms` } as CSSProperties}>
                <span className="mcp-kind">{e.kind}</span>
                <code>{e.name}</code>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap">
          <div className="sec-head">
            <p className="eyebrow" data-rv>
              Safety
            </p>
            <h2 className="h2" data-rv style={{ "--d": "60ms" } as CSSProperties}>
              An agent with a key to your bugs.
            </h2>
            <p className="lead" data-rv style={{ "--d": "120ms" } as CSSProperties}>
              That is worth being careful about. The MCP server has no privileges of its own: it holds a token, and a token can only do what a person decided it could.
            </p>
          </div>
          <ul className="plat-trust">
            {TRUST.map(([title, text], i) => (
              <li key={title} data-rv style={{ "--d": `${(i % 3) * 60}ms` } as CSSProperties}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec">
        <div className="site-wrap plat-next">
          <h2 className="h2" data-rv>
            Point it at your bugs.
          </h2>
          <p className="lead" data-rv style={{ "--d": "60ms" } as CSSProperties}>
            The MCP server, the command line and account tokens are in every plan, including free — they're the reason to try Issueit, not a reason to pay for it.
          </p>
          <div className="plat-next-links" data-rv style={{ "--d": "120ms" } as CSSProperties}>
            <Link to="/signup" className="btn btn--primary site-btn">
              Get started
            </Link>
            <DocsLink to="/automate/mcp" className="btn">
              MCP documentation
            </DocsLink>
            <DocsLink to="/automate/tokens" className="btn">
              <KeyMinimalistic2Icon size={14} />
              Account tokens
            </DocsLink>
            <DocsLink to="/automate/cli" className="btn btn--quiet">
              <Code2Icon size={14} />
              Command line
            </DocsLink>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
