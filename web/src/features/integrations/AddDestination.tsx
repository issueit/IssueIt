import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError, fieldError } from "../../lib/api";
import { useConnections, useOrgQuery, useProviders } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Connection, Destination, ProviderCategory, ProviderInfo, RoutingRule, TargetOption, WebhookEvent } from "../../lib/types";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Button } from "../../components/ui/Button";
import { CopyField } from "../../components/ui/Copy";
import { RadioCards } from "../../components/ui/controls";
import { Field, Input, Select } from "../../components/ui/Field";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { MagnifierIcon, SquareArrowRightUpIcon } from "../../components/ui/icons";
import { Wizard } from "../../components/ui/Wizard";
import { toast } from "../../components/ui/Toast";
import { EventFields, RoutingFields, splitList, TokenConnectForm } from "./shared";
import { categoryLabels } from "./categories";

type Step = "choose" | "connect" | "setup" | "test";

/** "GitHub" rather than "GitHub Issues" when talking about the account. */
const brand = (p: ProviderInfo) => p.name.replace(/ Issues$/, "");

export type WizardStart = { provider?: string; connectionId?: string; error?: string };

type TestResult = { ok: true; externalUrl: string | null; externalId: string | null } | { ok: false; error: string };

export function AddDestination({ projectId, start, onClose }: { projectId: string; start: WizardStart; onClose: () => void }) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const providers = useProviders();
  const connections = useConnections();
  const [providerId, setProviderId] = useState(start.provider ?? "github");
  const [step, setStep] = useState<Step>(start.connectionId ? "setup" : start.provider ? "connect" : "choose");
  const [connectionId, setConnectionId] = useState<string | null>(start.connectionId ?? null);
  const [connectError, setConnectError] = useState<string | null>(start.error ?? null);
  const [target, setTarget] = useState<TargetOption | null>(null);
  const [typedTarget, setTypedTarget] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState("");
  const [rule, setRule] = useState<RoutingRule>({});
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["report.created"]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ destination: Destination; signingSecret: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [authorising, setAuthorising] = useState(false);

  const provider = providers.data?.providers.find((p) => p.id === providerId);
  const isWebhook = provider?.kind === "webhook";
  const steps = isWebhook ? ["Choose", "Set up", "Test"] : ["Choose", "Connect", "Set up", "Test"];
  const order: Step[] = isWebhook ? ["choose", "setup", "test"] : ["choose", "connect", "setup", "test"];
  const index = order.indexOf(step);
  const accounts = (connections.data?.connections ?? []).filter((c) => c.provider === providerId);
  const typedFields = provider?.targetFields ?? [];
  const hasPicker = !!provider?.targetLabel && !typedFields.length;

  // Pre-select the only account so Continue is ready on arrival.
  useEffect(() => {
    if (step === "connect" && !connectionId && accounts.length === 1 && accounts[0].status === "active") setConnectionId(accounts[0].id);
  }, [step, accounts, connectionId]);

  const targets = useOrgQuery<{ targets: TargetOption[] }>("targets", [connectionId], `/connections/${connectionId}/targets`, {
    enabled: step === "setup" && !!connectionId && hasPicker,
  });

  const authorise = async () => {
    setAuthorising(true);
    try {
      const { url } = await api<{ url: string }>(path(`/connections/authorize/${providerId}`), {
        body: { returnTo: `/projects/${projectId}/integrations` },
      });
      window.location.href = url;
    } catch (err) {
      setConnectError(describeError(err, `Couldn't start connecting to ${provider?.name}.`));
      setAuthorising(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api<{ destination: Destination; signingSecret: string | null }>(path(`/projects/${projectId}/destinations`), {
        body: isWebhook
          ? { provider: providerId, url, events, rule }
          : { provider: providerId, connectionId, target: typedFields.length ? typedTarget : (target?.value ?? {}), labels: labels ? splitList(labels) : undefined, rule },
      });
      setCreated(result);
      qc.invalidateQueries({ queryKey: ["org", orgId, "destinations"] });
      qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
      setStep("test");
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!created) return;
    setTesting(true);
    setTest(null);
    try {
      setTest(await api<TestResult>(path(`/projects/${projectId}/destinations/${created.destination.id}/test`), { body: {} }));
    } catch (err) {
      setTest({ ok: false, error: describeError(err, "Couldn't send the test.") });
    } finally {
      setTesting(false);
      qc.invalidateQueries({ queryKey: ["org", orgId, "destinations"] });
      qc.invalidateQueries({ queryKey: ["org", orgId, "deliveries"] });
    }
  };

  const finish = () => {
    if (created) toast(`Added ${created.destination.name}`);
    onClose();
  };

  const next = () => {
    if (step === "choose") setStep(isWebhook ? "setup" : "connect");
    else if (step === "connect") setStep("setup");
    else if (step === "setup") save();
    else finish();
  };

  const back = index > 0 && step !== "test" ? () => setStep(order[index - 1]) : undefined;

  let blocking: string | null = null;
  if (step === "connect" && !connectionId) blocking = "Connect an account first.";
  if (step === "setup" && isWebhook && !url.trim()) blocking = "Enter the URL to send events to.";
  if (step === "setup" && isWebhook && !events.length) blocking = "Choose at least one event.";
  if (step === "setup" && !isWebhook && hasPicker && !target) blocking = `Choose a ${provider!.targetLabel!.toLowerCase()}.`;
  const missingTyped = step === "setup" ? typedFields.find((f) => !f.optional && !typedTarget[f.key]?.trim()) : undefined;
  if (missingTyped) blocking = `Enter the ${missingTyped.label.toLowerCase()}.`;
  if (step === "setup" && rule.priorities && rule.priorities.length === 0 && Object.keys(rule).length) blocking = "Choose at least one priority.";

  return (
    <Wizard
      open
      onClose={created ? finish : onClose}
      title={step === "choose" || !provider ? "Add destination" : `Add ${provider.name}`}
      steps={steps}
      current={index}
      onBack={back}
      busy={saving}
      blocking={blocking}
      primary={{
        label: step === "setup" ? "Save and continue" : step === "test" ? "Done" : "Continue",
        onClick: next,
        disabled: !!blocking || (step === "choose" && !provider),
        quiet: step === "test" && !test?.ok,
      }}
    >
      {step === "choose" && (
        <ChooseStep
          providers={providers.data?.providers}
          value={providerId}
          onChange={(id) => {
            setProviderId(id);
            setTypedTarget({});
            setTarget(null);
          }}
        />
      )}

      {step === "connect" && provider && (
        <ConnectStep
          provider={provider}
          accounts={accounts}
          connectionId={connectionId}
          setConnectionId={setConnectionId}
          error={connectError}
          authorising={authorising}
          onAuthorise={authorise}
          onConnected={(c) => {
            qc.invalidateQueries({ queryKey: ["org", orgId, "connections"] });
            setConnectionId(c.id);
            setConnectError(null);
            toast(`Connected ${c.account.label}`);
          }}
        />
      )}

      {step === "setup" && provider && (
        <>
          <p className="wizard-lead">{isWebhook ? "Where Issueit should send events, and which ones." : `Choose where in ${brand(provider)} new reports should go.`}</p>
          {saveError && !fieldError(saveError, "url") ? <Callout tone="danger">{describeError(saveError, "Couldn't save the destination.")}</Callout> : null}
          {isWebhook ? (
            <>
              <Field label="Endpoint URL" hint="Must be reachable from the internet. Issueit signs every request so you can check it came from here." error={fieldError(saveError, "url")}>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/issueit" className="mono" />
              </Field>
              <div className="field">
                <span className="field__label">Send when</span>
                <EventFields events={events} onChange={setEvents} />
              </div>
            </>
          ) : typedFields.length ? (
            typedFields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} optional={f.optional} error={fieldError(saveError, f.key)}>
                <Input
                  value={typedTarget[f.key] ?? ""}
                  onChange={(e) => setTypedTarget({ ...typedTarget, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
            ))
          ) : (
            hasPicker && <TargetPicker label={provider.targetLabel!} query={targets} value={target} onChange={setTarget} />
          )}
          {(providerId === "github" || providerId === "gitlab") && (
            <Field label="Labels" optional hint="Comma-separated. GitHub creates labels that don't exist yet.">
              <Input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="bug, from-users" />
            </Field>
          )}
          <div className="field">
            <span className="field__label">Which reports</span>
            <RoutingFields rule={rule} onChange={setRule} />
          </div>
        </>
      )}

      {step === "test" && created && provider && (
        <TestStep provider={provider} destination={created.destination} signingSecret={created.signingSecret} testing={testing} result={test} onTest={runTest} />
      )}
    </Wizard>
  );
}

