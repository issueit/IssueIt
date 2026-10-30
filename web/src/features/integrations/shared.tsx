import { useState } from "react";
import { api, describeError, fieldError } from "../../lib/api";
import { useOrg } from "../../lib/session";
import type { Connection, Destination, Priority, ProviderInfo, RoutingRule, WebhookEvent } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Checkbox, RadioCards } from "../../components/ui/controls";
import { Field, Input } from "../../components/ui/Field";
import { Callout } from "../../components/ui/feedback";
import { SquareArrowRightUpIcon } from "../../components/ui/icons";
import { priorityLabels } from "../../components/app/status";

export const eventLabels: Record<WebhookEvent, string> = {
  "report.created": "A report is received",
  "report.updated": "A report's status or priority changes",
  "report.resolved": "A report is resolved",
  "report.closed": "A report is closed",
  "report.duplicate": "The same bug is reported again",
};

/** Short description of where a destination points, from its saved target. */
export function targetSummary(d: Pick<Destination, "provider" | "target" | "webhookHost">): string | null {
  const t = d.target as Record<string, string | string[] | undefined>;
  if (d.provider === "webhook") return d.webhookHost;
  const main = (t.repo ?? t.path ?? (t.teamName && `${t.teamName} team`) ?? (t.listName && (t.boardName ? `${t.boardName} / ${t.listName}` : t.listName)) ?? t.databaseName ?? t.projectName) as
    string | undefined;
  // Catalogue services store what was typed in; show the first value.
  return main ?? (Object.values(t).find((v) => typeof v === "string" && v) as string | undefined) ?? null;
}

export function ruleSummary(rule: RoutingRule): string {
  if (!rule.priorities?.length && !rule.sources?.length && !rule.environments?.length) return "All new reports";
  const names = (["critical", "high", "medium", "low"] as Priority[]).filter((p) => rule.priorities?.includes(p)).map((p) => priorityLabels[p].toLowerCase());
  let text = names.length ? `Only ${names.join(" and ")} priority reports` : "Only reports";
  if (rule.sources?.length) text += ` from ${rule.sources.join(", ")}`;
  if (rule.environments?.length) text += ` in ${rule.environments.join(", ")}`;
  return text;
}

/** "Send all new reports" or narrow it by priority. Advanced conditions fold away. */
export function RoutingFields({ rule, onChange }: { rule: RoutingRule; onChange: (r: RoutingRule) => void }) {
  const filtered = !!(rule.priorities?.length || rule.sources?.length || rule.environments?.length);
  const [mode, setMode] = useState<"all" | "some">(filtered ? "some" : "all");
  const toggle = (p: Priority, on: boolean) => {
    const set = new Set(rule.priorities ?? []);
    if (on) set.add(p);
    else set.delete(p);
    onChange({ ...rule, priorities: [...set] });
  };
  return (
    <div className="flex flex-col gap-2.5">
      <RadioCards
        ariaLabel="Which reports to send"
        value={mode}
        columns={2}
        onChange={(m) => {
          setMode(m);
          if (m === "all") onChange({});
          else if (!rule.priorities?.length) onChange({ ...rule, priorities: ["critical", "high"] });
        }}
        options={[
          { value: "all", title: "All new reports", hint: "The usual choice." },
          { value: "some", title: "Only some", hint: "Filter by priority or source." },
        ]}
      />
      {mode === "some" && (
        <div className="flex flex-col gap-3 pl-0.5">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {(["critical", "high", "medium", "low"] as Priority[]).map((p) => (
              <Checkbox key={p} checked={!!rule.priorities?.includes(p)} onChange={(on) => toggle(p, on)}>
                {priorityLabels[p]}
              </Checkbox>
            ))}
          </div>
          <Field label="Sources" optional hint="Comma-separated, e.g. widget, form, api, backend. Leave empty for any.">
            <Input defaultValue={rule.sources?.join(", ") ?? ""} placeholder="Any source" onBlur={(e) => onChange({ ...rule, sources: splitList(e.target.value) })} />
          </Field>
          <Field label="Environments" optional hint="Comma-separated, e.g. production. Leave empty for any.">
            <Input defaultValue={rule.environments?.join(", ") ?? ""} placeholder="Any environment" onBlur={(e) => onChange({ ...rule, environments: splitList(e.target.value) })} />
          </Field>
        </div>
      )}
    </div>
  );
}

export const splitList = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function EventFields({ events, onChange }: { events: WebhookEvent[]; onChange: (e: WebhookEvent[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {(Object.keys(eventLabels) as WebhookEvent[]).map((e) => (
        <Checkbox key={e} checked={events.includes(e)} onChange={(on) => onChange(on ? [...events, e] : events.filter((x) => x !== e))}>
          {eventLabels[e]} <span className="mono text-text-3 text-xs">{e}</span>
        </Checkbox>
      ))}
    </div>
  );
}

/** Connects with a pasted token or URL. The server checks it with the service before saving. */
export function TokenConnectForm({ provider, onConnected }: { provider: ProviderInfo; onConnected: (c: Connection) => void }) {
  const { path } = useOrg();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { connection } = await api<{ connection: Connection }>(path("/connections"), { body: { provider: provider.id, fields } });
      onConnected(connection);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const missing = provider.tokenFields.some((f) => !f.optional && !fields[f.key]?.trim());
  return (
    <div className="flex flex-col gap-3">
      {provider.tokenFields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} optional={f.optional} error={fieldError(error, f.key)}>
          <Input
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            placeholder={f.placeholder}
            className={f.secret ? "mono" : ""}
            value={fields[f.key] ?? ""}
            onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !missing && (e.preventDefault(), submit())}
          />
        </Field>
      ))}
      {error ? <Callout tone="danger">{describeError(error, `Couldn't connect to ${provider.name}.`)}</Callout> : null}
      <div className="flex items-center gap-3">
        <Button onClick={submit} busy={busy} disabled={missing}>
          {busy ? "Checking…" : "Connect"}
        </Button>
        {provider.tokenHelp && (
          <a href={provider.tokenHelp.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">
            {provider.tokenHelp.text}
            <SquareArrowRightUpIcon size={12} />
          </a>
        )}
      </div>
      <p className="hint">Issueit stores credentials encrypted and only uses them to deliver reports. They're never shown again.</p>
    </div>
  );
}
