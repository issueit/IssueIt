import { describe, expect, it } from "vitest";
import { createApp } from "../app";

const app = createApp();

/**
 * /mcp is two things at one address: the protocol endpoint for agents, and
 * the page about it for people. The method and the token tell them apart.
 */
describe("the MCP endpoint", () => {
  it("leaves a browser's GET to the site rather than answering 401", async () => {
    const res = await app.fetch(new Request("http://localhost/mcp", { headers: { accept: "text/html" } }));
    expect(res.status).not.toBe(401);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("still refuses a call that speaks the protocol without a token", async () => {
    const res = await app.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: -32001 } });
  });
});
