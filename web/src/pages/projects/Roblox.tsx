import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useDestinations, useKeys } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Destination, Project, ProjectChannel, ProjectLinks } from "../../lib/types";
import { Checkbox, Switch } from "../../components/ui/controls";
import { confirm, prompt } from "../../components/ui/Dialog";
import { Menu } from "../../components/ui/Menu";
import { Button, ButtonLink, IconButton } from "../../components/ui/Button";
import { CodeBlock, CopyField, copyText } from "../../components/ui/Copy";
import { Select } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/feedback";
import { toast, toastError } from "../../components/ui/Toast";
import { AddIcon, CopyIcon, DownloadMinimalisticIcon, EyeIcon, MenuDotsIcon, PenIcon, SquareArrowRightUpIcon, TrashBin2Icon } from "../../components/ui/icons";

/** "Shop purchases" → "shop-purchases": the address part, fixed once made. */
const slugFor = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "channel";

/** A webhook address: shown once the key is revealed, masked until then. */
function Address({ base, channel, secret, prefix, busy, onReveal }: { base: string; channel?: string; secret?: string; prefix?: string; busy: boolean; onReveal: () => void }) {
  const tail = channel ? `/${channel}` : "";
  if (secret) return <CopyField value={`${base}/${secret}${tail}`} what="webhook address" />;
  return (
    <div className="flex items-center gap-2">
      <code className="mono text-xs text-text-3 truncate flex-1 min-w-0">
        {base}/{prefix ?? "sk_live_"}••••••••{tail}
      </code>
      <Button size="sm" icon={EyeIcon} busy={busy} onClick={onReveal}>
        Show address
      </Button>
    </div>
  );
}

/**
 * Channels: one game, several webhook addresses, each to its own
 * destinations — bug reports to one Discord, purchases to another. A
 * destination in a channel takes only that channel's posts.
 */
function Channels({ project, base, secret, prefix, busy, onReveal }: { project: Project; base: string; secret?: string; prefix?: string; busy: boolean; onReveal: () => void }) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const destinations = useDestinations(project.id);
  const refresh = () => {
    for (const domain of ["projects", "destinations"]) void qc.invalidateQueries({ queryKey: ["org", orgId, domain] });
  };

  const saveChannels = async (channels: ProjectChannel[], failure: string) => {
    try {
      await api(path(`/projects/${project.id}`), { method: "PATCH", body: { channels } });
      refresh();
      return true;
    } catch (err) {
      toastError(describeError(err, failure));
      return false;
    }
  };

  const add = async () => {
    const name = await prompt({
      title: "New channel",
      message: "Name it after what goes through it. It gets its own webhook address, and you choose where its posts go.",
      label: "Name",
      placeholder: "Shop purchases",
      confirmLabel: "Add channel",
    });
    if (!name?.trim()) return;
    const root = slugFor(name);
    let slug = root;
    for (let i = 2; project.channels.some((ch) => ch.slug === slug); i++) slug = `${root.slice(0, 36)}-${i}`;
    if (await saveChannels([...project.channels, { slug, name: name.trim(), deliverRepeats: true }], "Couldn't add the channel.")) toast(`Added ${name.trim()}`);
  };

  const update = (slug: string, change: Partial<ProjectChannel>) =>
    saveChannels(
      project.channels.map((ch) => (ch.slug === slug ? { ...ch, ...change } : ch)),
      "Couldn't change the channel.",
    );

  const remove = async (ch: ProjectChannel) => {
    const ok = await confirm({
      title: `Remove ${ch.name}?`,
      message: "Its address stops working straight away: posts to it are refused. Its destinations go back to taking what's sent to the default address.",
      confirmLabel: "Remove channel",
      danger: true,
    });
    if (ok && (await saveChannels(project.channels.filter((x) => x.slug !== ch.slug), "Couldn't remove the channel."))) toast(`Removed ${ch.name}`);
  };

  const rename = async (ch: ProjectChannel) => {
    const name = await prompt({ title: "Rename channel", label: "Name", initial: ch.name, confirmLabel: "Rename", message: "The address stays the same." });
    if (name?.trim() && name.trim() !== ch.name) await update(ch.slug, { name: name.trim() });
  };

  const toggle = async (d: Destination, slug: string, on: boolean) => {
    const current = new Set(d.rule.channels ?? []);
    if (on) current.add(slug);
    else current.delete(slug);
    const { channels: _old, ...rest } = d.rule;
    try {
      await api(path(`/projects/${project.id}/destinations/${d.id}`), { method: "PATCH", body: { rule: current.size ? { ...rest, channels: [...current] } : rest } });
      refresh();
    } catch (err) {
      toastError(describeError(err, `Couldn't change ${d.name}.`));
    }
  };

  const list = destinations.data?.destinations ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Channels</h3>
        <Button size="sm" icon={AddIcon} onClick={add}>
          Add channel
        </Button>
      </div>
      <p className="text-xs text-text-3">
        One address per channel, for a game that posts to several webhooks. A destination in a channel gets only that channel's posts.
      </p>
      {project.channels.map((ch) => (
        <div key={ch.slug} className="rounded-lg border border-border p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium min-w-0 truncate">{ch.name}</span>
            {/* The address is usually too long to see its end, which is the part that differs. */}
            <code className="mono text-xs text-text-3 flex-1 truncate">…/{ch.slug}</code>
            <Menu
              trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`More actions for ${ch.name}`} />}
              items={[
                { label: "Rename…", icon: PenIcon, onSelect: () => rename(ch) },
                "separator",
                { label: "Remove…", icon: TrashBin2Icon, danger: true, onSelect: () => remove(ch) },
              ]}
            />
          </div>
          <Address base={base} channel={ch.slug} secret={secret} prefix={prefix} busy={busy} onReveal={onReveal} />
          {destinations.isPending ? (
            <Skeleton h={20} />
          ) : !list.length ? (
            <p className="text-xs text-text-3">
              <Link to={`/projects/${project.id}/integrations`} className="underline underline-offset-2">
                Add a destination
              </Link>{" "}
              first, such as the Discord webhook this channel used to post to.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {list.map((d) => (
                <Checkbox key={d.id} checked={!!d.rule.channels?.includes(ch.slug)} onChange={(on) => void toggle(d, ch.slug, on)}>
                  {d.name}
                </Checkbox>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-text-2">
            <Switch label={`Deliver every post to ${ch.name}`} checked={!!ch.deliverRepeats} onChange={(on) => void update(ch.slug, { deliverRepeats: on })} />
            Deliver every post, even ones that repeat. Off groups repeats into one report, as bug reports are.
          </label>
        </div>
      ))}
    </div>
  );
}

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
        <h3 className="text-sm font-medium">{project.channels.length ? "Default webhook address" : "Webhook address"}</h3>
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
            <Address base={links.webhookBase} secret={secret} prefix={list.find((k) => k.id === keyId)?.prefix} busy={busy} onReveal={reveal} />
            <p className="text-xs text-text-3">
              {project.channels.length
                ? "This one goes to destinations that aren't in a channel, along with the widget and the API."
                : "Everything sent here goes to every destination. Add channels to send different posts to different places."}
            </p>
          </div>
        )}
      </div>

      {list.length > 0 && <Channels project={project} base={links.webhookBase} secret={secret} prefix={list.find((k) => k.id === keyId)?.prefix} busy={busy} onReveal={reveal} />}

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
