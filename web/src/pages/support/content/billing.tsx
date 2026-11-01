import { C, Doc, H2, H3, More, Note, Step, Steps, Table, UI } from "../kit";
import type { Article } from "../types";

/**
 * Plans, allowances and invoices: the articles that only mean anything on
 * the hosted service. A self-hosted install has no plan to change and no
 * allowance to run out of, so these are registered through web/src/hosted.tsx
 * and are absent from the open edition rather than describing a page that
 * isn't there.
 */

export const billingArticles: Article[] = [
  {
    slug: "change-or-cancel-your-plan",
    title: "Change or cancel your plan",
    summary: "Upgrade, downgrade, switch to yearly, find your invoices, or stop paying — all from the billing page.",
    category: "billing",
    appliesTo: ["Issueit hosted service"],
    id: "IT5001",
    updated: "31 October 2026",
    keywords: "upgrade downgrade cancel subscription invoice receipt vat card payment failed yearly monthly trial",
    related: ["you-have-used-your-monthly-report-allowance", "delete-a-report-project-or-organisation"],
    body: () => (
      <>
        <Note>
          <p>This applies to the hosted service at issueit.app. A self-hosted install has no plans and no billing: every feature is on and the limits are whatever its operator sets.</p>
        </Note>

        <H2>Change plan</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Plan and billing</UI>. You must be an owner.
          </Step>
          <Step>
            Choose <UI>Monthly</UI> or <UI>Yearly</UI> — a year costs ten months.
          </Step>
          <Step>
            Select the plan, then <UI>Continue to payment</UI>. Payment is handled by Stripe; we never see your card.
          </Step>
        </Steps>
        <p>
          The new plan takes effect when Stripe confirms the payment — usually within a second or two of you finishing checkout — and the billing page shows it. Nothing in Issueit writes a plan
          except that confirmation, so if the page still shows the old plan, the payment hasn't gone through yet.
        </p>
        <Note>
          <p>Already subscribed and moving between plans? Use <UI>Manage billing</UI> rather than checkout: Stripe works out the proration against what you've already paid.</p>
        </Note>

        <H2>Cards, invoices and VAT</H2>
        <Steps>
          <Step>
            On the billing page, select <UI>Manage billing</UI>. That opens Stripe's own portal.
          </Step>
          <Step>There you can change the card, update the billing address and VAT number, and download invoices and receipts.</Step>
        </Steps>
        <p>Recent invoices are also listed on the billing page itself, with links to the PDF.</p>

        <H2>Cancel</H2>
        <Steps>
          <Step>
            Select <UI>Settings → Plan and billing → Manage billing</UI>.
          </Step>
          <Step>
            Select <UI>Cancel plan</UI>.
          </Step>
        </Steps>
        <p>
          The plan runs to the end of the period you've paid for, and the billing page shows the date. After that the organisation falls back to the free plan: your reports stay, but the free
          allowance and retention apply from then on.
        </p>
        <Note kind="important">
          <p>
            Cancelling is not deleting. To remove the data as well, delete the organisation — see "Delete a report, a project or everything". Deleting the organisation cancels the subscription too.
          </p>
        </Note>

        <H2>Trials</H2>
        <p>
          A new organisation starts on a trial of the Team plan. The billing page counts the days left. When it ends, nothing is charged and nothing is deleted — the organisation moves to the free
          plan, so pick a plan before then if you're over the free allowance.
        </p>

        <H2>A payment failed</H2>
        <Table
          head={["", "What happens"]}
          rows={[
            ["We email the owners", "As soon as the payment fails."],
            ["Stripe retries", "Over the following days. Usually it's an expired card."],
            ["Your plan keeps working", "Through the retries. Nothing is turned off the moment a payment fails."],
            ["If it keeps failing", "The subscription lapses and the organisation moves to the free plan. The data stays."],
          ]}
        />
        <p>
          Fix it by selecting <UI>Manage billing</UI> and updating the card.
        </p>

        <More title="Who can do this">
          <p>
            Only an owner. Admins can see what the organisation is on but not change it, and an account token can read the plan but never move money — that needs a person signed in to the dashboard.
          </p>
        </More>
      </>
    ),
  },

  {
    slug: "you-have-used-your-monthly-report-allowance",
    title: "You have used your monthly report allowance",
    summary: "What happens when a plan's allowance runs out, how much grace there is, and the three ways to deal with it.",
    category: "billing",
    appliesTo: ["Issueit hosted service"],
    id: "IT5002",
    updated: "31 October 2026",
    keywords: "limit allowance quota plan_limit 429 too many reports turned away upgrade monthly reset",
    related: ["change-or-cancel-your-plan", "stop-getting-hundreds-of-reports-for-one-bug"],
    body: () => (
      <>
        <p>
          <strong>Symptoms.</strong> You've been emailed that you're near the allowance, or reports are being refused and your code is seeing <C>plan_limit</C> with a 429.
        </p>

        <H2>What actually happens</H2>
        <Table
          head={["Point", "What Issueit does"]}
          rows={[
            ["80% of the allowance", "Emails the organisation's owners once."],
            ["100%", "Keeps accepting. There is a tenth of the allowance in grace, so a busy week doesn't lose reports."],
            ["110%", <>Refuses new reports with <C>plan_limit</C>, and <C>Retry-After</C> set to the start of next month.</>],
            ["While refusing", "Counts what it turned away, and shows that number to the owners — so you know what the limit actually cost."],
            ["Start of the month", "The count resets and everything works again."],
          ]}
        />
        <Note>
          <p>Reports you already have are never deleted because of an allowance. Dashboards, destinations and delivery all keep working; it is only new reports that are refused.</p>
        </Note>

        <H2>Three ways to deal with it</H2>
        <H3>1. Check it isn't one bug</H3>
        <p>
          A single broken page can produce thousands of reports. If they are all one fault and they aren't being grouped, grouping is the fix and it is free. See "Stop getting hundreds of reports for
          one bug".
        </p>

        <H3>2. Send fewer reports</H3>
        <Table
          head={["Change", "Where"]}
          rows={[
            ["Turn off automatic reporting on staging", "Your own code, or a separate project for staging."],
            ["Stop a test suite filing reports", "The CI job that calls Issueit."],
            ["Tighten grouping", "The project's Rules tab."],
            ["Use one project per product, not per page", "Projects don't have separate allowances — the allowance is the organisation's."],
          ]}
        />

        <H3>3. Move up a plan</H3>
        <p>
          Select <UI>Settings → Plan and billing</UI> and choose a larger allowance. An upgrade takes effect immediately, and reports start being accepted again straight away. See "Change or cancel
          your plan".
        </p>

        <H2>Seeing where you are</H2>
        <p>
          <UI>Settings → Usage</UI> shows reports this month against the allowance, attachment storage, and — if any were refused — how many. It is also on the billing page beside the plan.
        </p>
        <More title="For the code that is sending reports">
          <p>
            <C>plan_limit</C> is a 429 with <C>Retry-After</C> pointing at the start of next month, so a client that honours <C>Retry-After</C> will do the right thing without changes. See{" "}
            <Doc to="/reference/errors">error codes</Doc>.
          </p>
        </More>
      </>
    ),
  },
];
