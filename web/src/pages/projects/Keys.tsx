import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useKeys } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { Button, IconButton } from "../../components/ui/Button";
import { CodeBlock, CopyField, copyText } from "../../components/ui/Copy";
import { confirm, Dialog, prompt } from "../../components/ui/Dialog";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { Menu } from "../../components/ui/Menu";
import { toast, toastError } from "../../components/ui/Toast";
import { AddIcon, CopyIcon, EyeClosedIcon, EyeIcon, MenuDotsIcon, RefreshIcon, TrashBin2Icon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { useProjectContext } from "./ProjectLayout";
import { serverSnippet } from "./snippets";

export function ProjectKeys() {
  const { project, links } = useProjectContext();
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const keys = useKeys(project.id);
  const [shown, setShown] = useState<{ title: string; key: string } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const base = `/projects/${project.id}/keys`;
  const refresh = () => qc.invalidateQueries({ queryKey: ["org", orgId, "keys", project.id] });

  const reveal = async (id: string) => {
    if (revealed[id]) return revealed[id];
    const { key } = await api<{ key: string }>(path(`${base}/${id}/reveal`), { body: {} });
    setRevealed((r) => ({ ...r, [id]: key }));
    return key;
  };

  const create = async () => {
    const name = await prompt({
      title: "New secret key",
      message: "Name it after where it will live, so you know what breaks if you revoke it.",
      label: "Name",
      placeholder: "Production server",
      confirmLabel: "Create key",
    });
    if (!name) return;
    try {
      const { key } = await api<{ key: string }>(path(base), { body: { name } });
      refresh();
      setShown({ title: `${name} key`, key });
    } catch (err) {
      toastError(describeError(err, "Couldn't create the key."));
    }
  };

  const rotate = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Rotate ${name}?`,
      message: "The current key stops working straight away. Anything still using it will be refused until you give it the new key.",
      confirmLabel: "Rotate key",
      danger: true,
    });
    if (!ok) return;
    try {
      const { key } = await api<{ key: string }>(path(`${base}/${id}/rotate`), { body: {} });
      setRevealed((r) => ({ ...r, [id]: key }));
      refresh();
      setShown({ title: `New ${name} key`, key });
    } catch (err) {
      toastError(describeError(err, "Couldn't rotate the key."));
    }
  };

  const revoke = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Revoke ${name}?`,
      message: "The key stops working straight away and can't be restored. Reports sent with it will be refused.",
      confirmLabel: "Revoke key",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`${base}/${id}`), { method: "DELETE" });
      refresh();
      toast(`Revoked ${name}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't revoke the key."));
    }
  };

  return (
    <div className="page-body page-body--narrow">
      <SetGroup title="Public">
        <SetRow label="Project id" hint="Safe to put in web pages. It lets browsers send reports to this project and can't read anything.">
          <div className="w-[260px]">
            <CopyField value={project.id} what="project id" />
          </div>
        </SetRow>
        <SetRow label="Endpoint" hint="Where the widget, hosted form and your own code send reports.">
          <div className="w-[260px]">
            <CopyField value={links.endpoint} what="endpoint" />
          </div>
        </SetRow>
      </SetGroup>

      <section className="mb-5">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="set-group__title !mb-0.5">Secret keys</h2>
            <p className="hint ml-0.5">For servers only. Requests with a secret key skip the allowed-sites check and get a higher rate limit.</p>
          </div>
          <Button size="sm" icon={AddIcon} onClick={create}>
            New secret key
          </Button>
        </div>
        <div className="set-group">
          {keys.isPending ? (
            <div className="set-row">
              <Skeleton h={14} w="50%" />
            </div>
          ) : keys.isError ? (
            <div className="p-3">
              <Callout tone="danger" action={<Button size="sm" onClick={() => keys.refetch()}>Try again</Button>}>
                {describeError(keys.error, "Couldn't load keys.")}
              </Callout>
            </div>
          ) : !keys.data.keys.length ? (
            <SetRow label="No secret keys" hint="You only need one to send reports from your own servers." />
          ) : (
            keys.data.keys.map((k) => (
              <SetRow
                key={k.id}
                id={k.id}
                label={k.name}
                hint={`Created ${relativeTime(k.createdAt)}${k.createdBy ? ` by ${k.createdBy}` : ""} · ${k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}`}
              >
                <code className="mono text-xs text-text-2 max-w-[260px] truncate select-text">{revealed[k.id] ?? `${k.prefix}••••••••••••••••`}</code>
                <IconButton
                  size="sm"
                  icon={revealed[k.id] ? EyeClosedIcon : EyeIcon}
                  label={revealed[k.id] ? "Hide key" : "Show key"}
                  onClick={async () => {
                    if (revealed[k.id]) return setRevealed(({ [k.id]: _, ...rest }) => rest);
                    try {
                      await reveal(k.id);
                    } catch (err) {
                      toastError(describeError(err, "Couldn't show the key."));
                    }
                  }}
                />
                <IconButton
                  size="sm"
                  icon={CopyIcon}
                  label="Copy key"
                  onClick={async () => {
                    try {
                      await copyText(await reveal(k.id), "secret key (keep it private)");
                    } catch (err) {
                      toastError(describeError(err, "Couldn't copy the key."));
                    }
                  }}
                />
                <Menu
                  trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`More actions for ${k.name}`} />}
                  items={[
                    { label: "Rotate…", icon: RefreshIcon, onSelect: () => rotate(k.id, k.name) },
                    "separator",
                    { label: "Revoke…", icon: TrashBin2Icon, danger: true, onSelect: () => revoke(k.id, k.name) },
                  ]}
                />
              </SetRow>
            ))
          )}
        </div>
      </section>

      <SetGroup title="Sending from a server">
        <div className="p-3.5">
          <CodeBlock code={serverSnippet(links)} what="example request" />
        </div>
      </SetGroup>

      <Dialog
        open={!!shown}
        onClose={() => setShown(null)}
        title={shown?.title ?? ""}
        description="Store it in your server's environment, for example as ISSUEIT_SECRET_KEY. Never put it in a web page or app bundle."
        footer={
          <>
            <span className="mr-auto" />
            <Button variant="primary" onClick={() => setShown(null)}>
              Done
            </Button>
          </>
        }
      >
        {shown && <CopyField value={shown.key} what="secret key" />}
      </Dialog>
    </div>
  );
}
