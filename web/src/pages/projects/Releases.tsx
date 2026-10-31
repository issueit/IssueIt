import { describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useOrgQuery } from "../../lib/queries";
import { Button } from "../../components/ui/Button";
import { CodeBlock } from "../../components/ui/Copy";
import { Callout, EmptyState, Skeleton, StatusPill } from "../../components/ui/feedback";
import { Code2Icon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { useProjectContext } from "./ProjectLayout";

type Release = {
  id: string;
  version: string;
  dist: string | null;
  commit: string | null;
  url: string | null;
  createdAt: string;
  maps: number;
  reports: number;
};

/**
 * Builds and their source maps. A report that names its release gets its
 * stacks mapped back when someone reads it, so uploading maps after a crash
 * still helps.
 */
export function ProjectReleases() {
  const { project } = useProjectContext();
  const releases = useOrgQuery<{ releases: Release[] }>("releases", [project.id], `/projects/${project.id}/releases`);

  return (
    <div className="page-body page-body--narrow">
      <section className="mb-5">
        <h2 className="set-group__title !mb-0.5">Releases</h2>
        <p className="hint ml-0.5 mb-2">Send a <code className="mono">release</code> with each report, upload that build's source maps, and minified stacks read as your own files.</p>
        <div className="set-group">
          {releases.isPending ? (
            <div className="set-row">
              <Skeleton h={14} w="50%" />
            </div>
          ) : releases.isError ? (
            <div className="p-3">
              <Callout tone="danger" action={<Button size="sm" onClick={() => releases.refetch()}>Try again</Button>}>
                {describeError(releases.error, "Couldn't load releases.")}
              </Callout>
            </div>
          ) : !releases.data.releases.length ? (
            <div className="p-3">
              <EmptyState icon={Code2Icon} title="No releases yet">
                Upload a build's source maps and it will appear here.
              </EmptyState>
            </div>
          ) : (
            releases.data.releases.map((r) => (
              <SetRow
                key={r.id}
                label={
                  <span className="flex items-center gap-2">
                    <span className="mono text-sm">{r.version}</span>
                    {r.dist && <StatusPill>{r.dist}</StatusPill>}
                    {r.maps ? <StatusPill tone="success">{r.maps} map{r.maps === 1 ? "" : "s"}</StatusPill> : <StatusPill tone="warning">no maps</StatusPill>}
                  </span>
                }
                hint={[
                  `${r.reports} report${r.reports === 1 ? "" : "s"}`,
                  r.commit ? `commit ${r.commit.slice(0, 8)}` : "",
                  `uploaded ${relativeTime(r.createdAt)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {r.url && (
                  <a className="text-xs text-text-2 hover:text-text" href={r.url} target="_blank" rel="noreferrer">
                    View code
                  </a>
                )}
              </SetRow>
            ))
          )}
        </div>
      </section>

      <SetGroup title="Uploading maps">
        <div className="p-3.5 flex flex-col gap-3">
          <p className="hint">From your build, after the bundle is written:</p>
          <CodeBlock code={`npx issueit sourcemaps upload dist --release "$GIT_SHA" --prefix assets`} what="command" />
          <p className="hint">
            <code className="mono">--prefix</code> is the path the browser sees, so <code className="mono">dist/app.js</code> served at{" "}
            <code className="mono">/assets/app.js</code> needs <code className="mono">--prefix assets</code>. Then send the same value as{" "}
            <code className="mono">release</code> with every report.
          </p>
          <CodeBlock
            code={`fetch("…/reports", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title, release: process.env.GIT_SHA }),
});`}
            what="example"
          />
        </div>
      </SetGroup>
    </div>
  );
}
