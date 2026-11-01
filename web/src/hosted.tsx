import { lazy, type ComponentType } from "react";
import { TicketIcon } from "./components/ui/icons";
import { company } from "./pages/site/company";
import { billingArticles } from "./pages/support/content/billing";
import type { FootColumn, FootLink } from "./pages/site/chrome";
import type { Article } from "./pages/support/types";

/**
 * What the hosted service adds to this build, and nothing else does.
 *
 * Issueit is one codebase and two editions. The open edition is the product:
 * collect a report, deliver it, run it yourself. The hosted service also has
 * a business — a price list, a subscription, terms somebody agreed to, a blog
 * and a company behind it — and none of that means anything on somebody
 * else's server.
 *
 * Everything in that second group is registered here and nowhere else, so the
 * router, the navigation, the footer, the settings rail and the support index
 * are written once and come out right in both editions. The open export
 * replaces this file with a copy whose lists are empty (see
 * scripts/publish-oss.mjs), which is why every list here is read rather than
 * hard-coded at the places that use it.
 */

/** A public page that only the hosted service serves. */
export type HostedRoute = { path: string; Page: ComponentType };

export const hostedRoutes: HostedRoute[] = [
  { path: "/pricing", Page: lazy(() => import("./pages/site/hosted/Pricing")) },
  { path: "/about", Page: lazy(() => import("./pages/site/hosted/About")) },
  { path: "/blog/:slug?", Page: lazy(() => import("./pages/site/hosted/Blog")) },
  { path: "/careers", Page: lazy(() => import("./pages/site/hosted/Careers")) },
  { path: "/legal/:doc", Page: lazy(() => import("./pages/site/hosted/Legal")) },
];

/** Addresses that were linked before the legal pages had a section of their own. */
export const hostedRedirects: Array<{ from: string; to: string }> = [
  { from: "/legal", to: "/legal/terms" },
  { from: "/terms", to: "/legal/terms" },
  { from: "/privacy", to: "/legal/privacy" },
  { from: "/cookies", to: "/legal/cookies" },
];

/** In the site header, and in the documentation's own header. */
export const hostedNav: Array<{ to: string; label: string }> = [{ to: "/pricing", label: "Pricing" }];

/** Added to the footer columns the product already has. */
export const hostedProductLinks: FootLink[] = [{ label: "Pricing", to: "/pricing" }];
export const hostedSupportLinks: FootLink[] = [{ label: "Write to us", to: `mailto:${company.email.support}` }];

/** Footer columns that exist only because there is a company behind this one. */
export const hostedFootColumns: FootColumn[] = [
  {
    title: "Company",
    links: [
      { label: "About us", to: "/about" },
      { label: "Blog", to: "/blog" },
      { label: "Work for us", to: "/careers" },
      { label: "Contact", to: `mailto:${company.email.hello}` },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", to: "/legal/terms" },
      { label: "Privacy policy", to: "/legal/privacy" },
      { label: "Cookie policy", to: "/legal/cookies" },
      { label: "Report a vulnerability", to: `mailto:${company.email.security}` },
    ],
  },
];

/** Settings pages, and where they sit in the rail. */
export const hostedSettings: Array<{
  path: string;
  Page: ComponentType;
  /** The rail heading this belongs under, and the page it follows. */
  heading: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  finds: string;
}> = [
  {
    path: "billing",
    Page: lazy(() => import("./pages/settings/Billing").then((m) => ({ default: m.BillingSettings }))),
    heading: "Organisation",
    label: "Plan and billing",
    icon: TicketIcon,
    finds: "plan subscription invoice card payment upgrade free pro business",
  },
];

/** Support articles about the plan, the allowance and the invoice. */
export const hostedArticles: Article[] = billingArticles;
