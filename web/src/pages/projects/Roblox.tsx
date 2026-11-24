import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useKeys } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Project, ProjectLinks } from "../../lib/types";
import { Button, ButtonLink } from "../../components/ui/Button";
import { CodeBlock, CopyField, copyText } from "../../components/ui/Copy";
import { Select } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/feedback";
import { toastError } from "../../components/ui/Toast";
import { AddIcon, CopyIcon, DownloadMinimalisticIcon, EyeIcon, SquareArrowRightUpIcon } from "../../components/ui/icons";

/** The module's source, fetched only when someone asks for it. */
const loadModule = () => import("../../../../sdk/roblox/Issueit.luau?raw").then((m) => m.default as string);

const serverScript = (projectId: string, endpoint: string) => `local Issueit = require(game.ReplicatedStorage.Issueit)

Issueit.init({
	project = "${projectId}",
	-- Store the secret key in your experience's secrets, or paste it here in a server Script.
	key = game:GetService("HttpService"):GetSecret("issueit"),
	endpoint = "${endpoint}",
	playerReports = true, -- players can file reports with Issueit.send()
})`;

/**
 * Roblox, in the project's "Collect reports" section. Two ways in: a
 * Discord-style webhook address for code that already posts to Discord,
 * and the module for errors and in-game reports. Both need a secret key,
 * so this offers to make one rather than send people off to another tab.
 */
export function RobloxSetup({ project, links }: { project: Project; links: ProjectLinks }) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const keys = useKeys(project.id);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const base = `/projects/${project.id}/keys`;
  const list = keys.data?.keys ?? [];
  const endpoint = new URL(links.endpoint).origin;

  // A key named for Roblox, if there is one, else the newest.
  useEffect(() => {
    if (keyId && list.some((k) => k.id === keyId)) return;
    const pick = list.find((k) => /roblox/i.test(k.name)) ?? list[0];
    if (pick) setKeyId(pick.id);
  }, [list, keyId]);

  const create = async () => {
    setBusy(true);
    try {
      const { key, id } = await api<{ key: string; id: string }>(path(base), { body: { name: "Roblox" } });
      setSecrets((s) => ({ ...s, [id]: key }));
      setKeyId(id);
      await qc.invalidateQueries({ queryKey: ["org", orgId, "keys", project.id] });
    } catch (err) {
      toastError(describeError(err, "Couldn't create a key."));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    if (!keyId) return;
    setBusy(true);
    try {
      const { key } = await api<{ key: string }>(path(`${base}/${keyId}/reveal`), { body: {} });
      setSecrets((s) => ({ ...s, [keyId]: key }));
    } catch (err) {
      toastError(describeError(err, "Couldn't show the key."));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const blob = new Blob([await loadModule()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Issueit.luau";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const secret = keyId ? secrets[keyId] : undefined;

  return (
    <>
      <p className="text-sm text-text-2">
        Discord doesn't accept requests from Roblox game servers. Send them here instead and each one becomes a report, delivered to Discord and everywhere else this project{" "}
        <Link to={`/projects/${project.id}/integrations`} className="underline underline-offset-2">
          delivers to
        </Link>
        . Turn on <strong className="font-medium">Allow HTTP Requests</strong> in Game Settings › Security first.
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Webhook address</h3>
        <p className="text-xs text-text-3">Paste it where your game has a Discord webhook URL. Your existing code keeps working. Keep it in server Scripts only: it contains a secret key.</p>
        {keys.isPending ? (
          <Skeleton h={32} />
        ) : !list.length ? (
          <div>
            <Button size="sm" variant="primary" icon={AddIcon} busy={busy} onClick={create}>
              Create a key for Roblox
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.length > 1 && (
              <Select
                small
                aria-label="Secret key"
                className="!w-auto max-w-[260px]"
                value={keyId ?? ""}
                onChange={(e) => setKeyId(e.target.value)}
                options={list.map((k) => ({ value: k.id, label: k.name }))}
              />
            )}
            {secret ? (
              <CopyField value={`${links.webhookBase}/${secret}`} what="webhook address" />
            ) : (
              <div className="flex items-center gap-2">
                <code className="mono text-xs text-text-3 truncate flex-1 min-w-0">
                  {links.webhookBase}/{list.find((k) => k.id === keyId)?.prefix ?? "sk_live_"}••••••••
                </code>
                <Button size="sm" icon={EyeIcon} busy={busy} onClick={reveal}>
                  Show address
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Or use the Issueit module</h3>
        <p className="text-xs text-text-3">
          Sends server script errors with the output before them, and lets players report bugs from your own UI. Put the module in ReplicatedStorage, named Issueit, then start it from a server Script.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={DownloadMinimalisticIcon} onClick={() => void download()}>
            Download Issueit.luau
          </Button>
          <Button size="sm" variant="quiet" icon={CopyIcon} onClick={async () => copyText(await loadModule(), "module source")}>
            Copy module source
          </Button>
        </div>
        <CodeBlock code={serverScript(project.id, endpoint)} what="server script" />
      </div>

      <div>
        <ButtonLink to={`${links.docsUrl}/collect/roblox`} size="sm" variant="quiet" external icon={SquareArrowRightUpIcon}>
          Roblox guide
        </ButtonLink>
      </div>
    </>
  );
}
