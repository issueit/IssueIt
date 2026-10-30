import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sends a report through every catalogue integration with the network
 * replaced, and checks each builds a well-formed request. It can't prove a
 * service accepts the request; it catches broken URLs, missing fields and
 * bodies that don't serialise.
 */

type Sent = { service: string; url: string; init: Record<string, any> };
const sent: Sent[] = [];

/** Answers every property with itself, so any response shape reads without throwing. Error-ish keys stay empty. */
const quiet = new Set(["error", "errors", "error_code", "errcode", "error_message", "code", "ErrorCode", "FailedEntryCount", "Status", "then"]);
const universal: any = new Proxy(function () {}, {
  get(_t, key) {
    if (key === Symbol.toPrimitive) return () => "1";
    if (typeof key === "symbol" || quiet.has(key)) return undefined;
    if (key === "status") return "0";
    if (key === "toLowerCase" || key === "toUpperCase" || key === "trim") return () => "1";
    return universal;
  },
  apply: () => universal,
});

vi.mock("../http", async (original) => {
  const real = await original<typeof import("../http")>();
  return {
    ...real,
    request: vi.fn(async (service: string, url: string, init: Record<string, any> = {}) => {
      sent.push({ service, url, init });
      return { status: 200, data: universal, text: "", headers: new Headers({ "resource-id": "42", "x-message-id": "m1" }) };
    }),
  };
});

const { catalogue } = await import("./index");
const { describeProvider } = await import("../index");
const { testReport } = await import("../../delivery/payload");
const { categories } = await import("../types");

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const serviceAccount = JSON.stringify({ client_email: "issueit@acme.iam.gserviceaccount.com", private_key: privateKey, project_id: "acme" });

/** Webhook URLs on each service's own hosts. */
const hooks: Record<string, string> = {
  teams: "https://prod-01.westeurope.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=x",
  powerautomate: "https://prod-01.westeurope.logic.azure.com/workflows/abc",
  googlechat: "https://chat.googleapis.com/v1/spaces/x/messages?key=y&token=z",
  pumble: "https://api.pumble.com/workspaces/x/incomingWebhooks/postMessage/y",
  flock: "https://api.flock.com/hooks/sendMessage/x",
  chanty: "https://hooks.chanty.com/x",
  twist: "https://twist.com/api/v3/integration_incoming/post_data?install_id=1&install_token=x",
  basecamp: "https://3.basecamp.com/1/integrations/x/buckets/1/chats/1/lines",
  ringcentral: "https://hooks.ringcentral.com/webhook/v2/x",
  dingtalk: "https://oapi.dingtalk.com/robot/send?access_token=x",
  wecom: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x",
  feishu: "https://open.feishu.cn/open-apis/bot/v2/hook/x",
  lark: "https://open.larksuite.com/open-apis/bot/v2/hook/x",
  zoom: "https://integrations.zoom.us/chat/webhooks/incomingwebhook/x",
  squadcast: "https://api.squadcast.com/v2/incidents/api/x",
  zapier: "https://hooks.zapier.com/hooks/catch/1/x",
  make: "https://hook.eu2.make.com/x",
  pipedream: "https://abc.m.pipedream.net",
  workato: "https://webhooks.workato.com/webhooks/rest/x",
  tray: "https://abc.trayapp.io",
};

function sample(providerId: string, category: string, key: string): string {
  if (key === "url") return hooks[providerId] ?? "https://example.com";
  if (key === "serviceAccount") return serviceAccount;
  if (key === "connection") return "Endpoint=sb://acme.servicebus.windows.net/;SharedAccessKeyName=send;SharedAccessKey=abc;EntityPath=bugs";
  if (key === "endpoint") return "https://bugs.uksouth-1.eventgrid.azure.net/api/events";
  if (key === "region") return "eu-west-2";
  if (key === "repo") return "acme/web";
  if (key === "from") return category === "email" ? "Issueit <bugs@example.com>" : "+447700900123";
  if (key === "to") return category === "email" ? "dev@example.com, ops@example.com" : "+447700900456";
  if (key === "email" || key === "user" || key === "bot") return "bot@example.com";
  if (["domain", "site", "instance", "space", "subdomain"].includes(key)) return "acme.example.com";
  if (key === "topic") return providerId === "sns" ? "arn:aws:sns:eu-west-2:123456789012:bugs" : "bugs";
  if (key === "queue") return providerId === "sqs" ? "https://sqs.eu-west-2.amazonaws.com/123456789012/bugs" : "q1";
  if (["project", "board", "list", "section", "sheet", "table", "tracker", "folder", "author", "ticketType", "mailbox", "account", "cluster"].includes(key)) return "123";
  return `${key}-value`;
}

beforeEach(() => {
  sent.length = 0;
});

describe("integration catalogue", () => {
  it("adds at least a hundred integrations with unique ids", () => {
    const ids = catalogue.map((p) => p.id);
    expect(catalogue.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(catalogue.map((p) => [p.id, p] as const))("%s describes itself properly", (_id, p) => {
    expect(categories).toContain(p.category);
    expect(p.summary).toMatch(/^[A-Z].*\.$/);
    expect(p.name).not.toMatch(/^\s|\s$/);
    const keys = [...(p.tokenFields ?? []), ...(p.targetFields ?? [])].map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of [...(p.tokenFields ?? []), ...(p.targetFields ?? [])]) {
      expect(f.label).toMatch(/^[A-Z0-9a-z]/);
      if (f.hint) expect(f.hint).toMatch(/\.$/);
    }
    expect(describeProvider(p).tokenFields.length).toBeGreaterThan(0);
  });

  it.each(catalogue.map((p) => [p.id, p] as const))("%s builds a well-formed request", async (_id, p) => {
    const creds = Object.fromEntries((p.tokenFields ?? []).map((f) => [f.key, sample(p.id, p.category, f.key)]));
    const target = Object.fromEntries((p.targetFields ?? []).map((f) => [f.key, sample(p.id, p.category, f.key)]));
    const report = { ...testReport({ id: "prj_1", name: "Website" }), reporter: { email: "sam@example.com", name: "Sam" }, priority: "critical" as const };
    const connected = await p.connectWithToken!(creds);
    expect(connected.account.label).toBeTruthy();
    sent.length = 0;
    await p.deliver({
      deliveryId: "dlv_1",
      event: "report.created",
      report,
      target,
      connection: { id: "con_1", account: connected.account, credentials: connected.credentials, accessToken: async () => "" },
      secrets: null,
      payload: null,
      isTest: false,
    });
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.url).not.toMatch(/undefined|\[object|null/);
      expect(s.init.untrusted).toBe(true);
      const body = s.init.json !== undefined ? JSON.stringify(s.init.json) : (s.init.body ?? JSON.stringify(s.init.form ?? {}));
      expect(body).not.toMatch(/\[object Object\]/);
    }
    const last = sent[sent.length - 1];
    expect(last.init.method ?? "GET").not.toBe("GET");
  });
});

describe("AWS Signature Version 4", () => {
  it("matches AWS's published example", async () => {
    const { signV4 } = await import("./signing");
    // From the AWS General Reference: IAM ListUsers, 2015-08-30.
    const auth = signV4({
      service: "iam",
      region: "us-east-1",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      method: "GET",
      path: "/",
      query: "Action=ListUsers&Version=2010-05-08",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", Host: "iam.amazonaws.com", "X-Amz-Date": "20150830T123600Z" },
      body: "",
      amzDate: "20150830T123600Z",
    });
    expect(auth).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
    );
  });
});
