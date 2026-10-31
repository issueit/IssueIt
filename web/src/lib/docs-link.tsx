import type { ReactNode } from "react";
import { Link } from "react-router";
import { useUrls } from "./urls";

/**
 * A link into the documentation from anywhere outside it. Hosted installs
 * serve documentation from its own subdomain and self-hosted ones serve it
 * from `/docs`, so which host a documentation page belongs to is something
 * only the server knows — and a link that leaves this origin has to be a
 * plain anchor rather than a router link.
 */

/** Builds documentation addresses, and says whether they leave this origin. */
export function useDocs() {
  const base = useUrls().docs;
  const external = (() => {
    try {
      return new URL(base, window.location.href).origin !== window.location.origin;
    } catch {
      return false;
    }
  })();
  const path = (to = "/") => {
    const clean = to === "/" ? "" : to.replace(/\/+$/, "");
    if (external) return `${base}${clean}`;
    // Same origin: keep it a router path so the page doesn't reload.
    try {
      return `${new URL(base, window.location.href).pathname.replace(/\/+$/, "")}${clean}` || "/";
    } catch {
      return `/docs${clean}`;
    }
  };
  return { path, external };
}

export function DocsLink({ to = "/", className, children, target }: { to?: string; className?: string; children: ReactNode; target?: string }) {
  const { path, external } = useDocs();
  const href = path(to);
  if (external || target) {
    return (
      <a href={href} className={className} target={target} rel={target === "_blank" ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}
