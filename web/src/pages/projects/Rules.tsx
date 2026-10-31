import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrg } from "../../lib/session";
import { Button, IconButton } from "../../components/ui/Button";
import { Switch } from "../../components/ui/controls";
import { Field, Input } from "../../components/ui/Field";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { toast, toastError } from "../../components/ui/Toast";
import { AddIcon, TrashBin2Icon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { useProjectContext } from "./ProjectLayout";

import type { ProjectRules as Rules } from "../../lib/types";

type Pattern = NonNullable<NonNullable<Rules["redaction"]>["patterns"]>[number];

type Preview = {
  problems: string[];
  grouping: {
    sampled: number;
    distinctNow: number;
    distinctAfter: number;
    merged: Array<{ size: number; reports: Array<{ number: number; title: string }> }>;
    examples: Array<{ number: number; title: string; normalisedTitle: string; normalisedPage: string }>;
  };
  redaction: { before: string; after: string } | null;
};

/**
 * Grouping and redaction rules, tried against this project's real reports
 * before they are saved. A rule you can't see the effect of is a rule
 * nobody dares change.
 */
export function ProjectRules() {
  const { project } = useProjectContext();
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const saved = (project.rules ?? {}) as Rules;

  const [rules, setRules] = useState<Rules>(saved);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const changed = useMemo(() => JSON.stringify(rules) !== JSON.stringify(saved), [rules, saved]);

  // Try the rules out as they're typed, but not on every keystroke.
  useEffect(() => {
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        setPreview(await api<Preview>(path(`/projects/${project.id}/rules/preview`), { body: { ...rules, text: sample || undefined } }));
      } catch (err) {
        toastError(describeError(err, "Couldn't try those rules."));
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [rules, sample, path, project.id]);

  const save = async () => {
    setSaving(true);
    try {
      await api(path(`/projects/${project.id}`), { method: "PATCH", body: { rules } });
      qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
      toast("Rules saved");
    } catch (err) {
      toastError(describeError(err, "Couldn't save the rules."));
    } finally {
      setSaving(false);
    }
  };

  const grouping = rules.grouping ?? {};
  const patterns = rules.redaction?.patterns ?? [];
  const setGrouping = (next: Partial<NonNullable<Rules["grouping"]>>) => setRules((r) => ({ ...r, grouping: { ...r.grouping, ...next } }));
  const setPatterns = (next: Pattern[]) => setRules((r) => ({ ...r, redaction: { patterns: next } }));

  return (
    <div className="page-body page-body--narrow">
      {preview?.problems.length ? (
        <div className="mb-3">
          <Callout tone="danger" title="These won't be used until they're valid">
            <ul className="flex flex-col gap-1">
              {preview.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}

      <SetGroup title="Recognising duplicates">
        <SetRow
          label="Ignore the page"
          hint="Compare titles only. Use this when the same bug is reported from everywhere, such as a broken header."
        >
          <Switch checked={!!grouping.ignorePage} onChange={(v) => setGrouping({ ignorePage: v })} label="Ignore the page" />
        </SetRow>
        <SetRow label="Compare this many path segments" hint="0 compares the whole path. 2 makes /docs/a and /docs/b one page.">
          <div className="w-[90px]">
            <Input
              type="number"
              min={0}
              max={10}
              size_="sm"
              value={grouping.pathDepth ?? 0}
              disabled={!!grouping.ignorePage}
              onChange={(e) => setGrouping({ pathDepth: Number(e.target.value) || undefined })}
            />
          </div>
        </SetRow>
      </SetGroup>

      <section className="mb-5">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="set-group__title !mb-0.5">Removed from titles before comparing</h2>
            <p className="hint ml-0.5">Regular expressions. Issueit already folds numbers, ids and punctuation; add what's particular to you.</p>
          </div>
          <Button size="sm" icon={AddIcon} onClick={() => setGrouping({ titlePatterns: [...(grouping.titlePatterns ?? []), ""] })}>
            Add
          </Button>
        </div>
        <div className="set-group">
          {!(grouping.titlePatterns ?? []).length ? (
            <SetRow label="None" hint={'For example, "order #\\d+" so two orders failing the same way count as one bug.'} />
          ) : (
            (grouping.titlePatterns ?? []).map((pattern, i) => (
              <div key={i} className="set-row gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    size_="sm"
                    className="mono"
                    value={pattern}
                    placeholder="order #\d+"
                    onChange={(e) => {
                      const next = [...(grouping.titlePatterns ?? [])];
                      next[i] = e.target.value;
                      setGrouping({ titlePatterns: next });
                    }}
                  />
                </div>
                <IconButton
                  size="sm"
                  icon={TrashBin2Icon}
                  label="Remove this pattern"
                  onClick={() => setGrouping({ titlePatterns: (grouping.titlePatterns ?? []).filter((_, j) => j !== i) })}
                />
              </div>
            ))
          )}
        </div>
      </section>

      {preview && (
        <SetGroup title="What that would do">
          <SetRow
            label={`${preview.grouping.distinctNow} distinct bugs now, ${preview.grouping.distinctAfter} after`}
            hint={`Tried against the last ${preview.grouping.sampled} reports.${busy ? " Working…" : ""}`}
          />
          {preview.grouping.merged.slice(0, 4).map((group, i) => (
            <SetRow key={i} label={`${group.size} reports would be one bug`} hint={group.reports.map((r) => `#${r.number} ${r.title}`).join(" · ")} />
          ))}
          {preview.grouping.examples.slice(0, 3).map((e) => (
            <SetRow key={e.number} label={<span className="mono text-xs">{e.normalisedTitle || "(nothing left, so it won't group)"}</span>} hint={`#${e.number} ${e.title} — page ${e.normalisedPage || "(none)"}`} />
          ))}
        </SetGroup>
      )}

      <section className="mb-5">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="set-group__title !mb-0.5">Also remove from captured text</h2>
            <p className="hint ml-0.5">Emails, tokens, card numbers and long keys are already removed. Add your own identifiers.</p>
          </div>
          <Button size="sm" icon={AddIcon} onClick={() => setPatterns([...patterns, { pattern: "", label: "" }])}>
            Add
          </Button>
        </div>
        <div className="set-group">
          {!patterns.length ? (
            <SetRow label="None" hint={'For example, "cust_[a-z0-9]+" replaced with [customer].'} />
          ) : (
            patterns.map((rule, i) => (
              <div key={i} className="set-row gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    size_="sm"
                    className="mono"
                    value={rule.pattern}
                    placeholder="cust_[a-z0-9]+"
                    onChange={(e) => setPatterns(patterns.map((p, j) => (j === i ? { ...p, pattern: e.target.value } : p)))}
                  />
                </div>
                <div className="w-[140px] shrink-0">
                  <Input
                    size_="sm"
                    value={rule.label ?? ""}
                    placeholder="customer"
                    aria-label="Replaced with"
                    onChange={(e) => setPatterns(patterns.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))}
                  />
                </div>
                <IconButton size="sm" icon={TrashBin2Icon} label="Remove this pattern" onClick={() => setPatterns(patterns.filter((_, j) => j !== i))} />
              </div>
            ))
          )}
        </div>
      </section>

      <SetGroup title="Try it on some text">
        <div className="p-3.5 flex flex-col gap-2">
          <Field label="Text" hint="Left empty, recent console messages from this project are used.">
            <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="charge failed for cust_8812" />
          </Field>
          {preview?.redaction ? (
            <>
              <div className="hint">After:</div>
              <pre className="mono text-xs bg-surface-3 rounded p-2 whitespace-pre-wrap break-words max-h-[180px] overflow-auto">{preview.redaction.after}</pre>
            </>
          ) : (
            <Skeleton h={48} />
          )}
        </div>
      </SetGroup>

      <div className="flex gap-2 items-center">
        <Button variant="primary" busy={saving} disabled={!changed || !!preview?.problems.length} onClick={save}>
          Save rules
        </Button>
        {changed && (
          <Button onClick={() => setRules(saved)} disabled={saving}>
            Discard
          </Button>
        )}
        {changed && <span className="hint">Rules apply to reports that arrive from now on, not to ones already stored.</span>}
      </div>
    </div>
  );
}
