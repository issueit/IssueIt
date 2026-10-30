import { useQuery } from "@tanstack/react-query";
import type { ProviderCategory } from "../../lib/types";

/** How each kind of service is named in pickers, docs and the marketing site. */
export const categoryLabels: Record<ProviderCategory, { plural: string; one: string }> = {
  tracker: { plural: "Issue trackers", one: "Issue tracker" },
  helpdesk: { plural: "Help desks and CRM", one: "Help desk" },
  chat: { plural: "Chat", one: "Chat" },
  notify: { plural: "Push and SMS", one: "Push or SMS" },
  email: { plural: "Email", one: "Email" },
  oncall: { plural: "On-call and alerts", one: "On-call" },
  data: { plural: "Spreadsheets and databases", one: "Spreadsheet or database" },
  automation: { plural: "Automation", one: "Automation" },
  analytics: { plural: "Analytics and monitoring", one: "Analytics" },
  cloud: { plural: "Cloud queues and events", one: "Cloud events" },
  webhook: { plural: "Webhook", one: "Your own endpoint" },
};

export type CatalogueEntry = { id: string; name: string; category: ProviderCategory; summary: string };

/** The public list of integrations, for pages outside the signed-in app. */
export function useCatalogue() {
  return useQuery({
    queryKey: ["catalogue"],
    queryFn: async () => {
      const res = await fetch("/api/catalogue");
      if (!res.ok) throw new Error("catalogue");
      return ((await res.json()) as { providers: CatalogueEntry[] }).providers;
    },
    staleTime: 5 * 60_000,
  });
}
