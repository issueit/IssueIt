import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrganisation } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { OrgSettings } from "../../lib/types";
import { Select } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { CopyField } from "../../components/ui/Copy";
import { confirm, prompt } from "../../components/ui/Dialog";
import { toast, toastError } from "../../components/ui/Toast";
import { SetGroup, SetRow } from "../../components/ui/layout";

export function OrganisationSettings() {
  const { org, me, path, setOrg } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const owner = org.role === "owner";
  const orgQuery = useOrganisation();
  const location = orgQuery.data?.organisation.settings.location ?? "auto";

  const setLocation = async (value: NonNullable<OrgSettings["location"]>) => {
    try {
      await api(path(""), { method: "PATCH", body: { settings: { location: value } } });
      await qc.invalidateQueries({ queryKey: ["org", org.id, "organisation"] });
      toast("Saved. Applies to new reports.");
    } catch (err) {
      toastError(describeError(err, "Couldn't save the setting."));
    }
  };

  const rename = async () => {
    const name = await prompt({ title: "Rename organisation", label: "Name", initial: org.name, confirmLabel: "Rename" });
    if (!name || name === org.name) return;
    try {
      await api(path(""), { method: "PATCH", body: { name } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast(`Renamed to ${name}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't rename the organisation."));
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: `Leave ${org.name}?`,
      message: "You'll lose access to its projects and reports. An owner can invite you back.",
      confirmLabel: "Leave organisation",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`/members/${me.user.id}`), { method: "DELETE" });
      const other = me.organisations.find((o) => o.id !== org.id);
      if (other) setOrg(other.id);
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast(`Left ${org.name}`);
      navigate("/inbox");
    } catch (err) {
      toastError(describeError(err, "Couldn't leave the organisation."));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${org.name}?`,
      message: "Every project, report, attachment, key and connected account in it is deleted for good. Issues already created in other tools stay where they are.",
      confirmLabel: "Delete organisation",
      danger: true,
      typeToConfirm: org.name,
    });
    if (!ok) return;
    try {
      await api(path(""), { method: "DELETE", body: { confirm: ok } });
      const other = me.organisations.find((o) => o.id !== org.id);
      if (other) setOrg(other.id);
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast(`Deleted ${org.name}`);
      navigate("/inbox");
    } catch (err) {
      toastError(describeError(err, "Couldn't delete the organisation."));
    }
  };

  return (
    <>
      <h2 className="page-title mb-4">General</h2>
      <SetGroup title="Organisation">
        <SetRow label="Name" hint={org.name}>
          {owner && (
            <Button size="sm" onClick={rename}>
              Rename…
            </Button>
          )}
        </SetRow>
        <SetRow label="Organisation id" hint="Useful when asking for support.">
          <div className="w-[220px]">
            <CopyField value={org.id} what="organisation id" />
          </div>
        </SetRow>
        <SetRow label="Your role" hint={owner ? "Owner - you can manage members, connected accounts and delete the organisation." : "Member - you can work with projects, reports and integrations."} />
      </SetGroup>

      <SetGroup title="Report location">
        <SetRow
          id="location"
          label="Where a report's country comes from"
          hint={
            location === "off"
              ? "Off. New reports have no country and the map stays empty."
              : location === "timezone"
                ? "The reporter's time zone, which the widget sends. No IP addresses are looked up."
                : "Your proxy's country header when TRUST_PROXY is set (e.g. Cloudflare), otherwise the reporter's time zone. No IP addresses are looked up."
          }
        >
          <Select
            small
            aria-label="Report location"
            className="!w-[170px]"
            disabled={!owner || !orgQuery.data}
            value={location}
            onChange={(e) => setLocation(e.target.value as NonNullable<OrgSettings["location"]>)}
            options={[
              { value: "auto", label: "Proxy, then time zone" },
              { value: "timezone", label: "Time zone only" },
              { value: "off", label: "Don't record" },
            ]}
          />
        </SetRow>
      </SetGroup>

      <SetGroup title="Leave or delete">
        <SetRow label="Leave organisation" hint={me.organisations.length === 1 ? "This is your only organisation; you'll be asked to create another." : "You can be invited back later."}>
          <Button size="sm" onClick={leave}>
            Leave…
          </Button>
        </SetRow>
        {owner && (
          <SetRow label="Delete organisation" hint="Removes everything in it for good.">
            <Button size="sm" variant="danger" onClick={remove}>
              Delete organisation…
            </Button>
          </SetRow>
        )}
      </SetGroup>
    </>
  );
}
