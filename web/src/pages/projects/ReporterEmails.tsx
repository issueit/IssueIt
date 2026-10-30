import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useConnections, useProviders } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { MailInfo, Project, ProjectEmailSettings } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { RadioCards, Switch } from "../../components/ui/controls";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { Callout } from "../../components/ui/feedback";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { toast, toastError } from "../../components/ui/Toast";

/**
 * Emails to the people who send reports: a receipt, and a note when it's
 * fixed. Switches apply straight away; the sender and wording open a dialog.
 */
export function ReporterEmails({ project, mail }: { project: Project; mail: MailInfo }) {
  const { orgId, path, me } = useOrg();
  const qc = useQueryClient();
  const providers = useProviders();
  const connections = useConnections();
  const [dialog, setDialog] = useState<"sender" | "wording" | null>(null);
  const [testing, setTesting] = useState<"receipt" | "resolved" | null>(null);
  const e = project.emails;

  const emailServices = (connections.data?.connections ?? []).filter((c) => providers.data?.providers.find((p) => p.id === c.provider)?.category === "email");
  const chosen = emailServices.find((c) => c.id === e.connectionId);
  const providerName = (id: string) => providers.data?.providers.find((p) => p.id === id)?.name ?? id;
  const senderSummary =
    e.sender === "issueit"
      ? mail.issueit
        ? `Issueit, from ${mail.from}`
        : "Issueit, but this server has no mail server set up"
      : chosen
        ? `${providerName(chosen.provider)} · ${chosen.account.label}`
        : "Your email service, not chosen yet";
  const broken = (e.sender === "issueit" && !mail.issueit) || (e.sender === "connection" && !chosen && !connections.isPending);

  const save = async (patch: Partial<ProjectEmailSettings>, success?: string) => {
    await api(path(`/projects/${project.id}`), { method: "PATCH", body: { emails: patch } });
    await qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
    if (success) toast(success);
  };

  const toggle = (key: "enabled" | "receipt" | "resolved", value: boolean, label: string) =>
    save({ [key]: value }, `${value ? "Turned on" : "Turned off"} ${label}`).catch((err) => toastError(describeError(err, `Couldn't change ${label}.`), () => toggle(key, value, label)));

  const test = async (kind: "receipt" | "resolved") => {
    setTesting(kind);
    try {
      const out = await api<{ to: string }>(path(`/projects/${project.id}/emails/test`), { body: { kind } });
      toast(`Sent a test to ${out.to}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't send the test email."));
    } finally {
      setTesting(null);
    }
  };

  return (
    <>
      <SetGroup title="Emails to reporters">
        <SetRow
          label="Email reporters"
          hint={e.enabled ? "People who leave their email and tick the box on the form get the emails below." : "Off. People who report a bug only see the thank-you on the form."}
        >
          <Switch label="Email reporters" checked={e.enabled} onChange={(v) => toggle("enabled", v, "reporter emails")} />
        </SetRow>
        {e.enabled && (
          <>
            <SetRow label="When a report arrives" hint="A receipt saying the team has it.">
              <Switch label="When a report arrives" checked={e.receipt} onChange={(v) => toggle("receipt", v, "receipts")} />
            </SetRow>
            <SetRow label="When it's fixed" hint="When the report is resolved here, or its issue is closed in GitHub, GitLab, Linear or Jira. Everyone who reported the same bug hears.">
              <Switch label="When it's fixed" checked={e.resolved} onChange={(v) => toggle("resolved", v, "fixed emails")} />
            </SetRow>
            <SetRow label="Send with" hint={<span className={broken ? "text-danger" : undefined}>{senderSummary}</span>}>
              <Button size="sm" onClick={() => setDialog("sender")}>
                Change…
              </Button>
            </SetRow>
            <SetRow label="Wording" hint={e.receiptMessage || e.resolvedMessage ? "Your own lines are added to the emails." : "Add a line of your own, a sender name or a reply-to address."}>
              <Button size="sm" onClick={() => setDialog("wording")}>
                Edit…
              </Button>
            </SetRow>
            <SetRow label="Send a test" hint={`To ${me.user.email}, with the saved settings.`}>
              <div className="flex gap-1.5">
                <Button size="sm" busy={testing === "receipt"} disabled={!!testing} onClick={() => test("receipt")}>
                  Receipt
                </Button>
                <Button size="sm" busy={testing === "resolved"} disabled={!!testing} onClick={() => test("resolved")}>
                  Fixed
                </Button>
              </div>
            </SetRow>
          </>
        )}
      </SetGroup>

      {dialog === "sender" && <SenderDialog onClose={() => setDialog(null)} settings={e} mail={mail} services={emailServices} providerName={providerName} save={save} />}
      {dialog === "wording" && <WordingDialog onClose={() => setDialog(null)} settings={e} project={project} save={save} />}
    </>
  );
}

type Service = { id: string; provider: string; account: { label: string } };

function SenderDialog({
  onClose,
  settings,
  mail,
  services,
  providerName,
  save,
}: {
  onClose: () => void;
  settings: ProjectEmailSettings;
  mail: MailInfo;
  services: Service[];
  providerName: (id: string) => string;
  save: (p: Partial<ProjectEmailSettings>, s?: string) => Promise<void>;
}) {
  const [sender, setSender] = useState(settings.sender);
  const [connectionId, setConnectionId] = useState(settings.connectionId ?? services[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      locked={busy}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await save({ sender, connectionId: sender === "connection" ? connectionId || null : settings.connectionId }, "Saved how reporter emails are sent");
          onClose();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
      title="Send reporter emails with"
      description="Your own service sends from your domain, which reporters are more likely to trust."
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={sender === "connection" && !connectionId}>
            Save
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the sender.")}</Callout> : null}
      <RadioCards
        ariaLabel="Sender"
        value={sender}
        onChange={setSender}
        options={[
          {
            value: "issueit",
            title: "Issueit",
            hint: mail.issueit ? `From ${mail.from}, with your brand's name.` : "Not set up on this server. Whoever runs it can set SMTP_URL.",
          },
          { value: "connection", title: "Your email service", hint: "Resend, Postmark, SendGrid, Amazon SES, your own SMTP server and more." },
        ]}
      />
      {sender === "issueit" && !mail.issueit && <Callout tone="warning">Emails will fail until this server has a mail server. Choose your own service, or ask whoever runs Issueit to set SMTP_URL.</Callout>}
      {sender === "connection" &&
        (services.length ? (
          <Field label="Service" hint="Emails come from the from address saved with the connection.">
            <Select value={connectionId} onChange={(ev) => setConnectionId(ev.target.value)} options={services.map((c) => ({ value: c.id, label: `${providerName(c.provider)} · ${c.account.label}` }))} />
          </Field>
        ) : (
          <Callout tone="info">
            No email service is connected yet.{" "}
            <Link to="/integrations/smtp" className="underline underline-offset-2">
              Connect SMTP
            </Link>{" "}
            or{" "}
            <Link to="/integrations/directory" className="underline underline-offset-2">
              another email service
            </Link>
            , then come back.
          </Callout>
        ))}
    </Dialog>
  );
}

