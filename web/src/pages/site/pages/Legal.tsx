import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { PageHead, SitePage } from "../chrome";
import { Article, C, Note, Section, Table, type Toc } from "../prose";
import { company } from "../company";
import { privacy } from "./privacy";
import { terms } from "./terms";

/**
 * Terms, privacy and cookies, in plain English. They describe what the
 * software really does (one cookie, no trackers, keyed IP hashes), so keep
 * them in step with the code when either changes.
 */

const Mail = ({ to }: { to: string }) => <a href={`mailto:${to}`}>{to}</a>;

export type LegalDoc = { title: string; lead: ReactNode; toc: Toc; body: () => ReactNode };

const docs: Record<string, LegalDoc> = {
  terms,
  privacy,
  cookies: {
    title: "Cookie policy",
    lead: "One cookie, and only once you sign in. No banner, because there's nothing to agree to.",
    toc: [
      ["cookies", "Cookies"],
      ["storage", "Browser storage"],
      ["session-storage", "Session storage"],
      ["widget", "The widget"],
      ["third-parties", "Third parties"],
      ["control", "Your control"],
    ],
    body: () => (
      <>
        <Section id="cookies" title="Cookies">
          <Table
            head={["Name", "Purpose", "Lasts"]}
            rows={[
              [
                <C>__Host-issueit_session</C>,
                "Keeps you signed in to the dashboard. Strictly necessary. HttpOnly, Secure and SameSite=Lax, so scripts can't read it and other sites can't send it.",
                "30 days, or until you sign out",
              ],
            ]}
          />
          <p>
            It's set only when you sign in or create an account. Reading this site without signing in sets no cookies at all. On a self-hosted install served over plain http, the same cookie is called{" "}
            <C>issueit_session</C>.
          </p>
        </Section>
        <Section id="storage" title="Browser storage">
          <p>The site and dashboard remember three preferences in your browser's local storage. They never leave your device.</p>
          <Table
            head={["Key", "Remembers"]}
            rows={[
              [<C>issueit.theme</C>, "Light, dark or system appearance."],
              [<C>issueit.accent</C>, "Your accent colour, if you chose one."],
              [<C>issueit.org</C>, "Which organisation you last had open."],
            ]}
          />
        </Section>
        <Section id="session-storage" title="Session storage">
          <Table
            head={["Key", "Why", "Lasts"]}
            rows={[
              [
                <C>issueit.reloaded</C>,
                "Set only if a page fails to load, usually just after an update, so the page reloads once to fetch the new version instead of looping.",
                "Removed ten seconds after a successful load, and always when the tab closes",
              ],
            ]}
          />
        </Section>
        <Section id="widget" title="The widget">
          <p>
            The widget on other companies' sites sets no cookies and writes nothing to storage. It reads the details listed in our <Link to="/legal/privacy#reports">privacy policy</Link> only when
            someone sends a report.
          </p>
        </Section>
        <Section id="third-parties" title="Third parties">
          <p>None. This site loads its fonts, scripts and images from our own servers, with no analytics, advertising or social embeds.</p>
        </Section>
        <Section id="control" title="Your control">
          <p>
            You can delete the cookie and storage in your browser's settings at any time; you'll just be signed out. If we ever add anything that isn't strictly necessary, we'll ask first and update
            this page.
          </p>
          <Note>
            Questions: <Mail to={company.email.privacy} />.
          </Note>
        </Section>
      </>
    ),
  },
};

export default function Legal() {
  const { doc = "" } = useParams();
  const d = docs[doc];
  if (!d) return <Navigate to="/legal/terms" replace />;
  return (
    <SitePage title={d.title}>
      <PageHead eyebrow="Legal" title={d.title} lead={d.lead}>
        <nav className="page-tabs fade-up" style={{ ["--d" as string]: "240ms" }} aria-label="Legal documents">
          {Object.entries(docs).map(([key, x]) => (
            <Link key={key} to={`/legal/${key}`} aria-current={key === doc ? "page" : undefined}>
              {x.title}
            </Link>
          ))}
        </nav>
      </PageHead>
      <Article key={doc} toc={d.toc} meta={<p className="article-meta">Updated {company.legalUpdated}</p>}>
        {d.body()}
      </Article>
    </SitePage>
  );
}
