import { useRef, useState } from "react";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { useReducedMotion, useScrollProgress } from "./motion";

/**
 * Ten hours of delivery attempts, scrubbed by scrolling. One destination
 * works first time, one recovers from an outage, one never answers, and
 * the report is safe throughout.
 */

const BACKOFF = [30, 120, 600, 1800, 3600, 10800, 21600];
const AT = BACKOFF.reduce<number[]>((acc, s) => [...acc, acc[acc.length - 1] + s], [0]);
const END = AT[AT.length - 1];
const SCALE = Math.log(1 + END / 10);
const pos = (t: number) => Math.log(1 + t / 10) / SCALE;
const timeAt = (x: number) => 10 * (Math.exp(x * SCALE) - 1);

/** Ruler labels: minutes under an hour, then hours to one decimal. */
const tick = (s: number) => (s === 0 ? "now" : s < 60 ? `+${s}s` : s < 3600 ? `+${Math.floor(s / 60)}m` : `+${(s / 3600).toFixed(1)}h`);
const short = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);
const elapsed = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : m ? `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s` : `${Math.floor(s)}s`;
};
const START = 9 * 3600 + 12 * 60 + 44;
const clock = (s: number) => {
  const t = Math.floor(START + s) % 86400;
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((v) => String(v).padStart(2, "0")).join(":");
};

type Lane = { provider: string; name: string; fails: string[]; ok?: string };
const LANES: Lane[] = [
  { provider: "github", name: "GitHub Issues", fails: [], ok: "Issue #142 opened" },
  { provider: "linear", name: "Linear", fails: ["503 Service unavailable", "503 Service unavailable", "Timed out after 15s", "502 Bad gateway"], ok: "ENG-381 created" },
  { provider: "webhook", name: "Your webhook", fails: Array(8).fill("Connection refused") },
];

type Ev = { t: number; who: string; text: string; tone: "ok" | "fail" | "info" };
const EVENTS: Ev[] = [
  { t: -1, who: "Issueit", text: "Report #42 stored, 3 deliveries queued", tone: "info" } as Ev,
  ...LANES.flatMap((lane) => [
    ...lane.fails.map((f, k): Ev => ({
      t: AT[k],
      who: lane.name,
      text: k < BACKOFF.length ? `${f} · retry in ${short(BACKOFF[k])}` : `${f} · gave up after ${k + 1} attempts, the report stays in your inbox`,
      tone: "fail",
    })),
    ...(lane.ok ? [{ t: AT[lane.fails.length] + 0.5, who: lane.name, text: `${lane.ok} on attempt ${lane.fails.length + 1}`, tone: "ok" } as Ev] : []),
  ]),
].sort((a, b) => a.t - b.t);

export function Reliability() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [x, setX] = useState(reduced ? 1 : 0);
  useScrollProgress(ref, {
    sticky: true,
    onProgress: (p) => !reduced && setX(Math.min(1, Math.max(0, (p - 0.08) / 0.78))),
  });
  const now = x >= 1 ? END : timeAt(x);
  const seen = EVENTS.filter((e) => (e.t < 0 ? x > 0 || reduced : pos(Math.max(0, e.t)) <= x + 0.0001 && (e.t > 0 || x > 0.004)));

  return (
    <section ref={ref} id="reliability" className="rel">
      <div className="rel-sticky">
        <div className="site-wrap">
          <div className="rel-head">
            <div>
              <p className="eyebrow" data-rv>
                Delivery
              </p>
              <h2 className="h2" data-rv>
                A failed delivery never loses the report.
              </h2>
            </div>
            <p className="lead rel-lead" data-rv>
              Every report is stored before anything is sent. Each destination gets its own delivery, retried with backoff for about ten hours, and one slow tool never holds up the others.
            </p>
          </div>

          <div className="rel-board" data-rv>
            <div className="rel-ruler">
              <span className="rel-ruler-label">Since the report</span>
              <div className="rel-track">
                {AT.map((t, k) => (
                  <span key={t} className="rel-tick" data-k={k} style={{ left: `${pos(t) * 100}%` }}>
                    {tick(t)}
                  </span>
                ))}
              </div>
            </div>

            {LANES.map((lane) => {
              const attempts = lane.ok ? lane.fails.length + 1 : lane.fails.length;
              const lastT = AT[attempts - 1];
              const done = pos(lastT) <= x && (lastT > 0 || x > 0.004);
              const reached = AT.slice(0, attempts).filter((t) => pos(t) <= x && (t > 0 || x > 0.004)).length;
              const state = done ? (lane.ok ? "ok" : "failed") : reached ? "retrying" : "queued";
              return (
                <div key={lane.provider} className="rel-lane" data-state={state}>
                  <div className="rel-lane-name">
                    <BrandIcon provider={lane.provider} size={14} framed />
                    <span className="truncate">{lane.name}</span>
                  </div>
                  <div className="rel-track">
                    <span className="rel-fill" style={{ width: `${Math.min(x, pos(lastT)) * 100}%` }} />
                    {AT.slice(0, attempts).map((t, k) => {
                      const hit = pos(t) <= x && (t > 0 || x > 0.004);
                      const ok = !!lane.ok && k === attempts - 1;
                      return <span key={t} className="rel-dot" data-hit={hit || undefined} data-ok={ok || undefined} style={{ left: `${pos(t) * 100}%` }} />;
                    })}
                  </div>
                  <div className="rel-lane-state">
                    <i />
                    {state === "ok" ? `Delivered · attempt ${attempts}` : state === "failed" ? "Gave up · retry any time" : state === "retrying" ? `Retrying · attempt ${reached + 1}` : "Queued"}
                  </div>
                </div>
              );
            })}

            <div className="rel-playhead" style={{ ["--x" as string]: x }} aria-hidden>
              <span className="mono tabular">+{elapsed(now)}</span>
            </div>
          </div>

          <ol className="rel-log mono" aria-label="Delivery log">
            {seen.slice(-4).map((e) => (
              <li key={`${e.who}-${e.t}`} data-tone={e.tone}>
                <span className="tabular text-text-4">{clock(Math.max(0, e.t))}</span>
                <span className="rel-log-who">{e.who}</span>
                <span className="rel-log-text">{e.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
