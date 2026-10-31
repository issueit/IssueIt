import { describe, expect, it } from "vitest";
import { actionFor, scopeCheck, tokenPrefix } from "./tokens";
import { agentScopes, ownerOnlyScopes, scopes } from "../db/schema";
import type { Scope } from "../db/schema";

const ask = (method: string, path: string, granted: Scope[], fence: string[] | null = null, project?: string) =>
  scopeCheck({ method, path, scopes: granted, projectIds: fence, project });

describe("token scopes", () => {
  it("lets a token do what it was granted and no more", () => {
    expect(ask("GET", "/reports", ["reports:read"])).toBeNull();
    expect(ask("PATCH", "/reports/rep_x", ["reports:read"])).toMatch(/reports:write/);
    expect(ask("PATCH", "/reports/rep_x", ["reports:read", "reports:write"])).toBeNull();
  });

  it("refuses endpoints no rule covers, so a new one is closed until it's considered", () => {
    expect(ask("GET", "/something-new", [...scopes])).toMatch(/can't reach/);
  });

  it("never lets a token mint or revoke another token", () => {
    expect(ask("GET", "/tokens", [...scopes])).toMatch(/signed in to the dashboard/);
    expect(ask("POST", "/tokens", [...scopes])).toMatch(/signed in to the dashboard/);
    expect(ask("DELETE", "/tokens/akt_x", [...scopes])).toMatch(/signed in to the dashboard/);
  });

  it("charges the scope that matches the cost of the request", () => {
    // Ingest keys are a separate, higher bar than project settings.
    expect(ask("POST", "/projects/prj_x/keys", ["projects:write"])).toMatch(/keys:write/);
    expect(ask("GET", "/projects/prj_x/keys", ["projects:read"])).toBeNull();
    // Reading a connection's repositories is a read, even though it's a POST.
    expect(ask("POST", "/connections/con_x/validate", ["connections:read"])).toBeNull();
    expect(ask("POST", "/connections", ["connections:read"])).toMatch(/connections:write/);
    // A destination's webhook secret is revealed, which is write-level trust.
    expect(ask("POST", "/projects/prj_x/destinations/dst_y/reveal", ["destinations:read"])).toMatch(/destinations:write/);
  });

  it("asks only for authentication where there is nothing to protect", () => {
    expect(ask("GET", "/whoami", [])).toBeNull();
  });

  it("gives a reports-only agent the loop from bug to fix", () => {
    const agent = [...agentScopes];
    expect(ask("GET", "/reports", agent)).toBeNull();
    expect(ask("GET", "/reports/rep_x", agent)).toBeNull();
    // It can mark a bug fixed, which is the point of giving it to an agent.
    expect(ask("PATCH", "/reports/rep_x", agent)).toBeNull();
    expect(ask("GET", "/deliveries", agent)).toBeNull();
    // But it can't change where reports go, or who is in the organisation.
    expect(ask("POST", "/projects/prj_x/destinations", agent)).toMatch(/destinations:write/);
    expect(ask("POST", "/invitations", agent)).toMatch(/org:write/);
    expect(ask("POST", "/deliveries/dlv_x/retry", agent)).toMatch(/deliveries:write/);
    expect(ask("PATCH", "/", agent)).toMatch(/org:write/);
  });

  it("keeps owner-only scopes out of the suggested agent set", () => {
    for (const scope of ownerOnlyScopes) expect(agentScopes).not.toContain(scope);
  });
});

describe("a token fenced to some projects", () => {
  const fence = ["prj_a"];

  it("can't read figures that cover the whole organisation", () => {
    expect(ask("GET", "/usage", ["analytics:read"], fence)).toMatch(/organisation-wide/);
    expect(ask("GET", "/events", ["reports:read"], fence)).toMatch(/organisation-wide/);
    expect(ask("GET", "/usage", ["analytics:read"], null)).toBeNull();
  });

  it("must name the project when it asks for analytics", () => {
    expect(ask("GET", "/analytics", ["analytics:read"], fence)).toMatch(/name the project/);
    expect(ask("GET", "/analytics", ["analytics:read"], fence, "prj_b")).toMatch(/doesn't have access/);
    expect(ask("GET", "/analytics", ["analytics:read"], fence, "prj_a")).toBeNull();
  });

  it("sees nothing at all when the fence is empty", () => {
    expect(ask("GET", "/analytics", ["analytics:read"], [], "prj_a")).toMatch(/doesn't have access/);
  });
});

describe("the audit trail", () => {
  it("names the thing that changed, not the path it came in on", () => {
    expect(actionFor("PATCH", "/projects/prj_x/destinations/dst_y")).toBe("destination.update");
    expect(actionFor("POST", "/projects/prj_x/keys")).toBe("key.create");
    expect(actionFor("DELETE", "/reports/rep_x")).toBe("report.delete");
    expect(actionFor("PATCH", "/")).toBe("organisation.update");
    expect(actionFor("POST", "/tokens")).toBe("token.create");
  });
});

describe("token secrets", () => {
  it("shows enough of a token to tell two apart, and no more", () => {
    const prefix = tokenPrefix("ak_live_abcdefghijklmnop");
    expect(prefix).toBe("ak_live_abcd");
    expect(prefix.length).toBeLessThan("ak_live_abcdefghijklmnop".length);
  });
});
