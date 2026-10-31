import { useQuery } from "@tanstack/react-query";
import { appOrigin } from "./hosts";

/**
 * Which address this install serves each thing from. Documentation samples
 * are meant to be copied and run, so they can't be written against the page's
 * own origin: the hosted service splits intake, the CDN and the dashboard
 * across subdomains, while a self-hosted install puts them all on one.
 * Until the answer arrives, the app's own origin is a sound guess — it is the
 * right one for every install that hasn't split anything.
 */
export type Urls = { app: string; drop: string; cdn: string; docs: string; marketing: string; edition: "hosted" | "selfhost" };

const fallback: Urls = { app: appOrigin, drop: appOrigin, cdn: appOrigin, docs: `${appOrigin}/docs`, marketing: appOrigin, edition: "selfhost" };

export function useUrls(): Urls {
  const { data } = useQuery({
    queryKey: ["urls"],
    queryFn: async () => {
      const res = await fetch("/api/urls");
      if (!res.ok) throw new Error("urls");
      return (await res.json()) as Urls;
    },
    staleTime: Infinity,
    retry: false,
  });
  return data ?? fallback;
}
