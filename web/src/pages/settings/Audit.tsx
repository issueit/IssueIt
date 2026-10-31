import { useState } from "react";
import { describeError } from "../../lib/api";
import { fullDate, relativeTime } from "../../lib/format";
import { useAudit } from "../../lib/queries";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Field";
import { Callout, EmptyState, SkeletonRows, StatusPill } from "../../components/ui/feedback";
import { ChecklistMinimalisticIcon, MagnifierIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

/** Who changed what, by hand in the dashboard or through a token. */
export function AuditSettings() {
  const [actor, setActor] = useState("");
  const events = useAudit({ actor: actor.trim() || undefined });

  return (
    <div>
      <SetGroup title="Audit log">
        <SetRow
          label="Every change, newest first"
          hint="Records changes made in the dashboard and by account tokens. Reading is never recorded, nor are reports arriving."
        >
          <div className="w-[220px]">
            <Input size_="sm" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filter by who" aria-label="Filter by who" />
          </div>
        </SetRow>
      </SetGroup>

      {events.isPending ? (
        <SkeletonRows rows={6} />
      ) : events.isError ? (
        <Callout tone="danger" action={<Button size="sm" onClick={() => events.refetch()}>Try again</Button>}>
          {describeError(events.error, "Couldn't load the audit log.")}
        </Callout>
      ) : !events.data.events.length ? (
        <EmptyState icon={actor ? MagnifierIcon : ChecklistMinimalisticIcon} title={actor ? "Nothing matches" : "Nothing recorded yet"}>
          {actor ? "No changes by anyone with that name." : "Changes you make from here on will be listed."}
        </EmptyState>
      ) : (
        <div className="set-group">
          {events.data.events.map((e) => (
            <SetRow
              key={e.id}
              label={
                <span className="flex items-center gap-2">
                  <code className="mono text-xs">{e.action}</code>
                  {e.via === "token" && <StatusPill tone="update">{e.tokenName ?? "token"}</StatusPill>}
                </span>
              }
              hint={[e.actor, e.target, e.ip].filter(Boolean).join(" · ")}
            >
              <span className="text-xs text-text-3 whitespace-nowrap" title={fullDate(e.createdAt)}>
                {relativeTime(e.createdAt)}
              </span>
            </SetRow>
          ))}
        </div>
      )}
    </div>
  );
}