/** Over a hundred services: a search, a category filter, and a list that scrolls. */
function ChooseStep({ providers, value, onChange }: { providers?: ProviderInfo[]; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCategory | "all">("all");
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (providers ?? []).filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      const haystack = `${p.name} ${p.id} ${p.keywords.join(" ")} ${categoryLabels[p.category].plural}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [providers, query, category]);
  if (!providers) return <Skeleton h={220} />;
  const counts = new Map<ProviderCategory, number>();
  for (const p of providers) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const selected = shown.find((p) => p.id === value);
  return (
    <>
      <p className="wizard-lead">Where should new reports go? You can add more than one destination.</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifierIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-4 pointer-events-none" />
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${providers.length} services`} aria-label="Search services" className="!pl-8" />
        </div>
        <Select
          aria-label="Kind of service"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProviderCategory | "all")}
          className="!w-auto"
          options={[
            { value: "all", label: "All kinds" },
            ...(Object.keys(categoryLabels) as ProviderCategory[]).filter((c) => counts.get(c)).map((c) => ({ value: c, label: `${categoryLabels[c].plural} (${counts.get(c)})` })),
          ]}
        />
      </div>
      <div className="max-h-[330px] overflow-y-auto -mx-1 px-1 py-0.5">
        {shown.length ? (
          <RadioCards
            ariaLabel="Service"
            value={value}
            onChange={onChange}
            columns={2}
            options={shown.map((p) => ({
              value: p.id,
              icon: <BrandIcon provider={p.id} name={p.name} size={16} framed />,
              title: p.name,
              hint: categoryLabels[p.category].one,
            }))}
          />
        ) : (
          <p className="hint py-6 text-center">Nothing matches "{query}". A webhook can reach any service that accepts HTTP requests.</p>
        )}
      </div>
      <p className="hint">{selected ? `${selected.name}: ${selected.summary}` : "Choose a service."}</p>
    </>
  );
}

