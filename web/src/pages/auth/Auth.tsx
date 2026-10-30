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

export function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ allowSignup: boolean }>("/auth/config") });
  const next = safeNext(params.get("next"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { body: { email, password } });
      qc.clear();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

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
        <Field label="Password">
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
