import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError, fieldError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useMembers } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Role } from "../../lib/types";
import { Button, IconButton } from "../../components/ui/Button";
import { CopyField } from "../../components/ui/Copy";
import { Segmented } from "../../components/ui/controls";
import { confirm, Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { Menu } from "../../components/ui/Menu";
import { toast, toastError } from "../../components/ui/Toast";
import { AddIcon, CloseIcon, MenuDotsIcon, TrashBin2Icon, UserCircleIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

export function MembersSettings() {
  const { org, me, orgId, path } = useOrg();
  const qc = useQueryClient();
  const members = useMembers();
  const [inviting, setInviting] = useState(false);
  const owner = org.role === "owner";
  const refresh = () => qc.invalidateQueries({ queryKey: ["org", orgId, "members"] });

  const setRole = async (userId: string, name: string, role: Role) => {
    try {
      await api(path(`/members/${userId}`), { method: "PATCH", body: { role } });
      refresh();
      if (userId === me.user.id) qc.invalidateQueries({ queryKey: ["me"] });
      toast(role === "owner" ? `Made ${name} an owner` : `Made ${name} a member`);
    } catch (err) {
      toastError(describeError(err, "Couldn't change the role."));
    }
  };

  const remove = async (userId: string, name: string) => {
    const ok = await confirm({ title: `Remove ${name}?`, message: "They lose access straight away. You can invite them again later.", confirmLabel: "Remove member", danger: true });
    if (!ok) return;
    try {
      await api(path(`/members/${userId}`), { method: "DELETE" });
      refresh();
      toast(`Removed ${name}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't remove the member."));
    }
  };

  const cancelInvite = async (id: string, email: string) => {
    try {
      await api(path(`/invitations/${id}`), { method: "DELETE" });
      refresh();
      toast(`Cancelled the invitation for ${email}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't cancel the invitation."));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="page-title">Members</h2>
        {owner && (
          <Button size="sm" icon={AddIcon} onClick={() => setInviting(true)}>
            Invite…
          </Button>
        )}
      </div>
      {members.isPending ? (
        <Skeleton h={120} />
      ) : members.isError ? (
        <Callout tone="danger" action={<Button size="sm" onClick={() => members.refetch()}>Try again</Button>}>
          {describeError(members.error, "Couldn't load members.")}
        </Callout>
      ) : (
        <>
          <SetGroup title={`${members.data.members.length} ${members.data.members.length === 1 ? "member" : "members"}`}>
            {members.data.members.map((m) => (
              <SetRow
                key={m.id}
                id={m.id}
                label={
                  <span className="inline-flex items-center gap-2">
                    <UserCircleIcon size={15} className="text-text-3" />
                    {m.name}
                    {m.id === me.user.id && <span className="text-xs text-text-3 font-normal">(you)</span>}
                  </span>
                }
                hint={`${m.email} · joined ${relativeTime(m.joinedAt)}`}
              >
                <span className="text-xs text-text-2 w-14 text-right">{m.role === "owner" ? "Owner" : "Member"}</span>
                {owner && (
                  <Menu
                    trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`Actions for ${m.name}`} />}
                    items={[
                      { label: "Owner", checked: m.role === "owner", onSelect: () => m.role !== "owner" && setRole(m.id, m.name, "owner") },
                      { label: "Member", checked: m.role === "member", onSelect: () => m.role !== "member" && setRole(m.id, m.name, "member") },
                      ...(m.id !== me.user.id ? ["separator" as const, { label: "Remove…", icon: TrashBin2Icon, danger: true, onSelect: () => remove(m.id, m.name) }] : []),
                    ]}
                  />
                )}
              </SetRow>
            ))}
          </SetGroup>
          {members.data.invitations.length > 0 && (
            <SetGroup title="Pending invitations">
              {members.data.invitations.map((i) => (
                <SetRow key={i.id} label={i.email} hint={`Invited as ${i.role === "owner" ? "an owner" : "a member"} · expires ${relativeTime(i.expiresAt)}`}>
                  {owner && <IconButton size="sm" icon={CloseIcon} label={`Cancel invitation for ${i.email}`} onClick={() => cancelInvite(i.id, i.email)} />}
                </SetRow>
              ))}
            </SetGroup>
          )}
        </>
      )}
      {inviting && <InviteDialog onClose={() => setInviting(false)} onInvited={refresh} />}
    </>
  );
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const { path, org } = useOrg();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      onSubmit={async () => {
        if (link) return onClose();
        setBusy(true);
        setError(null);
        try {
          const res = await api<{ link: string }>(path("/invitations"), { body: { email, role } });
          setLink(res.link);
          onInvited();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
      title={link ? "Invitation ready" : `Invite to ${org.name}`}
      description={link ? "Send this link to them. It works once and expires in 7 days." : "You'll get a link to share. Issueit doesn't send the email for you."}
      footer={
        <>
          <span className="mr-auto" />
          {!link && <Button onClick={onClose}>Cancel</Button>}
          <Button type="submit" variant="primary" busy={busy} disabled={!link && !email.trim()}>
            {link ? "Done" : "Create invitation"}
          </Button>
        </>
      }
    >
      {link ? (
        <CopyField value={link} what="invitation link" />
      ) : (
        <>
          {error && !fieldError(error, "email") ? <Callout tone="danger">{describeError(error, "Couldn't create the invitation.")}</Callout> : null}
          <Field label="Email" error={fieldError(error, "email")}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
          <div className="field">
            <span className="field__label">Role</span>
            <Segmented
              ariaLabel="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: "member", label: "Member" },
                { value: "owner", label: "Owner" },
              ]}
            />
            <span className="field__hint">{role === "owner" ? "Can manage members and delete the organisation." : "Can work with projects, reports and integrations."}</span>
          </div>
        </>
      )}
    </Dialog>
  );
}
