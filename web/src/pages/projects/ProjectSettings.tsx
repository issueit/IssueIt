import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrg } from "../../lib/session";
import type { Project } from "../../lib/types";
import { Button, IconButton } from "../../components/ui/Button";
import { CopyField } from "../../components/ui/Copy";
import { Switch } from "../../components/ui/controls";
import { confirm, Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { Callout } from "../../components/ui/feedback";
import { toast, toastError } from "../../components/ui/Toast";
import { AddIcon, CloseIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { useProjectContext } from "./ProjectLayout";
import { ReporterEmails } from "./ReporterEmails";

export function ProjectSettings() {
  const { project, mail } = useProjectContext();
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [origins, setOrigins] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const protection = project.protection ?? {};
  const spam = protection.spam ?? {};
  const block = protection.block ?? {};
  const blockedCount = (block.ipHashes?.length ?? 0) + (block.ips?.length ?? 0) + (block.emails?.length ?? 0) + (block.domains?.length ?? 0);

  const patch = async (body: Partial<Project>, success?: string) => {
    await api(path(`/projects/${project.id}`), { method: "PATCH", body });
    await qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
    if (success) toast(success);
  };

  const togglePublic = async (value: boolean) => {
    try {
      await patch({ publicSubmissions: value }, value ? "Turned on public reports" : "Turned off public reports");
    } catch (err) {
      toastError(describeError(err, "Couldn't change public reports."), () => togglePublic(value));
    }
  };

  const patchProtection = async (next: Partial<Project["protection"]>, success?: string) =>
    patch({ protection: { ...protection, ...next } }, success);

  const toggleSpam = async (value: boolean) => {
    try {
      await patchProtection({ spam: { ...spam, enabled: value } }, value ? "Holding likely spam back" : "Turned off spam holding");
    } catch (err) {
      toastError(describeError(err, "Couldn't change spam handling."), () => toggleSpam(value));
    }
  };

  const toggleLinks = async (value: boolean) => {
    try {
      await patchProtection({ spam: { ...spam, allowLinks: value } }, value ? "Links no longer count against a report" : "Links count against a report again");
    } catch (err) {
      toastError(describeError(err, "Couldn't change link handling."), () => toggleLinks(value));
    }
  };

  const toggleGrouping = async (value: boolean) => {
    try {
      await patch({ groupDuplicates: value }, value ? "Turned on duplicate grouping" : "Turned off duplicate grouping");
    } catch (err) {
      toastError(describeError(err, "Couldn't change duplicate grouping."), () => toggleGrouping(value));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${project.name}?`,
      message:
        "Its reports, attachments, keys and destinations are deleted for good, and the widget stops accepting reports. Issues already created in other tools stay where they are.",
      confirmLabel: "Delete project",
      danger: true,
      typeToConfirm: project.name,
    });
    if (!ok) return;
    try {
      await api(path(`/projects/${project.id}`), { method: "DELETE", body: { confirm: ok } });
      qc.invalidateQueries({ queryKey: ["org", orgId] });
      toast(`Deleted ${project.name}`);
      navigate("/projects");
    } catch (err) {
      toastError(describeError(err, "Couldn't delete the project."));
    }
  };

  return (
    <div className="page-body page-body--narrow">
      <SetGroup title="General">
        <SetRow label="Name and description" hint={project.description ? `${project.name} - ${project.description}` : project.name}>
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit…
          </Button>
        </SetRow>
        <SetRow label="Project id" hint="Public. Used by the widget, the hosted form and API requests.">
          <div className="w-[220px]">
            <CopyField value={project.id} what="project id" />
          </div>
        </SetRow>
      </SetGroup>

      <SetGroup title="Submissions">
        <SetRow label="Public reports" hint={project.publicSubmissions ? "The widget, hosted form and browser requests can send reports." : "Only requests with a secret key are accepted."}>
          <Switch label="Public reports" checked={project.publicSubmissions} onChange={togglePublic} />
        </SetRow>
        <SetRow
          label="Allowed sites"
          hint={
            project.allowedOrigins.length
              ? `Only ${project.allowedOrigins.length === 1 ? project.allowedOrigins[0] : `${project.allowedOrigins.length} sites`} and the hosted form can send public reports.`
              : "Any site can send public reports. Limit it to stop others using your project id."
          }
        >
          <Button size="sm" onClick={() => setOrigins(true)}>
            Manage…
          </Button>
        </SetRow>
        {project.publicSubmissions && !project.allowedOrigins.length && (
          <Callout tone="warning" action={<Button size="sm" onClick={() => setOrigins(true)}>Limit sites</Button>}>
            This project's id is in the page source of every site using the widget, so anyone who reads it can post reports here. Naming your own sites stops that. It isn't a lock — a
            request that isn't from a browser can claim any site — but it turns away everything casual.
          </Callout>
        )}
      </SetGroup>

      <SetGroup title="Spam">
        <SetRow
          label="Hold likely spam back"
          hint={
            spam.enabled === false
              ? "Off. Every public report goes straight to your destinations."
              : "A public report that looks like advertising is stored but not delivered, and nobody is emailed about it. It waits in Held as spam for a week. Reports sent with a secret key or a short-lived token are never held."
          }
        >
          <Switch label="Hold likely spam back" checked={spam.enabled !== false} onChange={toggleSpam} />
        </SetRow>
        {spam.enabled !== false && (
          <SetRow label="Links are normal here" hint={spam.allowLinks ? "Links in a report don't count against it." : "Several links, or a link in the title, counts towards holding a report back."}>
            <Switch label="Links are normal here" checked={!!spam.allowLinks} onChange={toggleLinks} />
          </SetRow>
        )}
        <SetRow
          label="Blocked reporters"
          hint={blockedCount ? `${blockedCount === 1 ? "One reporter" : `${blockedCount} entries`} blocked. Nothing from them is accepted for this project.` : "Nobody is blocked. Block a reporter from one of their reports."}
        >
          <Button size="sm" onClick={() => setBlocked(true)}>
            Manage…
          </Button>
        </SetRow>
      </SetGroup>

      <SetGroup title="Duplicates">
        <SetRow
          label="Group duplicate reports"
          hint={
            project.groupDuplicates
              ? "A report with the same title on the same page as an open report joins it instead of being sent again. Trackers get a comment as the count grows."
              : "Off. Every report is sent to your destinations on its own."
          }
        >
          <Switch label="Group duplicate reports" checked={project.groupDuplicates} onChange={toggleGrouping} />
        </SetRow>
      </SetGroup>

      <ReporterEmails project={project} mail={mail} />

      <SetGroup title="Danger zone">
        <SetRow label="Delete project" hint="Removes the project and everything collected for it. This can't be undone.">
          <Button size="sm" variant="danger" onClick={remove}>
            Delete project…
          </Button>
        </SetRow>
      </SetGroup>

      {editing && <EditDetails open onClose={() => setEditing(false)} project={project} save={patch} />}
      <AllowedSites open={origins} onClose={() => setOrigins(false)} project={project} save={patch} />
      <BlockedReporters open={blocked} onClose={() => setBlocked(false)} project={project} save={patch} />
    </div>
  );
}

function EditDetails({ open, onClose, project, save }: { open: boolean; onClose: () => void; project: Project; save: (b: Partial<Project>, s?: string) => Promise<void> }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await save({ name, description: description || null }, "Saved project details");
          onClose();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
      title="Project details"
      description="Nothing changes until you save."
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the project.")}</Callout> : null}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Description" optional>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={2} style={{ minHeight: 60 }} />
      </Field>
    </Dialog>
  );
}

/**
 * Who this project won't take reports from. Addresses typed in here are
 * hashed on the way in, the same way intake hashes a reporter's, so neither
 * this page nor the database ever holds one.
 *
 * Entries added from a report are listed as "a reporter" and can only be
 * removed: there is nothing to show, because the hash is all Issueit kept.
 */
function BlockedReporters({ open, onClose, project, save }: { open: boolean; onClose: () => void; project: Project; save: (b: Partial<Project>, s?: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const protection = project.protection ?? {};
  const block = protection.block ?? {};

  const update = async (next: NonNullable<Project["protection"]["block"]>) => {
    setBusy(true);
    setError(null);
    try {
      await save({ protection: { ...protection, block: next } });
      setValue("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  /** An address, a @domain, or an IP. Which one it is, is obvious enough to guess. */
  const add = () => {
    const entry = value.trim().toLowerCase();
    if (!entry) return;
    if (entry.includes("@") && !entry.startsWith("@")) return update({ ...block, emails: [...new Set([...(block.emails ?? []), entry])] });
    if (/^[\d.:a-f]+$/.test(entry) && /\d/.test(entry)) return update({ ...block, ips: [...new Set([...(block.ips ?? []), entry])] });
    return update({ ...block, domains: [...new Set([...(block.domains ?? []), entry.replace(/^@/, "")])] });
  };

  const rows: Array<{ key: string; label: string; what: string; remove: () => void }> = [
    ...(block.emails ?? []).map((e) => ({ key: `e:${e}`, label: e, what: "Email address", remove: () => update({ ...block, emails: (block.emails ?? []).filter((x) => x !== e) }) })),
    ...(block.domains ?? []).map((d) => ({ key: `d:${d}`, label: `@${d}`, what: "Email domain", remove: () => update({ ...block, domains: (block.domains ?? []).filter((x) => x !== d) }) })),
    ...(block.ips ?? []).map((i) => ({ key: `i:${i}`, label: i, what: "Address", remove: () => update({ ...block, ips: (block.ips ?? []).filter((x) => x !== i) }) })),
    ...(block.ipHashes ?? []).map((h) => ({
      key: `h:${h}`,
      label: "A reporter, blocked from their report",
      what: "Address",
      remove: () => update({ ...block, ipHashes: (block.ipHashes ?? []).filter((x) => x !== h) }),
    })),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Blocked reporters"
      description="Nothing from these is accepted for this project. They aren't told: a submission is answered as though it had been filed, so a spammer carries on posting into nothing."
      footer={
        <>
          <span className="mr-auto" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="name@example.com, @example.com or 198.51.100.4" aria-label="Address, domain or IP" data-autofocus />
        <Button type="submit" icon={AddIcon} busy={busy} disabled={!value.trim()}>
          Block
        </Button>
      </form>
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the blocked reporters.")}</Callout> : null}
      {rows.length > 0 ? (
        <div className="list">
          {rows.map((row) => (
            <div key={row.key} className="list-row">
              <span className="flex-1 mono text-sm" style={{ overflowWrap: "anywhere" }}>
                {row.label}
              </span>
              <span className="text-xs text-text-3">{row.what}</span>
              <IconButton size="sm" icon={CloseIcon} label={`Unblock ${row.label}`} onClick={row.remove} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-3">Nobody is blocked. Open a spam report and choose “Block reporter” to add one.</p>
      )}
    </Dialog>
  );
}

/** Changes apply as you make them, so the footer says Done. */
function AllowedSites({ open, onClose, project, save }: { open: boolean; onClose: () => void; project: Project; save: (b: Partial<Project>, s?: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const update = async (list: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await save({ allowedOrigins: list });
      setValue("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Allowed sites"
      description="Browsers on these sites can send public reports. The hosted form always works. Leave the list empty to allow any site."
      footer={
        <>
          <span className="mr-auto" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) update([...project.allowedOrigins, value.trim()]);
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://example.com" aria-label="Site address" data-autofocus />
        <Button type="submit" icon={AddIcon} busy={busy} disabled={!value.trim()}>
          Add
        </Button>
      </form>
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the allowed sites.")}</Callout> : null}
      {project.allowedOrigins.length > 0 ? (
        <div className="list">
          {project.allowedOrigins.map((o) => (
            <div key={o} className="list-row">
              <span className="flex-1 mono text-sm">{o}</span>
              <IconButton size="sm" icon={CloseIcon} label={`Remove ${o}`} onClick={() => update(project.allowedOrigins.filter((x) => x !== o))} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-3">No limits. Any site can use this project's id.</p>
      )}
    </Dialog>
  );
}
