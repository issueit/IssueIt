import { Link } from "react-router";
import { C, Glance, Note, Section, Table } from "../prose";
import { company } from "../company";
import type { LegalDoc } from "./Legal";

const Mail = ({ to }: { to: string }) => <a href={`mailto:${to}`}>{to}</a>;

/**
 * Terms of service for the hosted product. Plain English, but complete:
 * each section says what each side can expect, and the summary at the top
 * never promises more than the sections below it.
 */
export const terms: LegalDoc = {
  title: "Terms of service",
  lead: "The agreement between you and us when you use the hosted Issueit service. A summary first, then the full terms; where they differ, the full terms win.",
  toc: [
    ["summary", "In short"],
    ["about", "About these terms"],
    ["definitions", "Words we use"],
    ["accounts", "Accounts"],
    ["organisations", "Organisations and roles"],
    ["service", "The service"],
    ["your-data", "Your data"],
    ["processing", "Processing on your behalf"],
    ["reporters", "People who send reports"],
    ["acceptable-use", "Acceptable use"],
    ["fair-use", "Limits and fair use"],
    ["destinations", "Destinations and other services"],
    ["keys", "API, widget and keys"],
    ["security", "Security"],
    ["availability", "Availability and support"],
    ["fees", "Plans and fees"],
    ["self-hosting", "Self-hosted installations"],
    ["feedback", "Feedback"],
    ["confidentiality", "Confidentiality"],
    ["suspension", "Suspension"],
    ["ending", "Ending the agreement"],
    ["warranties", "What we don't promise"],
    ["liability", "Liability"],
    ["indemnity", "Claims about your content"],
    ["consumers", "If you're a consumer"],
    ["changes", "Changes to these terms"],
    ["general", "General"],
    ["law", "Law and disputes"],
    ["contact", "Contact"],
  ],
  body: () => (
    <>
      <Section id="summary" title="In short">
        <Glance
          items={[
            ["Your data is yours", "We store and deliver your reports for you, and use them for nothing else."],
            ["You choose where it goes", "Reports leave Issueit only for destinations your organisation connects."],
            ["Collect it fairly", "You're responsible for telling the people who report bugs what's collected."],
            ["Use it as intended", "No abuse, no probing, no sending sensitive data you shouldn't hold."],
            ["Leave whenever you like", "Delete your organisation and its data goes, straight away."],
            ["We'll warn you", `Significant changes to these terms come with ${company.noticeDays} days' notice.`],
          ]}
        />
      </Section>

      <Section id="about" title="About these terms">
        <p>
          These terms are an agreement between you and {company.name} ("we", "us"). They apply when you create an account on, or otherwise use, the hosted service at {company.domain} and its
          subdomains, including the dashboard, the widget, the hosted report form and the API.
        </p>
        <p>
          If you accept them for a company or other organisation, you confirm you're allowed to bind it, and "you" means that organisation as well as you. If you don't agree, don't use the service.
        </p>
        <p>
          The <Link to="/legal/privacy">privacy policy</Link> and <Link to="/legal/cookies">cookie policy</Link> explain how we handle personal data and browser storage, and form part of this
          agreement. If you and we have signed a separate written agreement, it takes priority where the two conflict.
        </p>
      </Section>

      <Section id="definitions" title="Words we use">
        <Table
          head={["Term", "Meaning"]}
          rows={[
            ["Account", "Your personal sign-in to the service."],
            ["Organisation", "A workspace in the service that holds projects, members and connections. Each has at least one owner."],
            ["Project", "A product or site you collect reports for, with its own project id, widget settings, keys and destinations."],
            ["Report", "A bug report sent to a project, with any attachments and context."],
            ["Reporter", "The person who sends a report. They don't need an account."],
            ["Destination", "Somewhere a project delivers reports, such as an issue tracker, a chat channel or a webhook."],
            ["Your content", "Everything you or your reporters put into the service: reports, attachments, settings, credentials for connected services."],
          ]}
        />
      </Section>

      <Section id="accounts" title="Accounts">
        <ul>
          <li>You must be old enough to form a binding contract where you live, and at least 16.</li>
          <li>Give us accurate details and keep them up to date, especially your email address, which is how we contact you.</li>
          <li>One account per person. Keep your password private and use one you don't use elsewhere. You're responsible for activity under your account until you tell us it's been compromised.</li>
          <li>
            You can see your signed-in sessions and sign them out under Settings → Account. If you think someone else has access, change your password and write to <Mail to={company.email.security} />
            .
          </li>
          <li>Accounts created by automated means are not allowed.</li>
        </ul>
      </Section>

      <Section id="organisations" title="Organisations and roles">
        <p>
          Organisation owners control the organisation: they invite members, change roles, rename it, and can delete it and everything in it. Members work with projects, reports, keys and connected
          services. Invitations expire after seven days. Because members can connect services and deliver reports to them, invite only people you trust with your reports.
        </p>
        <p>
          The organisation, not the individual member, is our customer for its content. If a member leaves, the organisation's content stays with the organisation. An organisation with other members
          must always have an owner; the last owner has to hand over ownership before deleting their account.
        </p>
      </Section>

      <Section id="service" title="The service">
        <p>
          Issueit collects bug reports through a widget, a hosted form and an API, stores them, and delivers them to the destinations you connect. It isn't an issue tracker, and it doesn't replace the
          records kept in your own tools.
        </p>
        <p>
          We improve the service continually, which means features change. If we remove or substantially reduce something you actively use, we'll tell organisation owners in advance and, where we
          reasonably can, offer an alternative. Features we label as previews may change or end without notice.
        </p>
      </Section>

      <Section id="your-data" title="Your data">
        <p>
          You keep all rights in your content. You give us a limited, worldwide licence to host, copy, process, transmit and display it, only as needed to provide the service to you, keep it secure
          and meet our legal obligations. The licence ends when the content is deleted, apart from copies in backups, which expire as the privacy policy describes.
        </p>
        <p>We don't sell your content, show advertising against it, or use it to train machine-learning models.</p>
        <p>You're responsible for your content and for having the rights and permissions needed to collect it and send it to the destinations you choose. In particular:</p>
        <ul>
          <li>Don't configure the widget or API to collect payment card numbers, passwords, government identity numbers, or health or other special-category data.</li>
          <li>Keep the metadata your site attaches to reports to what you need to fix bugs.</li>
          <li>Keep your own copies of anything you need to retain. Deleted content can't be recovered.</li>
        </ul>
      </Section>

      <Section id="processing" title="Processing on your behalf">
        <p>For personal data inside reports, you're the controller and we're your processor. Where data protection law applies, we will:</p>
        <ul>
          <li>process it only on your documented instructions, which are these terms and how you configure the service, unless the law requires otherwise;</li>
          <li>make sure everyone who can access it is bound to confidentiality;</li>
          <li>apply appropriate technical and organisational security measures, described in the privacy policy;</li>
          <li>use other processors only under written terms that protect the data as well as these do, and tell you before adding new ones that handle report data;</li>
          <li>help you respond to requests from the people whose data it is, and with security and impact assessments, as far as is reasonable;</li>
          <li>tell you without undue delay after we become aware of a personal data breach affecting your data;</li>
          <li>delete the data when you delete it or end the agreement, apart from backups which expire within {company.backupDays} days;</li>
          <li>give you the information you reasonably need to show these obligations are being met.</li>
        </ul>
        <p>
          Destinations you connect are not our processors. When we deliver a report to them, we do so on your instruction, and they handle it under their own terms with you. A separate data processing
          agreement is available on request from <Mail to={company.email.legal} />.
        </p>
      </Section>

      <Section id="reporters" title="People who send reports">
        <p>
          Reporters use the widget and form on your behalf, not under an agreement with us. You're responsible for giving them any notice the law requires about what's collected and why. The widget
          tells reporters in its form which details it attaches, and only takes a screenshot after their browser asks their permission. If a reporter contacts us about a report, we'll pass the request
          to you.
        </p>
      </Section>

      <Section id="acceptable-use" title="Acceptable use">
        <p>Don't use the service, or let anyone use it through your account, to:</p>
        <ul>
          <li>break any law, or infringe anyone's rights, including privacy and intellectual property;</li>
          <li>collect personal data you have no lawful basis to collect, or the kinds of data listed above;</li>
          <li>send spam, malware, or content that's abusive, harassing or deceptive, through reports or deliveries;</li>
          <li>deliver to services or addresses you aren't authorised to use;</li>
          <li>probe, scan or test the vulnerability of the service, except under our vulnerability disclosure terms below;</li>
          <li>get around limits, access controls or security measures, or access other customers' data;</li>
          <li>overload the service, including by generating artificial reports at volume;</li>
          <li>copy the service to build a competing product, or resell it without a written agreement with us.</li>
        </ul>
      </Section>

      <Section id="fair-use" title="Limits and fair use">
        <p>
          The service enforces rate limits and size limits to keep it fast and fair for everyone. The current defaults are published in the <Link to="/platform#limits">platform reference</Link>,
          including reports per minute and per hour, attachment counts and sizes. Requests over a limit are refused with a clear error and a time to retry; they're not queued. Your plan may set
          further limits, such as reports per month or attachment storage.
        </p>
      </Section>

      <Section id="destinations" title="Destinations and other services">
        <p>
          When you connect a destination, you authorise us to act on your behalf in that service within the access you grant, and to send it report data whenever a report matches the destination's
          rules. That service is provided by its own operator under its own terms and privacy policy, which are between you and them.
        </p>
        <ul>
          <li>Connect only accounts and channels you're allowed to use for this purpose.</li>
          <li>We store the credentials encrypted, use them only to deliver and to check the connection, and delete them when you disconnect.</li>
          <li>
            We're not responsible for other services' availability, changes or handling of data. If a destination fails, we retry as described in the{" "}
            <Link to="/platform#delivery">platform reference</Link> and show you what went wrong; the report itself is kept.
          </li>
          <li>Integrations depend on other services' APIs, which can change. We'll fix or, if we must, withdraw an integration that stops working, and tell you if it's one you use.</li>
        </ul>
      </Section>

      <Section id="keys" title="API, widget and keys">
        <p>
          The project id is public by design and can only create reports. Secret keys (<C>sk_live_…</C>) are confidential: keep them on your servers, never in web pages or apps, and rotate them if
          they may have leaked. You're responsible for requests made with your keys. You may use the widget and API only to collect reports for projects in your organisation.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          We protect the service and your content with the measures set out in the <Link to="/legal/privacy#security">privacy policy</Link>, and review them as the service and the risks change. You're
          responsible for the security of your accounts, your keys, the sites you embed the widget in, and the endpoints you deliver to.
        </p>
        <p>
          <strong>Vulnerability disclosure.</strong> If you believe you've found a security weakness, tell us at <Mail to={company.email.security} /> and give us reasonable time to fix it before
          telling anyone else. We won't take legal action against good-faith research that avoids privacy violations, data destruction and service disruption, uses only your own accounts and data, and
          stops once a weakness is confirmed.
        </p>
      </Section>

      <Section id="availability" title="Availability and support">
        <p>
          We work to keep the service available and to deliver every report, but we don't guarantee uninterrupted or error-free operation unless we've agreed a service level with you in writing.
          Planned maintenance is kept short and, where it could interrupt intake, announced in advance. Reports are stored before they're delivered, so an outage at a destination doesn't lose them.
        </p>
        <p>
          Support is by email at <Mail to={company.email.hello} />. We aim to reply within two working days.
        </p>
      </Section>

      <Section id="fees" title="Plans and fees">
        <ul>
          <li>Where a plan has a price, it's shown with what it includes before you agree to pay.</li>
          <li>Fees are charged in advance for each billing period and exclude taxes, which are added where required.</li>
          <li>We'll give at least {company.noticeDays} days' notice before a price you're paying changes, and you can cancel before it takes effect.</li>
          <li>Except where the law says otherwise, fees already paid aren't refunded for part of a period.</li>
          <li>If payment fails, we'll tell you and give you time to fix it before limiting the account.</li>
        </ul>
      </Section>

      <Section id="self-hosting" title="Self-hosted installations">
        <p>
          These terms cover the hosted service only. If you run Issueit on your own infrastructure, the licence supplied with the software governs your use of it, you're the operator and controller of
          everything in that installation, and none of it is sent to us.
        </p>
      </Section>

      <Section id="feedback" title="Feedback">
        <p>If you send us ideas or suggestions, we may use them without owing you anything. You don't have to send any.</p>
      </Section>

      <Section id="confidentiality" title="Confidentiality">
        <p>
          Each side will keep the other's non-public information confidential, use it only for this agreement, and share it only with people who need it and are bound to confidentiality. This doesn't
          cover information that is or becomes public through no fault of the receiving side, was already known to it, or must be disclosed by law, in which case the other side is told first where
          allowed.
        </p>
      </Section>

      <Section id="suspension" title="Suspension">
        <p>We may suspend all or part of your access, with as little disruption as possible, if:</p>
        <ul>
          <li>your use breaks the acceptable use rules or threatens the security or stability of the service or others;</li>
          <li>we're required to by law or by an authority;</li>
          <li>fees are overdue after the notice described above.</li>
        </ul>
        <p>We'll tell you why and what to do to restore access, unless the law or the risk to others stops us, and we'll restore access once the problem is fixed.</p>
      </Section>

      <Section id="ending" title="Ending the agreement">
        <p>
          You can end this agreement at any time by deleting your organisations and your account under Settings. Deletion is immediate. Before you do, make sure everything you need has been delivered
          to your own tools.
        </p>
        <p>
          We may end it with {company.noticeDays} days' notice for any reason, or straight away if you materially break these terms and don't fix it within 14 days of being told, or if the breach
          can't be fixed. If we end it without fault on your part, we'll refund any prepaid fees for the unused period and give you the notice period to retrieve your content.
        </p>
        <p>Sections that by their nature should continue, such as confidentiality, liability and law, survive the end of the agreement.</p>
      </Section>

      <Section id="warranties" title="What we don't promise">
        <p>
          Apart from what these terms expressly say, the service is provided "as is" and "as available". To the extent the law allows, we exclude implied terms such as fitness for a particular purpose
          and satisfactory quality. We don't promise that every destination will accept every report, that third-party services will stay compatible, or that the service will meet every need you have.
        </p>
      </Section>

      <Section id="liability" title="Liability">
        <p>
          Nothing in these terms limits or excludes liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for anything else that can't be limited
          or excluded by law.
        </p>
        <p>Subject to that:</p>
        <ul>
          <li>neither side is liable for loss of profit, revenue, business, goodwill or anticipated savings, or for any indirect or consequential loss;</li>
          <li>each side's total liability arising from this agreement in any 12-month period is limited to the greater of the fees you paid us in that period and £100.</li>
        </ul>
        <p>These limits don't apply to your obligation to pay fees, or to claims under the next section.</p>
      </Section>

      <Section id="indemnity" title="Claims about your content">
        <p>
          If someone brings a claim against us because of your content or because you used the service in breach of the acceptable use rules, you'll cover our reasonable costs and losses from that
          claim. We'll tell you promptly, let you control the defence, and help where reasonable at your expense.
        </p>
      </Section>

      <Section id="consumers" title="If you're a consumer">
        <p>
          The service is meant for businesses and developers. If you use it as a consumer, you have legal rights these terms can't take away, and nothing here affects them. Citizens Advice can explain
          them.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p>
          We may update these terms as the service and the law change. We'll post the new version here with its date. For significant changes, we'll email organisation owners at least{" "}
          {company.noticeDays} days before they take effect, unless a change is needed sooner for legal or security reasons. If you don't agree, you can end the agreement before then. Using the
          service after the change takes effect means you accept it.
        </p>
      </Section>

      <Section id="general" title="General">
        <ul>
          <li>These terms, with the policies they refer to, are the whole agreement between us about the service.</li>
          <li>You can't transfer them without our written consent. We may transfer them to a business that takes over the service, and will tell you if we do.</li>
          <li>Neither side is liable for delays caused by events beyond its reasonable control.</li>
          <li>If any part is found unenforceable, the rest still applies. Not enforcing a right straight away doesn't waive it.</li>
          <li>We'll send notices to the email address on the account. Send yours to the address below.</li>
          <li>No one else has rights under these terms, including under the Contracts (Rights of Third Parties) Act 1999.</li>
        </ul>
      </Section>

      <Section id="law" title="Law and disputes">
        <p>
          The law of {company.law} governs these terms and any dispute about them, and its courts have exclusive jurisdiction. If you're a consumer living elsewhere in the UK, you may also bring
          proceedings in your home courts. We'd always rather talk first: most problems are solved faster by email than by lawyers.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Questions about these terms: <Mail to={company.email.legal} />. Security: <Mail to={company.email.security} />. Everything else: <Mail to={company.email.hello} />.
        </p>
        <Note>These terms are written to be read. If a sentence here is unclear, tell us and we'll fix the wording.</Note>
      </Section>
    </>
  ),
};
