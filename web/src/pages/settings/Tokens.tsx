import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useProjects, useTokens, useTokenScopes, type AccessToken, type NewToken } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { Button, IconButton } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/controls";
import { CodeBlock, CopyField } from "../../components/ui/Copy";
import { confirm, Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";
import { Callout, EmptyState, Skeleton, StatusPill } from "../../components/ui/feedback";
import { Menu } from "../../components/ui/Menu";
import { Sheet } from "../../components/ui/Sheet";
import { toast, toastError } from "../../components/ui/Toast";
import { AddIcon, Code2Icon, MenuDotsIcon, RefreshIcon, TrashBin2Icon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

/**
 * Account tokens: how the MCP server, the CLI and CI reach the management
 * API. Shown once, scoped, and optionally fenced to some projects.
 */
export function TokensSettings() {
  const tokens = useTokens();
  const scopes = useTokenScopes();
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<{ name: string; token: NewToken } | null>(null);
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["org", orgId, "tokens"] });

  const rotate = async (t: AccessToken) => {
    const ok = await confirm({
      title: `Rotate ${t.name}?`,
      message: "The current token stops working straight away. Anything still using it will be refused until you give it the new one.",
      confirmLabel: "Rotate token",
      danger: true,
    });
    if (!ok) return;
    try {
      const next = await api<NewToken>(path(`/tokens/${t.id}/rotate`), { body: {} });
      refresh();
      setIssued({ name: t.name, token: next });
    } catch (err) {
      toastError(describeError(err, "Couldn't rotate the token."));
    }
  };

  const revoke = async (t: AccessToken) => {
    const ok = await confirm({
      title: `Revoke ${t.name}?`,
      message: "The token stops working straight away and can't be restored. Anything using it will be refused.",
      confirmLabel: "Revoke token",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`/tokens/${t.id}`), { method: "DELETE" });
      refresh();
      toast(`Revoked ${t.name}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't revoke the token."));
    }
  };

  return (
    <div>
      <section className="mb-5">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="set-group__title !mb-0.5">Account tokens</h2>
            <p className="hint ml-0.5">For the MCP server, the command line and CI. Give each one only the scopes it needs.</p>
          </div>
          <Button size="sm" icon={AddIcon} onClick={() => setAdding(true)}>
            New token
          </Button>
        </div>
        <div className="set-group">
          {tokens.isPending ? (
            <div className="set-row">
              <Skeleton h={14} w="50%" />
            </div>
          ) : tokens.isError ? (
            <div className="p-3">
              <Callout tone="danger" action={<Button size="sm" onClick={() => tokens.refetch()}>Try again</Button>}>
                {describeError(tokens.error, "Couldn't load tokens.")}
              </Callout>
            </div>
          ) : !tokens.data.tokens.length ? (
            <div className="p-3">
              <EmptyState icon={Code2Icon} title="No account tokens" action={<Button size="sm" icon={AddIcon} onClick={() => setAdding(true)}>New token</Button>}>
                Create one to let a coding agent read your bug reports, or to drive Issueit from a script.
              </EmptyState>
            </div>
          ) : (
            tokens.data.tokens.map((t) => (
              <SetRow key={t.id} id={t.id} label={<span className="flex items-center gap-2">{t.name}{expiryPill(t)}</span>} hint={describeToken(t)}>
                <code className="mono text-xs text-text-2 select-text">{t.prefix}••••••••</code>
                <Menu
                  trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`More actions for ${t.name}`} />}
                  items={[
                    { label: "Rotate…", icon: RefreshIcon, onSelect: () => rotate(t) },
                    "separator",
                    { label: "Revoke…", icon: TrashBin2Icon, danger: true, onSelect: () => revoke(t) },
                  ]}
                />
              </SetRow>
            ))
          )}
        </div>
      </section>

      <SetGroup title="What a token can reach">
        <SetRow
          label="The management API"
          hint="Everything the dashboard uses, at /api/orgs/current, with the token as a bearer header. The organisation can be named 'current', so a client never has to learn its id."
        />
        <SetRow label="Not ingestion" hint="Reports are still sent with a project's own secret key, which can only create them." />
        <SetRow label="Not other tokens" hint="A token can never mint or revoke another one. That stays here, with a person signed in." />
      </SetGroup>

      {adding && (
        <NewTokenSheet
          scopes={scopes.data}
          onClose={() => setAdding(false)}
          onCreated={(name, token) => {
            setAdding(false);
            refresh();
            setIssued({ name, token });
          }}
        />
      )}
      <IssuedDialog issued={issued} onClose={() => setIssued(null)} />
    </div>
  );
}

/* ----------------------------------------------------------------- creating */

const groups: Array<{ heading: string; prefixes: string[] }> = [
  { heading: "Bug reports", prefixes: ["reports"] },
  { heading: "Projects", prefixes: ["projects", "keys"] },
  { heading: "Delivery", prefixes: ["destinations", "connections", "deliveries"] },
  { heading: "Organisation", prefixes: ["analytics", "org"] },
];

function NewTokenSheet({
  scopes,
  onClose,
  onCreated,
}: {
  scopes: { scopes: Array<{ id: string; label: string; ownerOnly: boolean }>; suggested: { agent: string[] }; role: string } | undefined;
  onClose: () => void;
  onCreated: (name: string, token: NewToken) => void;
}) {
  const { path } = useOrg();
  const projects = useProjects();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>(scopes?.suggested.agent ?? []);
  const [fenced, setFenced] = useState<string[]>([]);
  const [expires, setExpires] = useState("90");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const all = scopes?.scopes ?? [];
  const owner = scopes?.role === "owner";

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await api<NewToken>(path("/tokens"), {
        body: { name: name.trim(), scopes: chosen, projects: fenced.length ? fenced : null, expiresInDays: expires === "never" ? null : Number(expires) },
      });
      onCreated(name.trim(), token);
    } catch (err) {
      setError(describeError(err, "Couldn't create the token."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="New account token"
      subtitle="Shown once, so copy it before you close"
      onClose={onClose}
      locked={busy}
      footer={
        <>
          <Button variant="quiet" onClick={() => setChosen(scopes?.suggested.agent ?? [])}>
            Use the agent preset
          </Button>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!name.trim() || !chosen.length} onClick={create}>
            Create token
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}
      <Field label="Name" hint="Name it after where it will live, so you know what breaks if you revoke it.">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code on my laptop" maxLength={60} />
      </Field>

      <Field label="Expires" hint="A token that lives in an agent's config is worth replacing now and then.">
        <Select
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          options={[
            { value: "30", label: "In 30 days" },
            { value: "90", label: "In 90 days" },
            { value: "365", label: "In a year" },
            { value: "never", label: "Never" },
          ]}
        />
      </Field>

      <div className="set-group__title mt-4 mb-1.5">What it may do</div>
      {groups.map((g) => {
        const items = all.filter((s) => g.prefixes.includes(s.id.split(":")[0]));
        if (!items.length) return null;
        return (
          <div key={g.heading} className="mb-3">
            <div className="text-xs font-semibold text-text-3 mb-1">{g.heading}</div>
            <div className="flex flex-col gap-1.5">
              {items.map((s) => (
                <Checkbox key={s.id} checked={chosen.includes(s.id)} disabled={s.ownerOnly && !owner} onChange={() => toggle(s.id)}>
                  <span className="text-sm">{s.label}</span>
                  <code className="mono text-xs text-text-3 ml-1.5">{s.id}</code>
                  {s.ownerOnly && !owner && <span className="hint ml-1.5">owners only</span>}
                </Checkbox>
              ))}
            </div>
          </div>
        );
      })}

      <div className="set-group__title mt-4 mb-1.5">Which projects</div>
      <p className="hint mb-2">Leave every box clear to cover the whole organisation. Fencing a token to one project also hides organisation-wide figures from it.</p>
      <div className="flex flex-col gap-1.5">
        {(projects.data?.projects ?? []).map((p) => (
          <Checkbox key={p.id} checked={fenced.includes(p.id)} onChange={() => setFenced((f) => (f.includes(p.id) ? f.filter((x) => x !== p.id) : [...f, p.id]))}>
            <span className="text-sm">{p.name}</span>
          </Checkbox>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------- shown once */

function IssuedDialog({ issued, onClose }: { issued: { name: string; token: NewToken } | null; onClose: () => void }) {
  const mcp = issued ? JSON.stringify({ mcpServers: { issueit: issued.token.mcp } }, null, 2) : "";
  const cli = issued ? `claude mcp add issueit --env ISSUEIT_TOKEN=${issued.token.token}${issued.token.mcp.env.ISSUEIT_URL ? ` --env ISSUEIT_URL=${issued.token.mcp.env.ISSUEIT_URL}` : ""} -- npx -y @issueit/mcp` : "";
  return (
    <Dialog
      open={!!issued}
      onClose={onClose}
      width="wide"
      title={issued ? `${issued.name} token` : ""}
      description="Copy it now: Issueit keeps only a hash, so it can't be shown again. Rotate the token if you lose it."
      footer={
        <>
          <span className="mr-auto" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {issued && (
        <>
          <CopyField value={issued.token.token} what="account token" />
          <div className="set-group__title mt-4 mb-1.5">Add it to a coding agent</div>
          <CodeBlock code={cli} what="command" />
          <p className="hint mt-2 mb-1.5">Or by hand, in an MCP client's configuration file:</p>
          <CodeBlock code={mcp} what="MCP configuration" />
        </>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ helpers */

function describeToken(t: AccessToken) {
  const parts = [`${t.scopes.length} ${t.scopes.length === 1 ? "scope" : "scopes"}`];
  parts.push(t.projectIds?.length ? `${t.projectIds.length} ${t.projectIds.length === 1 ? "project" : "projects"}` : "every project");
  parts.push(t.lastUsedAt ? `used ${relativeTime(t.lastUsedAt)}${t.lastUsedIp ? ` from ${t.lastUsedIp}` : ""}` : "never used");

  if (!t.mine) parts.push(`created by ${t.userName}`);
  return parts.join(" · ");
}

function expiryPill(t: AccessToken) {
  if (!t.expiresAt) return null;
  const days = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / 86400_000);
  if (days > 14) return null;
  return (
    <StatusPill tone={days <= 0 ? "danger" : "warning"}>{days <= 0 ? "Expired" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`}</StatusPill>
  );
}
