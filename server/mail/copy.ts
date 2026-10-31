import { config } from "../config";
import type { NoticeKind } from "../db/schema";
import { layout, type Block, type FooterLine, type Rendered } from "./shell";

/**
 * What every Issueit email says. Nothing in here touches the database or the
 * network: a kind and a context go in, a rendered email comes out, which is
 * what makes `scripts/mail-preview.mjs` and the tests possible.
 *
 * House style, because email is the only part of Issueit that turns up
 * uninvited: say the thing, say what to do about it, and stop. One button.
 * No exclamation marks, no "we're excited", no chasing.
 */

const dash = (path = "") => `${config.appUrl}${path}`;
const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const firstName = (name?: string) => (name ?? "").trim().split(/\s+/)[0] || "there";

const when = (at?: string | Date) => {
  const d = at ? new Date(at) : new Date();
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
};

const sentBy: FooterLine = { text: "Sent by Issueit ·", link: { label: host(config.appUrl), url: config.appUrl } };
const prefs: FooterLine = { text: "You're getting this because of your notification settings.", link: { label: "Change them", url: dash("/settings/notifications") } };
const docs: FooterLine = { text: "Documentation:", link: { label: host(config.docsUrl), url: config.docsUrl } };

/** The display name on the personal note, taken from the address it's sent from. */
export const personalName = () => /^\s*"?([^"<]+?)"?\s*</.exec(config.smtp.personalFrom)?.[1]?.trim() || "Christian";
export const personalAddress = () => /<([^>]+)>/.exec(config.smtp.personalFrom)?.[1]?.trim() || config.smtp.personalFrom;

