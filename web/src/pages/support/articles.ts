import { basicArticles } from "./content/basics";
import { deliveryArticles } from "./content/delivery";
import { accountArticles } from "./content/account";
import { hostedArticles } from "../../hosted";
import { categories, type Article, type CategoryId } from "./types";

/**
 * Every support article, in one list. Order inside a category is reading
 * order, which is also the order they're listed in.
 */
export const articles: Article[] = [...basicArticles, ...deliveryArticles, ...accountArticles, ...hostedArticles];

export const articleBySlug = new Map(articles.map((a) => [a.slug, a]));

export const inCategory = (id: CategoryId) => articles.filter((a) => a.category === id);

/** Locales these articles exist in. The path carries one so translations can be added without new addresses. */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const isLocale = (value: string | undefined): value is Locale => !!value && (locales as readonly string[]).includes(value);

/** The ones most people come for, in the order they tend to need them. */
export const popular = [
  "add-the-bug-report-button-to-your-website",
  "reports-are-not-reaching-your-issue-tracker",
  "the-bug-report-button-is-not-appearing",
  "stop-getting-hundreds-of-reports-for-one-bug",
  "reset-a-forgotten-password",
  "send-bug-reports-to-github-issues",
]
  .map((slug) => articleBySlug.get(slug))
  .filter((a): a is Article => !!a);

/**
 * Search across titles, summaries, categories and the extra words each
 * article carries. Small enough to run on every keystroke.
 */
export function searchArticles(query: string): Article[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: Array<{ article: Article; score: number }> = [];
  for (const article of articles) {
    const title = article.title.toLowerCase();
    const category = categories.find((c) => c.id === article.category)?.title.toLowerCase() ?? "";
    const haystack = `${title} ${article.summary.toLowerCase()} ${category} ${article.keywords ?? ""} ${article.slug} ${article.id.toLowerCase()}`;
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 20;
      else if (haystack.includes(term)) score += 6;
      else {
        score = -1;
        break;
      }
    }
    if (score > 0) scored.push({ article, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.article);
}
