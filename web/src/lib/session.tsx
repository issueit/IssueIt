import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Me, Role } from "./types";

type OrgContext = {
  me: Me;
  orgId: string;
  org: { id: string; name: string; role: Role };
  setOrg: (id: string) => void;
  /** Prefixes an organisation-scoped API path. */
  path: (p: string) => string;
};

const Ctx = createContext<OrgContext | null>(null);

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), retry: false, staleTime: 60_000 });
}

export function OrgProvider({ me, children }: { me: Me; children: ReactNode }) {
  const qc = useQueryClient();
  const [stored, setStored] = useState(() => localStorage.getItem("issueit.org"));
  const org = me.organisations.find((o) => o.id === stored) ?? me.organisations[0];

  useEffect(() => {
    if (org && org.id !== stored) localStorage.setItem("issueit.org", org.id);
  }, [org, stored]);

  const setOrg = useCallback(
    (id: string) => {
      localStorage.setItem("issueit.org", id);
      setStored(id);
      qc.removeQueries({ queryKey: ["org"] });
    },
    [qc],
  );

  const value = useMemo(() => (org ? { me, org, orgId: org.id, setOrg, path: (p: string) => `/orgs/${org.id}${p}` } : null), [me, org, setOrg]);
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrg outside OrgProvider");
  return ctx;
}
