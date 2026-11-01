import type { CSSProperties } from "react";
import { Link } from "react-router";
import { AltArrowRightIcon } from "../../../components/ui/icons";
import { useCatalogue } from "../../../features/integrations/categories";
import { PageHead, SitePage } from "../chrome";
import { company } from "../company";

const beliefs = [
  {
    title: "Reporting a bug should take a minute",
    body: "The person who found it owes you nothing. No account, no forms about forms: a title, a sentence, a screenshot if they like, and they're done.",
  },
  {
    title: "A report is never lost",
    body: "It's stored before anything else happens. If GitHub is down or a token expires, delivery waits and retries for ten hours, and says exactly what went wrong.",
  },
  {
    title: "Your tracker is your tracker",
    body: "Issueit isn't another place to triage. It delivers into the tools your team already lives in, then gets out of the way.",
  },
  {
    title: "Quiet software",
    body: "Greyscale, colour only where something has a state, and no notification you didn't ask for. Tools for developers should feel like good tools.",
  },
  {
    title: "Your data, your server, if you like",
    body: "The whole product runs as one container and PostgreSQL. Self-hosting isn't a lesser edition; it's the same build.",
  },
  {
    title: "Specific over vague",
    body: "Errors say which field and why. Docs list every header and limit. If we can't be precise about something, we say so.",
  },
];

export default function About() {
  const catalogue = useCatalogue();
  const destinations = catalogue.data?.length;
  const numbers = [
    [destinations ? String(destinations) : "130+", "places a report can go"],
    ["0", "accounts a reporter needs"],
    ["8", "delivery attempts over ten hours"],
    ["1", "container, plus PostgreSQL"],
  ];

  return (
    <SitePage title="About us">
      <PageHead
        eyebrow="About us"
        title={
          <>
            Bugs get found by people
            <br />
            <span className="text-text-3">who can't fix them.</span>
          </>
        }
        lead="Someone notices the checkout total is wrong. They'd tell you, if telling you were easy. Issueit is the shortest path from that moment to a ticket in front of the developer who can fix it."
      />

      <section className="site-wrap about-numbers" data-rv>
        {numbers.map(([n, label], i) => (
          <div key={label} style={{ "--d": `${i * 80}ms` } as CSSProperties}>
            <span className="about-n tabular">{n}</span>
            <span className="about-l">{label}</span>
          </div>
        ))}
      </section>

      <section className="site-wrap about-story">
        <p className="eyebrow" data-rv>
          Why we built it
        </p>
        <div className="about-cols">
          <p data-rv>
            Most teams have the same gap. Users find bugs and email support. Support copies the email into a ticket, loses the screenshot, guesses the browser, and the developer asks three questions
            that nobody can answer a week later.
          </p>
          <p data-rv style={{ "--d": "100ms" } as CSSProperties}>
            The fix wasn't another issue tracker. Teams already have one, and they don't want two. It was a small, reliable pipe: collect a good report where the bug happened, with the context
            attached, and put it straight into the tracker, the channel or the pager that already runs the team's day.
          </p>
          <p data-rv style={{ "--d": "200ms" } as CSSProperties}>
            So that's all Issueit does. It does it carefully: stored first, delivered in the background, retried with patience, signed so receivers can trust it, and honest about anything that failed.
          </p>
        </div>
      </section>

      <section className="site-wrap about-beliefs">
        <p className="eyebrow" data-rv>
          What we believe
        </p>
        <ol>
          {beliefs.map((b, i) => (
            <li key={b.title} data-rv style={{ "--d": `${(i % 3) * 90}ms` } as CSSProperties}>
              <span className="about-i tabular">{String(i + 1).padStart(2, "0")}</span>
              <h2>{b.title}</h2>
              <p>{b.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-wrap about-next" data-rv>
        <h2 className="h2">Say hello.</h2>
        <p className="lead">
          Questions, ideas, or a bug in the bug reporter: <a href={`mailto:${company.email.hello}`}>{company.email.hello}</a>.
        </p>
        <div className="about-links">
          <Link to="/blog" className="text-link">
            Read the blog
            <AltArrowRightIcon size={13} />
          </Link>
          <Link to="/careers" className="text-link">
            Work for us
            <AltArrowRightIcon size={13} />
          </Link>
        </div>
      </section>
    </SitePage>
  );
}
