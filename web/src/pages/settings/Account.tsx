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
  const [dialog, setDialog] = useState<"profile" | "password" | "delete" | "two-factor" | "recovery" | "two-factor-off" | null>(null);
  const [resent, setResent] = useState(false);
  const authConfig = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ email: boolean }>("/auth/config") });
  const canEmail = authConfig.data?.email !== false;
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

      {!me.user.emailVerified && canEmail && (
        <div className="mb-4">
          <Callout
            tone="warning"
            title="Confirm your email address"
            action={
              <Button
                size="sm"
                disabled={resent}
                onClick={async () => {
                  try {
                    await api("/me/verify/send", { body: {} });
                    setResent(true);
                    toast(`Confirmation sent to ${me.user.email}`);
                  } catch (err) {
                    toastError(describeError(err, "Couldn't send that."));
                  }
                }}
              >
                {resent ? "Sent" : "Send again"}
              </Button>
            }
          >
            Until {me.user.email} is confirmed, Issueit can't send you a password reset if you're ever locked out.
          </Callout>
        </div>
      )}

      <SetGroup title="Profile">
        <SetRow
          label="Name and email"
          hint={
            <>
              {me.user.name} · {me.user.email}
              {me.user.emailVerified ? "" : " (unconfirmed)"}
            </>
          }
        >
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
          label="Two-step sign-in"
          hint={
            me.user.twoFactor
              ? `On. ${me.user.recoveryCodesLeft} recovery ${me.user.recoveryCodesLeft === 1 ? "code" : "codes"} left.`
              : "A six-digit code from your phone as well as your password. Worth it for an account that can see other people's bug reports."
          }
        >
          {me.user.twoFactor ? (
            <span className="flex gap-2">
              <Button size="sm" onClick={() => setDialog("recovery")}>
                New codes…
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDialog("two-factor-off")}>
                Turn off…
              </Button>
            </span>
          ) : (
            <Button size="sm" onClick={() => setDialog("two-factor")}>
              Set up…
            </Button>
          )}
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

      {dialog === "two-factor" && <TwoFactorDialog onClose={() => setDialog(null)} />}
      {dialog === "recovery" && <RecoveryCodesDialog onClose={() => setDialog(null)} />}
      {dialog === "two-factor-off" && <TwoFactorOffDialog onClose={() => setDialog(null)} />}
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

/** The codes, shown once. Copy them somewhere that isn't the phone with the app on it. */
function CodeList({ codes }: { codes: string[] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 p-3 rounded-md bg-surface-3 mono text-sm">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join("\n"));
            toast("Codes copied");
          }}
        >
          Copy all
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const blob = new Blob([`Issueit recovery codes\n\n${codes.join("\n")}\n`], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "issueit-recovery-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
      </div>
    </>
  );
}

/**
 * Setting up two-step sign-in. Two steps on purpose: the key is only turned
 * on once a code from it has worked, so a half-finished setup can't lock
 * anybody out.
 */
function TwoFactorDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useQuery({
    queryKey: ["totp-setup"],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const result = await api<{ secret: string; url: string }>("/me/totp", { body: {} });
      setSetup(result);
      return result;
    },
  });

  if (codes) {
    return (
      <Dialog open onClose={onClose} title="Two-step sign-in is on" description="Keep these recovery codes somewhere safe. Each one works once, if you ever lose the app." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <CodeList codes={codes} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      title="Set up two-step sign-in"
      description="Add the key below to an authenticator app, then enter the code it shows."
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          const result = await api<{ recoveryCodes: string[] }>("/me/totp/confirm", { body: { code } });
          await qc.invalidateQueries({ queryKey: ["me"] });
          setCodes(result.recoveryCodes);
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
          <Button type="submit" variant="primary" busy={busy} disabled={code.trim().length < 6}>
            Turn it on
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "That code didn't work.")}</Callout> : null}
      {setup ? (
        <>
          <Field label="Setup key" hint="Type this into Google Authenticator, 1Password, Bitwarden, Aegis — whatever you use.">
            <Input readOnly className="mono" value={setup.secret} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <p className="hint">
            On a phone,{" "}
            <a className="underline underline-offset-2" href={setup.url}>
              this link
            </a>{" "}
            opens your authenticator with the key already filled in.
          </p>
          <Field label="Code from the app">
            <Input autoFocus inputMode="numeric" autoComplete="one-time-code" className="mono tracking-[0.2em]" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </>
      ) : (
        <p className="hint">Making a key…</p>
      )}
    </Dialog>
  );
}

function RecoveryCodesDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (codes) {
    return (
      <Dialog open onClose={onClose} title="New recovery codes" description="The old ones no longer work." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <CodeList codes={codes} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      title="New recovery codes"
      description="Ten fresh codes. Any you still have written down stop working."
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          const result = await api<{ recoveryCodes: string[] }>("/me/totp/recovery", { body: { password } });
          await qc.invalidateQueries({ queryKey: ["me"] });
          setCodes(result.recoveryCodes);
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
          <Button type="submit" variant="primary" busy={busy} disabled={!password}>
            Make new codes
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't make new codes.")}</Callout> : null}
      <Field label="Your password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Dialog>
  );
}

function TwoFactorOffDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog
      open
      onClose={onClose}
      as="form"
      title="Turn off two-step sign-in?"
      description="Your password alone will be enough to sign in again."
      onSubmit={async () => {
        setBusy(true);
        setError(null);
        try {
          await api("/me/totp", { method: "DELETE", body: { password } });
          await qc.invalidateQueries({ queryKey: ["me"] });
          toast("Two-step sign-in is off");
          onClose();
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
            Turn it off
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't turn it off.")}</Callout> : null}
      <Field label="Your password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Dialog>
  );
}