/** Everything a notice can say. Context is whatever the queueing side put in. */
export function renderNotice(kind: NoticeKind, ctx: Record<string, any>): Rendered {
  switch (kind) {
    /* ------------------------------------------------------------ account */

    case "verify-email":
      return layout({
        subject: "Confirm your email address",
        preview: "One link, and Issueit can reach you.",
        eyebrow: "Account",
        heading: "Confirm your email address",
        blocks: [
          { p: `Confirming ${ctx.email} lets Issueit send you password resets and the alerts you ask for. It takes one click.` },
          { button: { label: "Confirm this address", url: ctx.url, plain: true } },
          { note: "The link works once and expires in 24 hours." },
        ],
        footer: [sentBy],
      });

    case "welcome":
      return layout({
        subject: "Welcome to Issueit",
        preview: "Three things to do, and then you can forget about it.",
        eyebrow: "Getting started",
        heading: "Issueit is ready",
        blocks: [
          {
            p: `Your address is confirmed, ${firstName(ctx.name)}. Issueit takes a bug report from someone using your product — with the screenshot, the console, the network calls, the browser and the page already attached — and delivers it to the tools your team works in.`,
          },
          { p: "Three things to do, in this order:" },
          {
            steps: [
              { title: "Make a project", hint: "One per product or site. It comes with its own key." },
              { title: "Add the reporter", hint: "One script tag, or the SDK if you'd rather. Your users get a button that captures everything." },
              { title: "Connect a destination", hint: "GitHub, Linear, Jira, Slack, a webhook — reports arrive as issues in the tool you already use, not as email to triage." },
            ],
          },
          { button: { label: "Open Issueit", url: ctx.url ?? dash() } },
          { note: "Issueit is quiet by default: past critical reports, it only emails you what you ask it to." },
        ],
        footer: [docs, sentBy],
      });

    /** The one email from a person rather than from the product. No card, no button, no logo. */
    case "personal":
      return layout({
        bare: true,
        subject: "What are you building?",
        preview: `A note from ${personalName()} at Issueit — replies come straight to me.`,
        heading: "",
        blocks: [
          { p: `Hello ${firstName(ctx.name)},` },
          { p: `I'm ${personalName()}. I made Issueit, and this address is mine — replies come to me rather than to a support queue.` },
          {
            p: "There's nothing to click here. I'm just curious: what are you building, and what sent you looking for something like Issueit? If it's missing the one thing you actually needed, that sentence is the most useful thing you could send me.",
          },
          { p: "Either way, thanks for trying it." },
          { signature: { name: personalName(), line: [personalAddress(), host(config.marketingUrl)].filter(Boolean).join(" · ") } },
        ],
        footer: [{ text: "You'll get this once, and only this once. Reply and it reaches a person." }],
      });

    case "password-reset":
      return layout({
        subject: "Reset your Issueit password",
        preview: `The link works once and expires in ${ctx.minutes ?? 60} minutes.`,
        eyebrow: "Account",
        heading: "Reset your password",
        blocks: [
          { p: `Someone asked to reset the password for ${ctx.email}. If that was you, choose a new one.` },
          { button: { label: "Choose a new password", url: ctx.url, plain: true } },
          { note: `The link works once and expires in ${ctx.minutes ?? 60} minutes. If it wasn't you, nothing has changed and you can ignore this.` },
        ],
        footer: [sentBy],
      });

    case "password-changed":
      return layout({
        subject: "Your Issueit password was changed",
        preview: "If that wasn't you, read this one.",
        eyebrow: "Security",
        heading: "Your password was changed",
        blocks: [
          { p: `The password for ${ctx.email} was changed, and everything that was signed in before has been signed out.` },
          { facts: [["When", when(ctx.at)], ...(ctx.ip ? ([["Asked for from", String(ctx.ip)]] as Array<[string, string]>) : [])] },
          { p: "If that was you, there's nothing to do. If it wasn't, reset the password now — and take a look at who else has access to your inbox." },
          { button: { label: "Reset the password", url: ctx.url ?? dash("/forgot") } },
        ],
        footer: [sentBy],
      });

    case "invitation":
      return layout({
        subject: `${ctx.invitedBy} invited you to ${ctx.orgName} on Issueit`,
        preview: `${ctx.invitedBy} has added you to ${ctx.orgName}.`,
        eyebrow: String(ctx.orgName ?? "Invitation"),
        heading: `You've been invited to ${ctx.orgName}`,
        blocks: [
          {
            p: `${ctx.invitedBy} has invited you to join ${ctx.orgName} on Issueit as ${ctx.role === "owner" ? "an owner" : "a member"}. Issueit collects bug reports from their product — screenshot, console and all — and delivers them to the tools the team already uses.`,
          },
          { button: { label: "Accept the invitation", url: ctx.url, plain: true } },
          { note: "The invitation expires in seven days. If you weren't expecting it, you can ignore it." },
        ],
        footer: [sentBy],
      });

    /* ------------------------------------------------------------ reports */

    case "report":
      return layout({
        subject: `[${ctx.projectName}] ${String(ctx.title).slice(0, 90)}`,
        preview: `A ${ctx.priority} report in ${ctx.projectName}${ctx.reporter ? `, from ${ctx.reporter}` : ""}.`,
        eyebrow: String(ctx.projectName ?? "Report"),
        heading: String(ctx.title),
        blocks: [
          { p: `A ${ctx.priority} report arrived in ${ctx.projectName}.` },
          {
            facts: [
              ["Report", `#${ctx.number}`],
              ["Priority", String(ctx.priority)],
              ...(ctx.page ? ([["Page", String(ctx.page)]] as Array<[string, string]>) : []),
              ...(ctx.reporter ? ([["Reported by", String(ctx.reporter)]] as Array<[string, string]>) : []),
            ],
          },
          { button: { label: "Open the report", url: ctx.url } },
        ],
        footer: [prefs, sentBy],
      });

    case "delivery-failed":
      return layout({
        subject: `Issueit couldn't deliver report #${ctx.number} to ${ctx.destinationName}`,
        preview: "The report is safe. The destination is the problem.",
        eyebrow: String(ctx.projectName ?? "Delivery"),
        heading: `A report didn't reach ${ctx.destinationName}`,
        blocks: [
          {
            p: `Issueit has the report and is keeping it — nothing was lost. But after ${plural(ctx.attempts ?? 1, "attempt")}, ${ctx.destinationName} still wouldn't take it, so Issueit has stopped trying.`,
          },
          { panel: { title: String(ctx.title), hint: `Report #${ctx.number}${ctx.priority ? ` · ${ctx.priority}` : ""}` } },
          { facts: [["What went wrong", String(ctx.reason ?? "The destination refused the report.")]] },
          { p: "Put the destination right and send it again from the report itself; the queue is still there." },
          { button: { label: "Open the report", url: ctx.url } },
        ],
        footer: [prefs, sentBy],
      });

    case "pipeline":
      return layout({
        subject: `Issueit paused ${ctx.destinationName}`,
        preview: "Reports are still being collected, and will go out once it works again.",
        eyebrow: String(ctx.projectName ?? "Delivery"),
        heading: `${ctx.destinationName} has been paused`,
        blocks: [
          {
            p: `Issueit stopped sending to ${ctx.destinationName} in ${ctx.projectName} because deliveries kept failing. Reports are still being collected, and will be delivered once it's working again.`,
          },
          { facts: [["Reason", String(ctx.reason ?? "Repeated failures")]] },
          { button: { label: "Look at the destination", url: ctx.url } },
        ],
        footer: [prefs, sentBy],
      });

    case "digest": {
      const period = ctx.period === "week" ? "week" : "day";
      const counts = ctx.counts ?? {};
      return layout({
        subject: `${ctx.orgName}: ${plural(counts.created ?? 0, "new report")} ${period === "week" ? "this week" : "yesterday"}`,
        preview: `${plural(counts.created ?? 0, "new report")}, ${plural(counts.resolved ?? 0, "resolved")}.`,
        eyebrow: String(ctx.orgName ?? "Digest"),
        heading: period === "week" ? "Your week on Issueit" : "Yesterday on Issueit",
        blocks: [
          {
            p: `${plural(counts.created ?? 0, "new report")} arrived, ${plural(counts.resolved ?? 0, "report")} ${(counts.resolved ?? 0) === 1 ? "was" : "were"} resolved${counts.failed ? `, and ${plural(counts.failed, "delivery")} failed` : ""}.`,
          },
          ...(ctx.items?.length ? [{ list: ctx.items } as Block] : [{ p: "Nothing needs you right now." } as Block]),
          ...(counts.refused
            ? [{ note: `${plural(counts.refused, "report")} ${counts.refused === 1 ? "was" : "were"} turned away because the plan's monthly allowance is used up.` } as Block]
            : []),
          { button: { label: "Open Issueit", url: ctx.url } },
        ],
        footer: [{ text: "You chose this digest.", link: { label: "Change or stop it", url: dash("/settings/notifications") } }, sentBy],
      });
    }

    /* ------------------------------------------------------------ the plan */

    case "limit-warning":
      return layout({
        subject: `You've used ${ctx.percent}% of this month's reports`,
        preview: `${ctx.used} of ${ctx.limit} used.`,
        eyebrow: "Plan",
        heading: `${ctx.orgName} has used ${ctx.percent}% of this month's reports`,
        blocks: [
          { facts: [["Used", `${ctx.used} of ${ctx.limit}`], ["Resets", "At the start of next month"]] },
          { p: "Issueit keeps accepting a little past the allowance. After that, new reports are turned away — which your users won't see, but you will." },
          { button: { label: "Look at the plans", url: ctx.url } },
        ],
        footer: [sentBy],
      });

    case "limit-reached":
      return layout({
        subject: "Issueit has started turning reports away",
        preview: "Your users are reporting bugs you aren't seeing.",
        eyebrow: "Plan",
        heading: `${ctx.orgName} has used up this month's reports`,
        blocks: [
          {
            p: `${ctx.used} of ${ctx.limit} reports have been used, and ${ctx.refused ? plural(ctx.refused, "report") : "new reports"} ${ctx.refused === 1 ? "has" : "have"} been turned away. Your users are reporting bugs you aren't seeing.`,
          },
          { button: { label: "Change plan", url: ctx.url } },
          { note: "The allowance resets at the start of next month, and nothing already collected is affected." },
        ],
        footer: [sentBy],
      });

    case "trial-ending":
      return layout({
        subject: ctx.days > 0 ? `Your Issueit trial ends in ${plural(ctx.days, "day")}` : "Your Issueit trial has ended",
        preview: ctx.days > 0 ? "Doing nothing moves you to Free, which keeps working." : "Everything is still here, on a smaller allowance.",
        eyebrow: "Plan",
        heading: ctx.days > 0 ? `Your trial ends in ${plural(ctx.days, "day")}` : "Your trial has ended",
        blocks: [
          {
            p:
              ctx.days > 0
                ? `${ctx.orgName} is on the ${ctx.plan} plan until then. Choosing a plan now keeps everything as it is; doing nothing moves you to Free, which carries on collecting reports with a smaller allowance.`
                : `${ctx.orgName} has moved to the Free plan. Your projects, destinations and reports are all still here, with a smaller monthly allowance.`,
          },
          { button: { label: "Look at the plans", url: ctx.url } },
        ],
        footer: [sentBy],
      });

    case "payment-problem":
      return layout({
        subject: "Issueit couldn't take your payment",
        preview: "Nothing has changed yet. Updating the card settles it.",
        eyebrow: "Billing",
        heading: "Your last payment didn't go through",
        blocks: [
          { p: `${ctx.orgName}'s subscription couldn't be charged. Nothing has changed yet, and Issueit is still collecting your reports. Updating the card settles it.` },
          ...(ctx.problem ? [{ facts: [["What the bank said", String(ctx.problem)]] } as Block] : []),
          { button: { label: "Update payment details", url: ctx.url } },
        ],
        footer: [sentBy],
      });
  }
}
