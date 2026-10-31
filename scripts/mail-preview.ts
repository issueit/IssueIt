/**
 * Renders every email Issueit sends into ./tmp/mail/, with an index.
 *
 *   node_modules/.bin/tsx scripts/mail-preview.ts
 *
 * Nothing here touches the database: the templates take a kind and a context,
 * which is the whole reason the rendering lives apart from the queue.
 */
import fs from "node:fs";
import path from "node:path";

// Read .env before anything imports the config, so the preview carries the
// install's real URLs and sender rather than localhost.
try {
  process.loadEnvFile(".env");
} catch {
  process.env.APP_URL ??= "https://dash.issueit.app";
}
process.env.MAIL_PERSONAL_FROM ??= "Christian Relf <christian@issueit.app>";

const { noticeKinds } = await import("../server/db/schema");
type NoticeKind = (typeof noticeKinds)[number];
const { renderNotice } = await import("../server/mail/copy");
const { renderReporterEmail } = await import("../server/mail/templates");
type Rendered = { subject: string; html: string; text: string };

const out = path.resolve("tmp/mail");
fs.mkdirSync(out, { recursive: true });

const url = (p: string) => `https://dash.issueit.app${p}`;

const CONTEXT: Record<NoticeKind, Record<string, unknown>> = {
  welcome: { name: "Christian Relf", url: url("/") },
  personal: { name: "Christian Relf" },
  "password-reset": { email: "christian@example.com", url: url("/reset?token=9f2c41a8d7b64e0fa1c3"), minutes: 60 },
  "password-changed": { email: "christian@example.com", ip: "81.134.22.9", at: new Date("2026-10-31T19:40:00Z").toISOString(), url: url("/forgot") },
  "verify-email": { email: "christian@example.com", url: url("/verify?token=4ad91c77e0b24f3a") },
  invitation: { invitedBy: "Maya Okafor", orgName: "Northwind", role: "member", url: url("/invitations/inv_8812?token=b7d1") },
  report: {
    title: "Checkout button does nothing on the payment step",
    number: 412,
    priority: "critical",
    projectName: "Northwind Web",
    page: "https://northwind.example.com/checkout/payment",
    reporter: "sam@northwind.example.com",
    url: url("/projects/prj_31/reports/rep_412"),
  },
  "delivery-failed": {
    number: 412,
    title: "Checkout button does nothing on the payment step",
    priority: "critical",
    projectName: "Northwind Web",
    destinationName: "Linear · Engineering",
    reason: "Linear refused the issue: team \"ENG\" no longer exists. Gave up after 8 attempts.",
    attempts: 8,
    url: url("/projects/prj_31/reports/rep_412"),
  },
  pipeline: {
    destinationName: "GitHub · northwind/web",
    projectName: "Northwind Web",
    reason: "Paused automatically after 5 failed deliveries in a row. Last error: the token no longer has access to that repository.",
    url: url("/projects/prj_31/integrations"),
  },
  digest: {
    orgName: "Northwind",
    period: "day",
    counts: { created: 14, resolved: 9, failed: 1, refused: 0 },
    items: [
      { title: "Checkout button does nothing on the payment step", hint: "Critical · Northwind Web · 3 people reported this", url: url("/projects/prj_31/reports/rep_412") },
      { title: "Search returns nothing for two-word queries", hint: "High · Northwind Web", url: url("/projects/prj_31/reports/rep_409") },
      { title: "Date picker shows February twice", hint: "Low · Northwind Admin", url: url("/projects/prj_32/reports/rep_404") },
    ],
    url: url("/"),
  },
  "limit-warning": { orgName: "Northwind", percent: 80, used: 1600, limit: 2000, url: url("/settings/billing") },
  "limit-reached": { orgName: "Northwind", used: 2000, limit: 2000, refused: 37, url: url("/settings/billing") },
  "trial-ending": { orgName: "Northwind", days: 3, plan: "Team", url: url("/settings/billing") },
  "payment-problem": { orgName: "Northwind", problem: "Your card was declined (insufficient funds).", url: url("/settings/billing") },
};

/** A project as the templates see one: the widget's branding is the email's branding. */
const project = (over: Record<string, unknown> = {}) => ({
  id: "prj_31",
  name: "Northwind",
  widget: { brandName: "Northwind", accent: "#1c1c1c", poweredBy: true, ...over },
});
const report = { number: 412, title: "Checkout button does nothing on the payment step", createdAt: new Date("2026-10-29T10:12:00Z"), groupId: null };
const settings = { enabled: true, receipt: true, resolved: true, sender: "issueit", fromName: "Northwind", replyTo: "", receiptMessage: "", resolvedMessage: "", connectionId: null } as never;

const made: Array<{ file: string; label: string; group: string; rendered: Rendered }> = [];
const add = (file: string, label: string, group: string, rendered: Rendered) => {
  fs.writeFileSync(path.join(out, `${file}.html`), rendered.html);
  fs.writeFileSync(path.join(out, `${file}.txt`), `Subject: ${rendered.subject}\n\n${rendered.text}`);
  made.push({ file, label, group, rendered });
};

for (const kind of noticeKinds) add(kind, kind, kind === "personal" ? "From a person" : "Issueit's own email", renderNotice(kind, CONTEXT[kind]));
add("reporter-receipt", "receipt (reporter)", "A customer's brand", renderReporterEmail("receipt", { project: project(), report, settings, stopUrl: url("/e/eml_1/stop?sig=x") }));
add("reporter-resolved", "resolved (reporter)", "A customer's brand", renderReporterEmail("resolved", { project: project(), report, settings, stopUrl: url("/e/eml_1/stop?sig=x") }));
add(
  "reporter-receipt-brandy",
  "receipt (own accent and message)",
  "A customer's brand",
  renderReporterEmail("receipt", {
    project: project({ brandName: "Kettle & Co", accent: "#1f6f4a" }),
    report,
    settings: { ...(settings as object), receiptMessage: "We read every one of these ourselves.\n\nIf it's urgent, reply to this email and it comes straight to the team." } as never,
    stopUrl: url("/e/eml_1/stop?sig=x"),
  }),
);

const index = `<!doctype html><meta charset="utf-8"><title>Issueit email</title>
<style>
  body { margin:0; background:#0c0c0d; color:#f3f3f4; font: 14px/1.5 -apple-system, system-ui, sans-serif; padding:28px }
  h1 { font-size:18px; margin:0 0 4px } p.sub { color:#8f8f96; margin:0 0 26px }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#8f8f96; margin:30px 0 12px; font-weight:600 }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:18px }
  .cell { border:1px solid #262628; border-radius:12px; overflow:hidden; background:#151517 }
  .cap { padding:10px 12px; border-bottom:1px solid #262628; font-size:12px }
  .cap b { font-weight:600 } .cap span { color:#8f8f96 }
  iframe { width:100%; height:520px; border:0; background:#fff; display:block }
</style>
<h1>Issueit email</h1><p class="sub">${made.length} templates · ${new Date().toISOString().slice(0, 10)}</p>
${["Issueit's own email", "From a person", "A customer's brand"]
  .map(
    (group) => `<h2>${group}</h2><div class="grid">${made
      .filter((m) => m.group === group)
      .map((m) => `<div class="cell"><div class="cap"><b>${m.label}</b><br><span>${m.rendered.subject.replace(/</g, "&lt;")}</span></div><iframe src="${m.file}.html" loading="lazy"></iframe></div>`)
      .join("")}</div>`,
  )
  .join("")}`;
fs.writeFileSync(path.join(out, "index.html"), index);
console.log(`${made.length} templates → ${out}/index.html`);
