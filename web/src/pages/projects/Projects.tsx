import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError, fieldError } from "../../lib/api";
import { plural, relativeTime } from "../../lib/format";
import { useProjects } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Project, ProjectSummary } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { Callout, EmptyState, SkeletonRows, StatusPill } from "../../components/ui/feedback";
import { AddIcon, FolderWithFilesIcon } from "../../components/ui/icons";
import { Page, PageHeader } from "../../components/ui/layout";

export function ProjectsPage() {
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const setCreating = (open: boolean) => setParams(open ? { new: "1" } : {}, { replace: true });

  return (
    <Page>
      <PageHeader
        icon={FolderWithFilesIcon}
        title="Projects"
        actions={
          <Button variant="primary" size="sm" icon={AddIcon} onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />
      <div className="page-body">
        {projects.isPending ? (
          <SkeletonRows rows={3} />
        ) : projects.isError ? (
          <Callout tone="danger" action={<Button size="sm" onClick={() => projects.refetch()}>Try again</Button>}>
            {describeError(projects.error, "Couldn't load projects.")}
          </Callout>
        ) : !projects.data.projects.length ? (
          <div className="list">
            <EmptyState
              icon={FolderWithFilesIcon}
              title="No projects yet"
              action={
                <Button variant="primary" icon={AddIcon} onClick={() => setCreating(true)}>
                  New project
                </Button>
              }
            >
              A project is one product or site. It gets its own widget, hosted form, API endpoint and destinations.
            </EmptyState>
          </div>
        ) : (
          <div className="list">
            {projects.data.projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  );
}

function ProjectRow({ project: p }: { project: ProjectSummary }) {
  return (
    <Link to={`/projects/${p.id}`} className="list-row py-2.5">
      <span className="grid place-items-center size-8 rounded-md bg-surface-3 text-text-2 text-sm font-semibold shrink-0">{p.name.charAt(0).toUpperCase()}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{p.name}</div>
        <div className="truncate text-xs text-text-3">{p.description || <span className="mono">{p.id}</span>}</div>
      </div>
      <div className="hidden sm:flex items-center gap-5 shrink-0 text-xs text-text-3">
        <span className="tabular w-24 text-right">
          {plural(p.reportCount, "report")}
          {p.newCount > 0 && <span className="text-text-2"> · {p.newCount} new</span>}
        </span>
        <span className="w-32">
          {p.failingCount > 0 ? (
            <StatusPill tone="danger" plain>
              {p.failingCount === 1 ? "1 destination failing" : `${p.failingCount} failing`}
            </StatusPill>
          ) : p.destinationCount > 0 ? (
            <StatusPill tone="success" plain>
              {plural(p.destinationCount, "destination")}
            </StatusPill>
          ) : (
            <StatusPill plain>No destinations</StatusPill>
          )}
        </span>
        <span className="w-24 text-right" title={p.lastReportAt ? new Date(p.lastReportAt).toLocaleString("en-GB") : undefined}>
          {p.lastReportAt ? `Last ${relativeTime(p.lastReportAt)}` : "No reports yet"}
        </span>
      </div>
    </Link>
  );
}

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { project } = await api<{ project: Project }>(path("/projects"), { body: { name, description: description || null } });
      await qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
      setName("");
      setDescription("");
      onClose();
      navigate(`/projects/${project.id}`);
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
      as="form"
      onSubmit={submit}
      title="New project"
      description="A product or site you collect reports for. You'll get the widget code and endpoints next."
      locked={busy}
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      {error && !fieldError(error, "name") ? <Callout tone="danger">{describeError(error, "Couldn't create the project.")}</Callout> : null}
      <Field label="Name" error={fieldError(error, "name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing site" maxLength={80} />
      </Field>
      <Field label="Description" optional>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={280} style={{ minHeight: 60 }} />
      </Field>
    </Dialog>
  );
}
