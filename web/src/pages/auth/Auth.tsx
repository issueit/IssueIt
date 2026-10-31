import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError, fieldError } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/feedback";
import { Logo } from "../../components/app/Logo";

/** Only same-site paths are followed after sign-in. */
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[360px]">
        <div className="mb-8">
          <Logo />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-2">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-sm text-text-3">{footer}</div>}
      </div>
    </div>
  );
}

type AuthConfig = { allowSignup: boolean; email: boolean; edition: "hosted" | "selfhost" };

const useAuthConfig = () => useQuery({ queryKey: ["auth-config"], queryFn: () => api<AuthConfig>("/auth/config") });

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** Set once the password is right and only the code is left. */
  const [ticket, setTicket] = useState<string | null>(null);
  const config = useAuthConfig();
  const next = safeNext(params.get("next"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ twoFactor?: boolean; ticket?: string }>("/auth/login", { body: { email, password } });
      if (result.twoFactor && result.ticket) {
        setTicket(result.ticket);
        setBusy(false);
        return;
      }
      qc.clear();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  if (ticket) return <SecondFactor ticket={ticket} next={next} onRestart={() => setTicket(null)} />;

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Welcome back."
      footer={
        config.data?.allowSignup !== false && (
          <>
            New to Issueit?{" "}
            <Link to={`/signup${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-text underline underline-offset-2">
              Create an account
            </Link>
          </>
        )
      }
    >
      <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
        {error ? <Callout tone="danger">{describeError(error, "Couldn't sign you in. Try again.")}</Callout> : null}
        <Field label="Email">
          <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field
          label="Password"
          action={
            config.data?.email !== false ? (
              <Link to="/forgot" className="text-xs text-text-3 hover:text-text">
                Forgotten?
              </Link>
            ) : undefined
          }
        >
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" busy={busy} className="mt-1">
          Sign in
        </Button>
      </form>
    </AuthFrame>
  );
}

export function Signup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invitation = params.get("invite");
  const [form, setForm] = useState({ name: "", email: params.get("email") ?? "", password: "", organisation: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/signup", { body: { ...form, organisation: form.organisation || undefined, invitation: invitation ?? undefined } });
      if (invitation) await api(`/invitations/${invitation}/accept`, { body: {} });
      qc.clear();
      navigate(invitation ? "/inbox" : "/projects?new=1", { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const general = error && !Object.keys((error as { fields?: object }).fields ?? {}).length ? describeError(error, "Couldn't create your account. Try again.") : null;

  return (
    <AuthFrame
      title="Create your account"
      subtitle={invitation ? "You'll join the organisation that invited you." : "Collect bug reports and send them where you already work."}
      footer={
        <>
          Already have an account?{" "}
          <Link to={`/login${invitation ? `?next=/invite/${invitation}` : ""}`} className="text-text underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
        {general && <Callout tone="danger">{general}</Callout>}
        <Field label="Name" error={fieldError(error, "name")}>
          <Input autoComplete="name" autoFocus value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email" error={fieldError(error, "email")}>
          <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" hint="At least 10 characters." error={fieldError(error, "password")}>
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        {!invitation && (
          <Field label="Organisation" optional hint="Your team or company. You can change it later.">
            <Input autoComplete="organization" value={form.organisation} onChange={set("organisation")} />
          </Field>
        )}
        <Button type="submit" variant="primary" busy={busy} className="mt-1">
          Create account
        </Button>
      </form>
    </AuthFrame>
  );
}

/** For someone signed in who belongs to no organisation, e.g. after leaving their last one. */
export function CreateOrganisation() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <AuthFrame title="Create an organisation" subtitle="Projects, reports and integrations belong to an organisation.">
      <form
        className="flex flex-col gap-3.5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { id } = await api<{ id: string }>("/orgs", { body: { name } });
            localStorage.setItem("issueit.org", id);
            await qc.invalidateQueries({ queryKey: ["me"] });
            navigate("/projects?new=1", { replace: true });
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        {error ? <Callout tone="danger">{describeError(error, "Couldn't create the organisation.")}</Callout> : null}
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme" />
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
          Create organisation
        </Button>
      </form>
    </AuthFrame>
  );
}

/** The code from an authenticator app, or a recovery code. */
function SecondFactor({ ticket, next, onRestart }: { ticket: string; next: string; onRestart: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  return (
    <AuthFrame
      title="Two-step check"
      subtitle="Enter the six-digit code from your authenticator app. A recovery code works too."
      footer={
        <button type="button" className="text-text underline underline-offset-2" onClick={onRestart}>
          Start again
        </button>
      }
    >
      <form
        className="flex flex-col gap-3.5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const result = await api<{ recoveryCodeUsed?: boolean; recoveryCodesLeft?: number }>("/auth/second-factor", { body: { ticket, code } });
            qc.clear();
            navigate(result.recoveryCodeUsed ? "/settings/account?recovery=used" : next, { replace: true });
          } catch (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        {error ? <Callout tone="danger">{describeError(error, "That code didn't work.")}</Callout> : null}
        <Field label="Code">
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            className="mono tracking-[0.2em]"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={code.trim().length < 6}>
          Continue
        </Button>
      </form>
    </AuthFrame>
  );
}

/**
 * Asking for a reset link. Always says the same thing, because whether an
 * address has an account here isn't a stranger's business.
 */
export function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const config = useAuthConfig();

  if (config.data && !config.data.email) {
    return (
      <AuthFrame title="Resetting isn't set up" subtitle="This server has no mail server, so it can't send a reset link.">
        <Callout tone="info" title="Ask whoever runs it">
          An operator can set <code className="mono">SMTP_URL</code>, or change a password straight in the database.
        </Callout>
        <div className="mt-5">
          <Link to="/login" className="text-sm text-text underline underline-offset-2">
            Back to signing in
          </Link>
        </div>
      </AuthFrame>
    );
  }

  if (sent) {
    return (
      <AuthFrame title="Check your email" subtitle={`If ${email} has an account, a link to choose a new password is on its way. It lasts an hour.`}>
        <Callout tone="info">Nothing arrived? Look in spam, then try again — the link only goes to an address with an account.</Callout>
        <div className="mt-5 flex gap-3 text-sm">
          <Link to="/login" className="text-text underline underline-offset-2">
            Back to signing in
          </Link>
          <button type="button" className="text-text-3 hover:text-text" onClick={() => setSent(false)}>
            Use another address
          </button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/login" className="text-text underline underline-offset-2">
          Back to signing in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-3.5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/auth/forgot", { body: { email } });
            setSent(true);
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error ? <Callout tone="danger">{describeError(error, "Couldn't send that. Try again in a moment.")}</Callout> : null}
        <Field label="Email">
          <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={!email.trim()}>
          Send the link
        </Button>
      </form>
    </AuthFrame>
  );
}

/** Choosing a new password from the emailed link. */
export function Reset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthFrame title="That link is incomplete" subtitle="Open the link from the email again, or ask for another.">
        <Link to="/forgot" className="text-sm text-text underline underline-offset-2">
          Ask for another link
        </Link>
      </AuthFrame>
    );
  }
  if (ticket) return <SecondFactor ticket={ticket} next="/dashboard" onRestart={() => navigate("/login", { replace: true })} />;

  return (
    <AuthFrame title="Choose a new password" subtitle="Everything signed in before now will be signed out.">
      <form
        className="flex flex-col gap-3.5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const result = await api<{ twoFactor?: boolean; ticket?: string }>("/auth/reset", { body: { token, password } });
            if (result.twoFactor && result.ticket) {
              setTicket(result.ticket);
              return;
            }
            qc.clear();
            navigate("/dashboard", { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error ? <Callout tone="danger">{describeError(error, "Couldn't set that password.")}</Callout> : null}
        <Field label="New password" hint="At least 10 characters." error={fieldError(error, "password")}>
          <Input type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" busy={busy} disabled={password.length < 10}>
          Set password and sign in
        </Button>
      </form>
    </AuthFrame>
  );
}

/** The confirmation link from the "confirm your address" email. */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<unknown>(null);

  useQuery({
    queryKey: ["verify", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      try {
        await api("/auth/verify", { body: { token } });
        await qc.invalidateQueries({ queryKey: ["me"] });
        setState("done");
      } catch (err) {
        setError(err);
        setState("failed");
      }
      return true;
    },
  });

  if (!token || state === "failed") {
    return (
      <AuthFrame title="That link didn't work" subtitle={describeError(error, "It may have been used already, or expired.")}>
        <Callout tone="info">Ask for another from Settings › Account once you're signed in.</Callout>
        <div className="mt-5">
          <Link to="/settings/account" className="text-sm text-text underline underline-offset-2">
            Go to your account
          </Link>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={state === "done" ? "Address confirmed" : "Confirming…"} subtitle={state === "done" ? "Thanks. That's everything." : undefined}>
      {state === "done" && (
        <Link to="/dashboard" className="text-sm text-text underline underline-offset-2">
          Open Issueit
        </Link>
      )}
    </AuthFrame>
  );
}
