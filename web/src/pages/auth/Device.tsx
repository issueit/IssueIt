import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api, describeError } from "../../lib/api";
import { useMe } from "../../lib/session";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { Logo } from "../../components/app/Logo";
import { CheckCircleIcon, Code2Icon } from "../../components/ui/icons";

type Request = { name: string; scopes: string[]; expiresAt: string; status: string };

/**
 * Approving a sign-in from a terminal. The code is typed here rather than a
 * token being typed there, so nothing secret passes through a shell.
 */
export function DevicePage() {
  const [params] = useSearchParams();
  const me = useMe();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [request, setRequest] = useState<Request | null>(null);
  const [org, setOrg] = useState("");
  const [done, setDone] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const look = async (value: string) => {
    setError(null);
    setBusy(true);
    try {
      const { request: found } = await api<{ request: Request }>(`/me/device/${encodeURIComponent(value)}`);
      setRequest(found);
    } catch (err) {
      setRequest(null);
      setError(describeError(err, "Couldn't find that code."));
    } finally {
      setBusy(false);
    }
  };

  // A code in the address means the terminal printed a link; look it up at once.
  useEffect(() => {
    const given = params.get("code");
    if (given && me.data) void look(given);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/me/device/${encodeURIComponent(code)}`, { body: { approve, orgId: org || undefined } });
      setDone(approve ? "approved" : "denied");
    } catch (err) {
      setError(describeError(err, "Couldn't finish that."));
    } finally {
      setBusy(false);
    }
  };

  if (me.isPending) return <Centre><Skeleton h={18} w={200} /></Centre>;
  if (!me.data) {
    const next = `/device${code ? `?code=${encodeURIComponent(code)}` : ""}`;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
    return null;
  }

  if (done) {
    return (
      <Centre>
        <div className="flex flex-col items-center gap-2 text-center">
          {done === "approved" ? <CheckCircleIcon size={28} /> : <Code2Icon size={28} />}
          <h1 className="text-lg font-semibold">{done === "approved" ? "Signed in" : "Refused"}</h1>
          <p className="text-sm text-text-2 max-w-[320px]">
            {done === "approved" ? "Go back to your terminal; it has what it needs. You can close this." : "Nothing was granted. You can close this."}
          </p>
        </div>
      </Centre>
    );
  }

  return (
    <Centre>
      <div className="w-[380px] max-w-full">
        <div className="flex flex-col items-center gap-1.5 mb-5 text-center">
          <Logo />
          <h1 className="text-lg font-semibold mt-2">Sign in from a terminal</h1>
          <p className="text-sm text-text-2">Type the code your terminal is showing.</p>
        </div>

        {error && (
          <div className="mb-3">
            <Callout tone="danger">{error}</Callout>
          </div>
        )}

        {!request ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void look(code.trim());
            }}
          >
            <Field label="Code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WDJB-MJHT"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="mono text-center tracking-widest"
              />
            </Field>
            <Button type="submit" variant="primary" busy={busy} disabled={!code.trim()} className="w-full">
              Continue
            </Button>
          </form>
        ) : (
          <>
            <div className="set-group mb-3">
              <div className="set-row">
                <div className="flex-1">
                  <div className="text-sm font-medium">{request.name}</div>
                  <div className="hint">wants to act as you</div>
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-xs font-semibold text-text-3 mb-1.5">It will be able to</div>
                <ul className="flex flex-col gap-1">
                  {request.scopes.map((s) => (
                    <li key={s} className="text-sm text-text-2 flex items-center gap-1.5">
                      <code className="mono text-xs">{s}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {me.data.organisations.length > 1 && (
              <Field label="Organisation" hint="The token will only reach this one.">
                <Select
                  value={org || me.data.organisations[0].id}
                  onChange={(e) => setOrg(e.target.value)}
                  options={me.data.organisations.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Field>
            )}

            <p className="hint mb-3">Only approve this if you started it. The token lasts 90 days and can be revoked in Settings › Account tokens.</p>
            <div className="flex gap-2">
              <Button className="flex-1" busy={busy} onClick={() => decide(false)}>
                Refuse
              </Button>
              <Button className="flex-1" variant="primary" busy={busy} onClick={() => decide(true)}>
                Approve
              </Button>
            </div>
          </>
        )}
      </div>
    </Centre>
  );
}

const Centre = ({ children }: { children: React.ReactNode }) => <div className="min-h-screen flex items-center justify-center p-5">{children}</div>;
