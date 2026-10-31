import { useMembers } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { Menu } from "../../components/ui/Menu";
import { AltArrowDownIcon, UserCircleIcon } from "../../components/ui/icons";

/**
 * Who is dealing with it. Issueit isn't an issue tracker and isn't trying to
 * become one, but a bug nobody has picked up looks exactly like a bug
 * somebody has, and that's worth one menu.
 */
export function AssigneeMenu({
  assigneeId,
  assignee,
  onPick,
}: {
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  onPick: (id: string | null) => void;
}) {
  const members = useMembers();
  const { me } = useOrg();
  const people = members.data?.members ?? [];
  const mine = assigneeId === me.user.id;
  const label = assignee ? (mine ? "You" : assignee.name.split(" ")[0]) : "Nobody";

  return (
    <Menu
      trigger={
        <button type="button" className="btn btn--sm btn--quiet" aria-label={`Assigned to ${assignee ? assignee.name : "nobody"}`}>
          <UserCircleIcon size={13} />
          <span className="max-w-[90px] truncate">{label}</span>
          <AltArrowDownIcon size={12} />
        </button>
      }
      items={[
        { label: "Nobody", checked: !assigneeId, onSelect: () => assigneeId && onPick(null) },
        ...(people.some((p) => p.id === me.user.id) ? [{ label: "Me", checked: mine, onSelect: () => !mine && onPick(me.user.id) }] : []),
        "separator" as const,
        ...people
          .filter((p) => p.id !== me.user.id)
          .map((p) => ({ label: p.name || p.email, checked: p.id === assigneeId, onSelect: () => p.id !== assigneeId && onPick(p.id) })),
      ]}
    />
  );
}

/** The same thing as a quiet line of text, for a list row. */
export function AssigneeChip({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-3" title={`Assigned to ${name}`}>
      <UserCircleIcon size={11} />
      {name.split(" ")[0]}
    </span>
  );
}