function WordingDialog({ onClose, settings, project, save }: { onClose: () => void; settings: ProjectEmailSettings; project: Project; save: (p: Partial<ProjectEmailSettings>, s?: string) => Promise<void> }) {
  const [fromName, setFromName] = useState(settings.fromName);
  const [replyTo, setReplyTo] = useState(settings.replyTo ?? "");
  const [receiptMessage, setReceiptMessage] = useState(settings.receiptMessage);
  const [resolvedMessage, setResolvedMessage] = useState(settings.resolvedMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const brand = project.widget.brandName || project.name;
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      width="wide"
      locked={busy}
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await save({ fromName, replyTo: replyTo.trim() || null, receiptMessage, resolvedMessage }, "Saved the email wording");
          onClose();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
      title="Email wording"
      description="Each email says what happened in a sentence or two. Anything you add here follows it."
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>
            Save
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the wording.")}</Callout> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sender name" optional hint={settings.sender === "issueit" ? `Empty uses ${brand}.` : "Your service uses the from address saved with it."}>
          <Input value={fromName} onChange={(ev) => setFromName(ev.target.value)} maxLength={60} placeholder={brand} disabled={settings.sender !== "issueit"} />
        </Field>
        <Field label="Reply-to address" optional hint="Where replies go. Empty means replies go to the sender.">
          <Input type="email" value={replyTo} onChange={(ev) => setReplyTo(ev.target.value)} maxLength={254} placeholder="support@example.com" />
        </Field>
      </div>
      <Field label="Added to the receipt" optional hint={`After "The ${brand} team has your report and will look into it."`}>
        <Textarea value={receiptMessage} onChange={(ev) => setReceiptMessage(ev.target.value)} maxLength={600} rows={3} placeholder="Most reports get a reply within two working days." />
      </Field>
      <Field label={'Added to "It\'s fixed"'} optional hint="After the note that it's fixed.">
        <Textarea value={resolvedMessage} onChange={(ev) => setResolvedMessage(ev.target.value)} maxLength={600} rows={3} placeholder="The fix is live now. Refresh the page if you still see the problem." />
      </Field>
    </Dialog>
  );
}
