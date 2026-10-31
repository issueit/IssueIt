import type { ReactNode } from "react";

/**
 * A support article. Written for somebody trying to get something done in
 * Issueit, which is why each one names what it applies to, when it was last
 * checked, and the articles to read next. The developer documentation is the
 * other half of the pair: these say what to click, those say what to send.
 */

export type CategoryId = "start" | "collect" | "deliver" | "reports" | "account" | "billing" | "selfhost";

export type Article = {
  /** The last part of /articles/en/<slug>. Says what the article is for, in words. */
  slug: string;
  title: string;
  /** The opening line, also used in search results and the category lists. */
  summary: string;
  category: CategoryId;
  /** Which parts of Issueit this is true of. */
  appliesTo: string[];
  /** A stable reference somebody can quote when they write in. */
  id: string;
  /** When the article was last checked against the product. */
  updated: string;
  /** Words a reader might search for that the title and summary don't contain. */
  keywords?: string;
  /** Other articles, by slug. */
  related?: string[];
  body: () => ReactNode;
};

export const categories: Array<{ id: CategoryId; title: string; blurb: string }> = [
  { id: "start", title: "Getting started", blurb: "Set up a project, collect your first report, and get your team in." },
  { id: "collect", title: "Collecting reports", blurb: "The report button, the form it opens, and what it records." },
  { id: "deliver", title: "Destinations and delivery", blurb: "Sending reports to your tracker or chat, and what to do when they don't arrive." },
  { id: "reports", title: "Managing reports", blurb: "Working through the inbox, duplicates, and keeping reporters informed." },
  { id: "account", title: "Your account and team", blurb: "Signing in, two-step verification, members and deleting data." },
  { id: "billing", title: "Plans and billing", blurb: "Changing plan, invoices, and what happens at the monthly allowance." },
  { id: "selfhost", title: "Running Issueit yourself", blurb: "Installing it on your own server, and the things that catch people out." },
];

export const categoryTitle = (id: CategoryId) => categories.find((c) => c.id === id)?.title ?? "Support";
