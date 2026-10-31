import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { buildSpec, scopedRoutes } from "./openapi";
import { scopeFor } from "../auth/tokens";

const app = createApp();
const routes = scopedRoutes(app);
const spec = buildSpec(app) as { paths: Record<string, Record<string, any>> };

/** The route as OpenAPI names it: /api/orgs/{org}/projects/{project}. */
const asUrl = (path: string) => `/api/orgs/{org}${path === "/" ? "" : path}`.replace(/:(\w+)/g, "{$1}");

describe("the API description", () => {
  it("covers every endpoint the router actually serves", () => {
    const missing = routes.filter((key) => {
      const [method, path] = key.split(" ");
      return !spec.paths[asUrl(path)]?.[method.toLowerCase()];
    });
    expect(missing, "undocumented endpoints: add them to server/api/openapi.ts").toEqual([]);
  });

  it("describes nothing that isn't served, so the reference can't outlive the code", () => {
    const served = new Set(
      routes.map((key) => {
        const [method, path] = key.split(" ");
        return `${method.toLowerCase()} ${asUrl(path)}`;
      }),
    );
    const described: string[] = [];
    for (const [url, methods] of Object.entries(spec.paths)) for (const method of Object.keys(methods)) described.push(`${method} ${url}`);
    expect(described.filter((d) => !served.has(d))).toEqual([]);
  });

  it("states the same scope the middleware enforces", () => {
    for (const key of routes) {
      const [method, path] = key.split(" ");
      const operation = spec.paths[asUrl(path)]?.[method.toLowerCase()];
      if (!operation) continue;
      const enforced = scopeFor(method, path);
      if (enforced === "session") {
        expect(operation["x-issueit-session-only"], key).toBe(true);
        expect(operation.security, key).toEqual([{ session: [] }]);
      } else {
        expect(operation["x-issueit-scope"], key).toBe(enforced);
      }
    }
  });

  it("leaves no endpoint closed to tokens by accident", () => {
    // "closed" means no rule covers it, which refuses every token. That is the
    // right default for a new route, and the wrong state to ship in.
    const closed = routes.filter((key) => {
      const [method, path] = key.split(" ");
      return scopeFor(method, path) === "closed";
    });
    expect(closed, "these endpoints refuse every token; decide what they cost in server/auth/tokens.ts").toEqual([]);
  });

  it("is a usable OpenAPI 3.1 document", () => {
    const doc = spec as unknown as { openapi: string; info: { title: string }; components: { securitySchemes: Record<string, unknown> } };
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBeTruthy();
    expect(Object.keys(doc.components.securitySchemes)).toContain("token");
    for (const [url, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.operationId, `${method} ${url}`).toMatch(/^[a-z][A-Za-z0-9]+$/);
        expect(operation.summary, `${method} ${url}`).toBeTruthy();
        // Every path placeholder has a parameter describing it.
        for (const [, name] of url.matchAll(/\{(\w+)\}/g)) {
          expect(operation.parameters.some((p: any) => p.in === "path" && p.name === name), `${method} ${url} is missing the ${name} parameter`).toBe(true);
        }
      }
    }
  });
});
