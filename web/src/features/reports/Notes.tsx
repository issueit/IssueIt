import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useOrg } from "../../lib/session";
import type { ReportNote } from "../../lib/types";
import { Button, IconButton } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Field";
import { confirm } from "../../components/ui/Dialog";
import { toastError } from "../../components/ui/Toast";
import { PenIcon, TrashBin2Icon } from "../../components/ui/icons";

/**
 * What the team says to each other about a report: what was tried, what it
 * turned out to be, why it was closed. Never delivered anywhere and never
 * shown to the person who reported it.
 */
export function Notes({ reportId, notes }: { reportId: string; notes: ReportNote[] }) {
  const { orgId, path, me } = useOrg();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["org", orgId, "reports"] });

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api(path(`/reports/${reportId}/notes`), { body: { body } });
      setDraft("");
      refresh();
    } catch (err) {
      toastError(describeError(err, "Couldn't add that note."));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    if (!body) return;
    try {
      await api(path(`/reports/${reportId}/notes/${id}`), { method: "PATCH", body: { body } });
      setEditing(null);
      refresh();
    } catch (err) {
      toastError(describeError(err, "Couldn't save that note."));
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: "Delete this note?", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api(path(`/reports/${reportId}/notes/${id}`), { method: "DELETE" });
      refresh();
    } catch (err) {
      toastError(describeError(err, "Couldn't delete that note."));
    }
  };

  return (
    <section>
      <h3 className="section-title">Notes{notes.length ? ` (${notes.length})` : ""}</h3>
      <div className="flex flex-col gap-2.5">
        {notes.map((note) => (
          <article key={note.id} className="rounded-md border border-border-subtle bg-surface-2 p-2.5">
            <header className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">{note.userId === me.user.id ? "You" : note.author}</span>
              <span className="text-xs text-text-3" title={new Date(note.createdAt).toLocaleString("en-GB")}>
                {relativeTime(note.createdAt)}
                {note.updatedAt !== note.createdAt ? " · edited" : ""}
              </span>
              {note.userId === me.user.id && editing !== note.id && (
                <span className="ml-auto flex gap-0.5">
                  <IconButton
                    size="sm"
                    icon={PenIcon}
                    label="Edit this note"
                    onClick={() => {
                      setEditing(note.id);
                      setEditDraft(note.body);
                    }}
                  />
                  <IconButton size="sm" icon={TrashBin2Icon} label="Delete this note" onClick={() => void remove(note.id)} />
                </span>
              )}
              {note.userId !== me.user.id && me.organisations.find((o) => o.id === orgId)?.role === "owner" && (
                <span className="ml-auto">
                  <IconButton size="sm" icon={TrashBin2Icon} label="Delete this note" onClick={() => void remove(note.id)} />
                </span>
              )}
            </header>
            {editing === note.id ? (
              <div className="flex flex-col gap-2">
                <Textarea rows={3} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => void saveEdit(note.id)} disabled={!editDraft.trim()}>
                    Save
                  </Button>
                  <Button size="sm" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-2 whitespace-pre-wrap select-text" style={{ overflowWrap: "anywhere" }}>
                {note.body}
              </p>
            )}
          </article>
        ))}

        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            placeholder="What have you found?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; shift-enter is a new line. The note is a sentence,
              // not a document.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void add();
              }
            }}
          />
          {draft.trim() && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" busy={busy} onClick={add}>
                Add note
              </Button>
              <span className="text-xs text-text-3">Only your team sees this.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
