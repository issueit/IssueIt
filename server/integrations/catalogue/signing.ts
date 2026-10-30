import { createHash, createHmac, createSign } from "node:crypto";
import { IntegrationError } from "../http";
import { call } from "./define";

/* ------------------------------------------------------------------ AWS Signature Version 4 */

const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

/** The SigV4 Authorization header for a request. Pure, so it can be checked against AWS's examples. */
export function signV4(o: {
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  method: string;
  path: string;
  query?: string;
  headers: Record<string, string>;
  body: string;
  amzDate: string;
}) {
  const day = o.amzDate.slice(0, 8);
  const headers = lower(o.headers);
  const names = Object.keys(headers).sort();
  const canonical = [o.method, o.path, o.query ?? "", ...names.map((n) => `${n}:${headers[n].trim()}`), "", names.join(";"), sha256(o.body)].join("\n");
  const scope = `${day}/${o.region}/${o.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", o.amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${o.secretAccessKey}`, day), o.region), o.service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

/** Signs and sends a request to an AWS service with an access key. */
export async function awsRequest(opts: {
  service: string;
  /** Shown in errors, e.g. "Amazon SNS". */
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  method?: string;
  host: string;
  path?: string;
  headers?: Record<string, string>;
  body: string;
}) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const method = opts.method ?? "POST";
  const path = opts.path ?? "/";
  const headers = { ...lower(opts.headers ?? {}), "x-amz-date": amzDate };
  const authorization = signV4({ ...opts, method, path, headers: { ...headers, host: opts.host }, amzDate });
  return call(opts.name, `https://${opts.host}${path}`, { method, body: opts.body, headers: { ...headers, authorization } });
}

const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

/* ------------------------------------------------------------------ Google service accounts */

type ServiceAccount = { client_email: string; private_key: string; project_id?: string; token_uri?: string };

export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  try {
    const sa = JSON.parse(raw ?? "") as ServiceAccount;
    if (sa.client_email && sa.private_key) return sa;
  } catch {
    // fall through
  }
  throw new IntegrationError("Paste the whole service account key file, the JSON that starts with {.", { retryable: false });
}

const tokens = new Map<string, { token: string; expires: number }>();
const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** Exchanges a service account key for an access token, cached until shortly before it expires. */
export async function googleToken(raw: string | undefined, scope: string): Promise<string> {
  const sa = parseServiceAccount(raw);
  const cacheKey = `${sa.client_email} ${scope}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = "https://oauth2.googleapis.com/token";
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope, aud: tokenUri, iat: now, exp: now + 3600 }))}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  } catch {
    throw new IntegrationError("The service account's private key couldn't be read. Download a new key and paste it again.", { retryable: false });
  }
  const { data } = await call("Google", tokenUri, { method: "POST", form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` } });
  tokens.set(cacheKey, { token: data.access_token, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

/* ------------------------------------------------------------------ Azure shared access signatures */

/** A Service Bus or Event Hubs SAS token for a resource URI, valid for an hour. */
export function azureSas(resourceUri: string, keyName: string, key: string) {
  const encoded = encodeURIComponent(resourceUri.toLowerCase());
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const sig = createHmac("sha256", key).update(`${encoded}\n${expiry}`, "utf8").digest("base64");
  return `SharedAccessSignature sr=${encoded}&sig=${encodeURIComponent(sig)}&se=${expiry}&skn=${encodeURIComponent(keyName)}`;
}
