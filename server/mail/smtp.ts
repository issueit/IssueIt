import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import { config } from "../config";
import { isPrivateAddress } from "../lib/ssrf";
import { IntegrationError } from "../integrations/http";
import type { MailMessage } from "../integrations/catalogue/notify";

/**
 * Sending through an SMTP server given as a URL:
 *   smtps://user:password@smtp.example.com:465   (TLS from the start)
 *   smtp://user:password@smtp.example.com:587    (STARTTLS when offered)
 * Servers people type in go through the same private-address check as
 * webhooks; the operator's own SMTP_URL is trusted.
 */

type Parsed = { host: string; port: number; secure: boolean; user?: string; pass?: string };

export function parseSmtpUrl(raw: string): Parsed {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new IntegrationError("Enter the server as a URL, like smtps://user:password@smtp.example.com:465.", { retryable: false });
  }
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") throw new IntegrationError("The server URL starts with smtp:// or smtps://.", { retryable: false });
  if (!url.hostname) throw new IntegrationError("The server URL needs a host name.", { retryable: false });
  const secure = url.protocol === "smtps:";
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    pass: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

/** Resolves the host once and refuses private addresses, so the connection goes where the check said. */
async function publicAddress(host: string): Promise<string> {
  if (config.webhookAllowPrivate) return host;
  if (host === "localhost" || /\.(localhost|internal|local)$/.test(host)) throw new IntegrationError("Local and internal mail servers aren't allowed.", { retryable: false });
  let address = host;
  if (!net.isIP(host)) {
    try {
      address = (await dns.lookup(host)).address;
    } catch {
      throw new IntegrationError(`Couldn't find the mail server ${host}.`, { retryable: true });
    }
  }
  if (isPrivateAddress(address)) throw new IntegrationError("Mail servers on private networks aren't allowed.", { retryable: false });
  return address;
}

function transportFor(p: Parsed, address: string) {
  return nodemailer.createTransport({
    host: address,
    port: p.port,
    secure: p.secure,
    auth: p.user ? { user: p.user, pass: p.pass ?? "" } : undefined,
    // Certificates are checked against the name, not the address connected to.
    tls: net.isIP(p.host) ? undefined : { servername: p.host },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

/** Turns nodemailer's failures into sentences, and says whether trying again could help. */
function describe(err: unknown, host: string): IntegrationError {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  if (e.code === "EAUTH") return new IntegrationError(`${host} rejected the username or password.`, { retryable: false, reconnect: true });
  if (e.responseCode && e.responseCode >= 500)
    return new IntegrationError(`${host} refused the email: "${String(e.response ?? e.message).slice(0, 160)}".`, { retryable: false, status: e.responseCode });
  if (e.responseCode && e.responseCode >= 400) return new IntegrationError(`${host} asked Issueit to try later. Issueit will try again.`, { retryable: true, status: e.responseCode });
  if (e.code === "ETIMEDOUT" || e.code === "ESOCKET" || e.code === "ECONNECTION" || e.code === "EDNS")
    return new IntegrationError(`Couldn't reach the mail server ${host}.`, { retryable: true });
  return new IntegrationError(`The mail server ${host} didn't send the email.`, { retryable: true });
}

export async function smtpSend(rawUrl: string, msg: MailMessage, opts: { trusted?: boolean } = {}): Promise<{ id?: string }> {
  const p = parseSmtpUrl(rawUrl);
  const address = opts.trusted ? p.host : await publicAddress(p.host);
  const transport = transportFor(p, address);
  try {
    const info = await transport.sendMail({
      from: msg.from,
      to: msg.to,
      replyTo: msg.replyTo ?? undefined,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: msg.headers,
    });
    return { id: info.messageId };
  } catch (err) {
    throw describe(err, p.host);
  } finally {
    transport.close();
  }
}

/** Connects and signs in without sending anything. */
export async function smtpVerify(rawUrl: string): Promise<void> {
  const p = parseSmtpUrl(rawUrl);
  const transport = transportFor(p, await publicAddress(p.host));
  try {
    await transport.verify();
  } catch (err) {
    throw describe(err, p.host);
  } finally {
    transport.close();
  }
}

export const smtpHost = (rawUrl: string) => {
  try {
    return parseSmtpUrl(rawUrl).host;
  } catch {
    return "SMTP";
  }
};
