import { useRef, useState } from "react";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { useInView, useReducedMotion, useScene } from "./motion";

/**
 * A switchboard: reports arrive on the left, a rule picks where each one
 * goes, and the matching destinations light up on the right.
 */

const DESTS = [
  ["github", "GitHub Issues"],
  ["linear", "Linear"],
  ["jira", "Jira"],
  ["asana", "Asana"],
  ["slack", "Slack"],
  ["teams", "Microsoft Teams"],
  ["zendesk", "Zendesk"],
  ["pagerduty", "PagerDuty"],
  ["telegram", "Telegram"],
  ["webhook", "Your webhook"],
] as const;

const REPORTS = [
  { n: 43, title: "Card declined after 3-D Secure", priority: "Critical", source: "widget", env: "production", rule: "Priority is critical", to: ["github", "slack", "pagerduty"] },
  { n: 44, title: "Typo on the pricing page", priority: "Low", source: "form", env: "production", rule: "Source is form", to: ["asana", "zendesk"] },
  { n: 45, title: "Sync stalls at 99%", priority: "High", source: "api", env: "staging", rule: "Environment is staging", to: ["linear", "teams"] },
  { n: 46, title: "Export ignores the date filter", priority: "Medium", source: "widget", env: "production", rule: "Every report", to: ["jira", "telegram", "webhook"] },
];

// Geometry in a 1000 × 520 box; the DOM nodes and the SVG share it.
const W = 1000;
const H = 520;
const HUB = { x: 470, y: 260 };
const NODE_X = 760;
const nodeY = (i: number) => 34 + i * 50.2;
const outPath = (i: number) => `M ${HUB.x + 34} ${HUB.y} C ${HUB.x + 170} ${HUB.y}, ${NODE_X - 140} ${nodeY(i)}, ${NODE_X} ${nodeY(i)}`;
const IN_PATH = `M 300 ${HUB.y} L ${HUB.x - 34} ${HUB.y}`;

type Phase = "idle" | "in" | "routed" | "out";

export function Routing() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px" });
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>(reduced ? "routed" : "idle");
  const [pulse, setPulse] = useState(0);
  const report = REPORTS[i];

  useScene(inView && !reduced, async (wait) => {
    for (let k = 0; k < REPORTS.length; k++) {
      setI(k);
      setPhase("in");
      await wait(900);
      setPulse((p) => p + 1);
      await wait(250);
      setPhase("routed");
      await wait(2600);
      setPhase("out");
      await wait(600);
    }
  });

  const lit = (id: string) => phase === "routed" && report.to.includes(id as never);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div ref={ref} className="sw" data-phase={phase} data-rv>
      <div className="sw-box">
        <svg className="sw-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <path d={IN_PATH} className="sw-wire" />
          <path key={`in-${i}-${phase === "in"}`} d={IN_PATH} pathLength={100} className="sw-comet" data-go={phase === "in" || undefined} />
          {DESTS.map(([id], j) => (
            <g key={id}>
              <path d={outPath(j)} className="sw-wire" />
              <path d={outPath(j)} pathLength={100} className="sw-draw" data-on={lit(id) || undefined} />
              {lit(id) && <path key={`c-${i}`} d={outPath(j)} pathLength={100} className="sw-comet" data-go style={{ animationDelay: `${report.to.indexOf(id as never) * 90}ms` }} />}
            </g>
          ))}
        </svg>

        <div className="sw-card" key={report.n} style={{ ["--x" as string]: "0%", ["--y" as string]: pct(HUB.y, H) }}>
          <div className="flex items-center gap-2">
            <span className="mono text-text-4 tabular">#{report.n}</span>
            <span className="sw-card-title truncate">{report.title}</span>
          </div>
          <div className="sw-facts">
            <span>
              <em>Priority</em>
              {report.priority}
            </span>
            <span>
              <em>Source</em>
              {report.source}
            </span>
            <span>
              <em>Environment</em>
              {report.env}
            </span>
          </div>
        </div>

        <div className="sw-hub" style={{ ["--x" as string]: pct(HUB.x, W), ["--y" as string]: pct(HUB.y, H) }}>
          <span key={pulse} className="sw-ring" data-go={pulse > 0 || undefined} />
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
            <path d="M11 9.5h10M16 9.5v13M11 22.5h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>

        <div className="sw-rule" style={{ ["--x" as string]: pct(HUB.x, W), ["--y" as string]: pct(HUB.y + 54, H) }} data-on={phase === "routed" || undefined}>
          <span className="text-text-4">When</span> {report.rule}
          <span className="text-text-4"> → </span>
          {report.to.length} destinations
        </div>

        <ul className="sw-nodes">
          {DESTS.map(([id, name], j) => (
            <li
              key={id}
              className="sw-node"
              data-on={lit(id) || undefined}
              style={{ ["--x" as string]: pct(NODE_X, W), ["--y" as string]: pct(nodeY(j), H), transitionDelay: lit(id) ? `${280 + report.to.indexOf(id as never) * 90}ms` : "0ms" }}
            >
              <BrandIcon provider={id} name={name} size={14} />
              <span className="truncate">{name}</span>
              <span className="sw-node-dot" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