function ConnectStep({
  provider,
  accounts,
  connectionId,
  setConnectionId,
  error,
  authorising,
  onAuthorise,
  onConnected,
}: {
  provider: ProviderInfo;
  accounts: Connection[];
  connectionId: string | null;
  setConnectionId: (id: string | null) => void;
  error: string | null;
  authorising: boolean;
  onAuthorise: () => void;
  onConnected: (c: Connection) => void;
}) {
  const [adding, setAdding] = useState(accounts.length === 0);
  const [useToken, setUseToken] = useState(!provider.oauth);
  return (
    <>
      <p className="wizard-lead">
        {accounts.length ? `Use a connected ${brand(provider)} account, or connect another.` : `Connect the ${brand(provider)} account Issueit should deliver reports with.`}
      </p>
      {error && <Callout tone="danger">{error}</Callout>}
      {accounts.length > 0 && (
        <RadioCards
          ariaLabel="Account"
          value={connectionId ?? ""}
          onChange={(id) => {
            setConnectionId(id);
            setAdding(false);
          }}
          options={accounts.map((a) => ({
            value: a.id,
            icon: <BrandIcon provider={a.provider} size={16} framed />,
            title: a.account.label,
            hint: a.status === "error" ? (a.lastError ?? "Needs reconnecting") : a.authType === "oauth" ? "Connected with sign-in" : "Connected with a token",
          }))}
        />
      )}
      {accounts.length > 0 && !adding && (
        <div>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setAdding(true);
              setConnectionId(null);
            }}
          >
            Connect another account…
          </Button>
        </div>
      )}
      {adding && (
        <div className="flex flex-col gap-3">
          {provider.oauth && !useToken && (
            <div className="flex flex-col gap-2 items-start">
              <Button icon={SquareArrowRightUpIcon} onClick={onAuthorise} busy={authorising}>
                Connect with {brand(provider)}…
              </Button>
              <p className="hint">You'll sign in on {brand(provider)} and come straight back here.</p>
              {provider.tokenFields.length > 0 && (
                <button type="button" className="text-xs text-text-3 hover:text-text underline underline-offset-2" onClick={() => setUseToken(true)}>
                  Use a token instead
                </button>
              )}
            </div>
          )}
          {useToken && (
            <>
              {provider.oauthPossible && !provider.oauth && provider.id !== "discord" && provider.id !== "slack" && (
                <p className="hint">Signing in with {brand(provider)} isn't set up on this server, so connect with a token.</p>
              )}
              <TokenConnectForm provider={provider} onConnected={onConnected} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function TargetPicker({
  label,
  query,
  value,
  onChange,
}: {
  label: string;
  query: ReturnType<typeof useOrgQuery<{ targets: TargetOption[] }>>;
  value: TargetOption | null;
  onChange: (t: TargetOption | null) => void;
}) {
  const [filter, setFilter] = useState("");
  const options = useMemo(() => {
    const all = query.data?.targets ?? [];
    const f = filter.toLowerCase();
    return f ? all.filter((t) => `${t.label} ${t.hint ?? ""}`.toLowerCase().includes(f)) : all;
  }, [query.data, filter]);

  if (query.isPending) return <Skeleton h={58} />;
  if (query.isError)
    return (
      <Callout
        tone="danger"
        action={
          <Button size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      >
        {describeError(query.error, `Couldn't load the list of ${label.toLowerCase()}s.`)}
      </Callout>
    );
  if (!query.data.targets.length)
    return (
      <Callout tone="warning" title={`No ${label.toLowerCase()}s found`}>
        This account can't see any {label.toLowerCase()}s yet. Check its permissions, then go back and choose the account again.
      </Callout>
    );
  const many = query.data.targets.length > 12;
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {many && (
        <Input placeholder={`Filter ${query.data.targets.length} ${label.toLowerCase()}s`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={`Filter ${label.toLowerCase()}s`} />
      )}
      <Select
        aria-label={label}
        size={many ? 8 : undefined}
        className={many ? "!h-auto py-1" : ""}
        value={value?.id ?? ""}
        onChange={(e) => onChange(query.data!.targets.find((t) => t.id === e.target.value) ?? null)}
        options={[...(many ? [] : [{ value: "", label: `Choose a ${label.toLowerCase()}` }]), ...options.map((t) => ({ value: t.id, label: t.hint ? `${t.label} - ${t.hint}` : t.label }))]}
      />
    </div>
  );
}

function TestStep({
  provider,
  destination,
  signingSecret,
  testing,
  result,
  onTest,
}: {
  provider: ProviderInfo;
  destination: Destination;
  signingSecret: string | null;
  testing: boolean;
  result: TestResult | null;
  onTest: () => void;
}) {
  const consequence: Record<ProviderCategory, string> = {
    tracker: `Creates a real ${provider.id === "trello" ? "card" : provider.id === "notion" ? "page" : provider.id === "clickup" ? "task" : "item"} titled "Test report from Issueit" in ${destination.name}. You can delete it afterwards.`,
    helpdesk: `Opens a real ticket titled "Test report from Issueit". You can close it afterwards.`,
    data: `Adds a row titled "Test report from Issueit". You can delete it afterwards.`,
    chat: "Posts a message marked as a test.",
    notify: "Sends a notification marked as a test. Texts may cost you a message credit.",
    email: "Sends an email marked as a test to the recipients.",
    oncall: "Triggers a real alert marked as a test, which may page whoever is on call. Resolve it afterwards.",
    automation: `Starts the workflow with a report.created event marked "test": true.`,
    analytics: "Records an event marked as a test.",
    cloud: `Publishes a report.created event marked "test": true.`,
    webhook: `Sends a signed report.created event marked "test": true.`,
  };
  return (
    <>
      <Callout tone="success" title="Saved">
        New reports {destination.rule.priorities?.length ? "that match your filter " : ""}will go to {destination.name}. Check it works with a test.
      </Callout>
      {signingSecret && (
        <Field label="Signing secret" hint="Use it to verify the Issueit-Signature header. You can show it again from the destination's menu.">
          <div>
            <CopyField value={signingSecret} what="signing secret" />
          </div>
        </Field>
      )}
      <div className="flex flex-col gap-2 items-start">
        <Button onClick={onTest} busy={testing}>
          {result ? "Send another test" : "Send test report"}
        </Button>
        <p className="hint">{consequence[provider.category]}</p>
      </div>
      {result &&
        (result.ok ? (
          <Callout
            tone="success"
            title="Test delivered"
            action={
              result.externalUrl && (
                <a href={result.externalUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm">
                  Open {result.externalId ?? ""}
                  <SquareArrowRightUpIcon size={12} />
                </a>
              )
            }
          >
            {provider.name} accepted it. You're ready to receive reports.
          </Callout>
        ) : (
          <Callout tone="danger" title="The test didn't arrive">
            {result.error}
          </Callout>
        ))}
    </>
  );
}
