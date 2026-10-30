import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useOrg } from "./session";
import type { Analytics, AnalyticsRange, Connection, DeliveryDetail, DeliveryPolicy, DeliveryRow, Destination, MailInfo, OrgSettings, Priority, Project, ProjectLinks, ProjectSummary, ProviderInfo, ReportDetail, ReportListItem, Role } from "./types";

/** Every organisation query key starts ["org", orgId, domain], so events can invalidate a domain. */
export function useOrgQuery<T>(domain: string, key: unknown[], path: string, opts: { enabled?: boolean; keep?: boolean } = {}) {
  const { orgId, path: p } = useOrg();
  return useQuery({
    queryKey: ["org", orgId, domain, ...key],
    queryFn: ({ signal }) => api<T>(p(path), { signal }),
    enabled: opts.enabled,
    placeholderData: opts.keep ? keepPreviousData : undefined,
  });
}

export const useProjects = () => useOrgQuery<{ projects: ProjectSummary[] }>("projects", [], "/projects");
export const useProject = (id: string) =>
  useOrgQuery<{ project: Project; links: ProjectLinks; stats: { total: number; open: number; week: number }; mail: MailInfo }>("projects", [id], `/projects/${id}`);

export type ReportFilters = { project?: string; status: string; priority?: Priority | ""; q?: string; delivery?: string };

export function useReports(filters: ReportFilters) {
  const { orgId, path } = useOrg();
  return useInfiniteQuery({
    queryKey: ["org", orgId, "reports", "list", filters],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      if (pageParam) params.set("cursor", pageParam);
      return api<{ reports: ReportListItem[]; nextCursor: string | null }>(path(`/reports?${params}`), { signal });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export const useReport = (id: string | undefined) => useOrgQuery<ReportDetail>("reports", ["detail", id], `/reports/${id}`, { enabled: !!id });
export const useProviders = () => useOrgQuery<{ providers: ProviderInfo[] }>("providers", [], "/connections/providers");
export const useConnections = () => useOrgQuery<{ connections: Connection[] }>("connections", [], "/connections");
export const useDestinations = (projectId: string) => useOrgQuery<{ destinations: Destination[] }>("destinations", [projectId], `/projects/${projectId}/destinations`);
export const useDeliveries = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  return useOrgQuery<{ deliveries: DeliveryRow[] }>("deliveries", [params], `/deliveries?${q}`, { keep: true });
};
export const useKeys = (projectId: string) =>
  useOrgQuery<{ keys: Array<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string; createdBy: string | null }> }>(
    "keys",
    [projectId],
    `/projects/${projectId}/keys`,
  );
export const useMembers = () =>
  useOrgQuery<{
    members: Array<{ id: string; name: string; email: string; role: Role; joinedAt: string }>;
    invitations: Array<{ id: string; email: string; role: Role; expiresAt: string; createdAt: string }>;
  }>("members", [], "/members");

export type Usage = {
  reports: { month: number; lastMonth: number; total: number; daily: Array<{ day: string; n: number }> };
  storage: { bytes: number; files: number; monthFiles: number };
  deliveries: Partial<Record<"delivered" | "failed" | "retrying" | "pending" | "delivering", number>>;
  deliveriesByProvider: Array<{ provider: string; n: number }>;
  limits: { reportsPerMonth: number | null; storageBytes: number | null; attachmentBytes: number; attachmentsPerReport: number };
};
export const useUsage = () => useOrgQuery<Usage>("usage", [], "/usage");

export const useAnalytics = (range: AnalyticsRange, project: string | undefined) => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const q = new URLSearchParams({ range, tz, ...(project ? { project } : {}) });
  return useOrgQuery<Analytics>("analytics", [range, project ?? "all"], `/analytics?${q}`, { keep: true });
};

/** Every destination in the organisation, across projects. */
export const useOrgDestinations = () => useOrgQuery<{ destinations: Destination[] }>("destinations", ["all"], "/destinations");
export const useDelivery = (id: string | null) => useOrgQuery<{ delivery: DeliveryDetail }>("deliveries", ["detail", id], `/deliveries/${id}`, { enabled: !!id });
export const useDeliveryPolicy = () =>
  useOrgQuery<{ builtIn: DeliveryPolicy; organisation: Partial<DeliveryPolicy>; effective: DeliveryPolicy }>("policy", [], "/delivery-policy");
export const useOrganisation = () =>
  useOrgQuery<{ organisation: { id: string; name: string; settings: OrgSettings; role: Role } }>("organisation", [], "");
