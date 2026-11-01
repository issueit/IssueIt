import type { CSSProperties } from "react";
import { PageHead, SitePage } from "../chrome";
import { company } from "../company";

/** Open roles. Add one here and it appears on the page; with none, the page says so plainly. */
type Role = { title: string; team: string; where: string; summary: string };
const roles: Role[] = [];

const stack = [
  ["TypeScript", "End to end: server, dashboard and widget"],
  ["Hono", "One HTTP process for the API, intake and files"],
  ["PostgreSQL", "Data, delivery queue and live updates, without a second system"],
  ["React 19", "The dashboard and this site"],
  ["Vanilla DOM", "The widget: no framework, no dependencies"],
  ["Vitest and Playwright", "Every integration exercised; every page in three browser engines"],
];

const work = [
  {
    title: "Small surface, deep care",
    body: "Issueit does one thing. The work is making that one thing exact: the retry that doesn't duplicate, the error that names the field, the animation that doesn't drop a frame.",
  },
  {
    title: "Write it down",
    body: "Decisions, trade-offs and incidents get written in plain English. A good paragraph saves a meeting, and the next person reads it instead of guessing.",
  },
  {
    title: "Ship, then look",
    body: "Small changes, measured afterwards. If we said something got faster, there's a profile that shows it.",
  },
  {
    title: "Own it to the end",
    body: "Whoever builds a feature writes its docs, its error messages and its tests, and watches it in production.",
  },
];

export default function Careers() {
  return (
    <SitePage title="Work for us">
      <PageHead
        eyebrow="Work for us"
        title={
          <>
            Build the quiet part
            <br />
            <span className="text-text-3">of other people's tools.</span>
          </>
        }
        lead="Issueit sits between someone who found a bug and the developer who can fix it. If you like making small things work perfectly, this is that kind of job."
      />

      <section className="site-wrap careers-roles" data-rv>
        <h2 className="careers-h">Open roles</h2>
        {roles.length ? (
          <ul className="careers-list">
            {roles.map((r) => (
              <li key={r.title}>
                <div>
                  <h3>{r.title}</h3>
                  <p>{r.summary}</p>
                </div>
                <span>
                  {r.team} · {r.where}
                </span>
                <a href={`mailto:${company.email.jobs}?subject=${encodeURIComponent(r.title)}`} className="btn btn--sm">
                  Apply
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="careers-empty">
            <p>There's no role advertised right now.</p>
            <p className="text-text-3">
              If you'd like to work on Issueit anyway, write to <a href={`mailto:${company.email.jobs}`}>{company.email.jobs}</a> with something you've built and what you'd change here first. We read
              every note.
            </p>
          </div>
        )}
      </section>

      <section className="site-wrap careers-grid">
        <div>
          <p className="eyebrow" data-rv>
            How we work
          </p>
          <ol className="careers-work">
            {work.map((w, i) => (
              <li key={w.title} data-rv style={{ "--d": `${i * 70}ms` } as CSSProperties}>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="eyebrow" data-rv>
            What you'd work with
          </p>
          <dl className="careers-stack" data-rv>
            {stack.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </SitePage>
  );
}
