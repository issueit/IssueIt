import { useEffect } from "react";

/**
 * Title, description and canonical address for a public page. The dashboard
 * doesn't need this — nothing links to it and nothing indexes it — but the
 * documentation and the support articles are read from search results, where
 * the description is the only thing a reader sees before deciding to click.
 */
export function usePageMeta({ title, description, canonical }: { title: string; description?: string; canonical?: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    const restore: Array<() => void> = [() => (document.title = previous)];

    if (description) restore.push(setMeta("description", description));
    if (canonical) restore.push(setLink("canonical", canonical));

    return () => restore.forEach((f) => f());
  }, [title, description, canonical]);
}

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const existed = !!el;
  const before = el?.content;
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
  return () => {
    if (!existed) el?.remove();
    else if (el && before !== undefined) el.content = before;
  };
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const existed = !!el;
  const before = el?.href;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
  return () => {
    if (!existed) el?.remove();
    else if (el && before !== undefined) el.href = before;
  };
}
