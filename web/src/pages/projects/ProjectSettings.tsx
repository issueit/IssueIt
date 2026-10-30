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
