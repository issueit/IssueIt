import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError, fieldError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useOrg } from "../../lib/session";
import { Button } from "../../components/ui/Button";
import { confirm, Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/feedback";
import { toast, toastError } from "../../components/ui/Toast";
import { SetGroup, SetRow } from "../../components/ui/layout";

type Session = { id: string; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean };

export function AccountSettings() {
  const { me } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"profile" | "password" | "delete" | null>(null);
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ sessions: Session[] }>("/me/sessions") });
  const others = (sessions.data?.sessions ?? []).filter((s) => !s.current);

  const signOutOthers = async () => {
    try {
      await api("/me/sessions", { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast("Signed out other sessions");
    } catch (err) {
      toastError(describeError(err, "Couldn't sign out the other sessions."));
    }
  };

  return (
    <>
      <h2 className="page-title mb-4">Account</h2>
      <SetGroup title="Profile">
        <SetRow label="Name and email" hint={`${me.user.name} · ${me.user.email}`}>
          <Button size="sm" onClick={() => setDialog("profile")}>
            Edit…
          </Button>
        </SetRow>
      </SetGroup>

      <SetGroup title="Appearance">
        <SetRow label="Theme, accent and density" hint="Now in their own section.">
          <Link to="/settings/appearance" className="btn btn--sm">
            Appearance
          </Link>
        </SetRow>
      </SetGroup>

      <SetGroup title="Security">
        <SetRow label="Password" hint="Changing it signs out your other sessions.">
          <Button size="sm" onClick={() => setDialog("password")}>
            Change…
          </Button>
        </SetRow>
        <SetRow
          label="Sessions"
          hint={
            sessions.isPending
              ? "Checking…"
              : others.length
                ? `Signed in on ${others.length} other ${others.length === 1 ? "device" : "devices"}, most recently ${relativeTime(others[0].lastSeenAt)}.`
                : "Only signed in here."
          }
        >
          {others.length > 0 && (
            <Button size="sm" onClick={signOutOthers}>
              Sign out others
            </Button>
          )}
        </SetRow>
      </SetGroup>

      <SetGroup title="Delete account">
        <SetRow label="Delete your account" hint="Organisations where you're the only member are deleted with it.">
          <Button size="sm" variant="danger" onClick={() => setDialog("delete")}>
            Delete account…
          </Button>
        </SetRow>
      </SetGroup>

      {dialog === "profile" && <ProfileDialog onClose={() => setDialog(null)} />}
      {dialog === "password" && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <DeleteAccountDialog
          onClose={() => setDialog(null)}
          onDeleted={() => {
            qc.clear();
            navigate("/login");
          }}
        />
      )}
    </>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { me } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState(me.user.name);
  const [email, setEmail] = useState(me.user.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      title="Profile"
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await api("/me", { method: "PATCH", body: { name, email } });
          await qc.invalidateQueries({ queryKey: ["me"] });
          toast("Saved your profile");
          onClose();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
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
      {error && !fieldError(error, "name") && !fieldError(error, "email") ? <Callout tone="danger">{describeError(error, "Couldn't save your profile.")}</Callout> : null}
      <Field label="Name" error={fieldError(error, "name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <Field label="Email" hint="You sign in with this." error={fieldError(error, "email")}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
    </Dialog>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      title="Change password"
      description="Your other sessions are signed out when you save."
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await api("/me/password", { body: { current, next } });
          toast("Changed your password");
          onClose();
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!current || next.length < 10}>
            Change password
          </Button>
        </>
      }
    >
      {error && !fieldError(error, "next") ? <Callout tone="danger">{describeError(error, "Couldn't change your password.")}</Callout> : null}
      <Field label="Current password">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="New password" hint="At least 10 characters." error={fieldError(error, "next")}>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
    </Dialog>
  );
}

function DeleteAccountDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      title="Delete your account?"
      description="This can't be undone. Organisations where you're the only member, with all their projects and reports, are deleted too."
      onSubmit={async () => {
        const ok = await confirm({ title: "Delete your account for good?", confirmLabel: "Delete account", danger: true });
        if (!ok) return;
        setBusy(true);
        setError(null);
        try {
          await api("/me", { method: "DELETE", body: { password } });
          onDeleted();
        } catch (err) {
          setError(err);
          setBusy(false);
        }
      }}
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button type="submit" variant="danger-solid" busy={busy} disabled={!password}>
            Delete account
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't delete your account.")}</Callout> : null}
      <Field label="Your password">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </Field>
    </Dialog>
  );
}
