import { useOrg } from "../../lib/session";
import { useUrls } from "../../lib/urls";
import { DocsLink } from "../../lib/docs-link";
import { Button } from "../../components/ui/Button";
import { copyText } from "../../components/ui/Copy";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { CopyIcon, SquareArrowRightUpIcon } from "../../components/ui/icons";
import { Logo } from "../../components/app/Logo";

const editionLabels = { hosted: "Hosted", selfhost: "Self-hosted" } as const;

/** What this install is, and the few facts worth quoting when asking for help. */
export function AboutSettings() {
  const urls = useUrls();
  const { org, me } = useOrg();

  /** The facts a support request needs, in one block to paste. */
  const diagnostics = [
    `Issueit ${__APP_VERSION__} (${editionLabels[urls.edition].toLowerCase()})`,
    `Organisation: ${org.name} (${org.id})`,
    `Dashboard: ${urls.app}`,
    `Intake: ${urls.drop}`,
    `Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `Screen: ${window.innerWidth}×${window.innerHeight}`,
    `Browser: ${navigator.userAgent}`,
  ].join("\n");

  return (
    <>
      <h2 className="page-title mb-1">About</h2>
      <p className="text-sm text-text-3 mb-4">What this install is running, and where it serves each thing from.</p>

      <div className="set-group flex items-center gap-3 p-4 mb-5">
        <Logo size={30} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Version {__APP_VERSION__}</div>
          <div className="text-xs text-text-3">{editionLabels[urls.edition]} edition · signed in as {me.user.email}</div>
        </div>
      </div>

      <SetGroup title="Addresses">
        <SetRow label="Dashboard" hint="Where links in emails and issues point.">
          <span className="mono text-xs text-text-2">{urls.app}</span>
        </SetRow>
        <SetRow label="Report intake" hint="Where the widget, the hosted form and the API send reports.">
          <span className="mono text-xs text-text-2">{urls.drop}</span>
        </SetRow>
        <SetRow label="Widget script" hint="Where the widget is served from.">
          <span className="mono text-xs text-text-2">{urls.cdn}</span>
        </SetRow>
        <SetRow label="Documentation">
          <span className="mono text-xs text-text-2">{urls.docs}</span>
        </SetRow>
      </SetGroup>

      <SetGroup title="Getting help">
        <SetRow label="Documentation" hint="Setting up the widget, the API, integrations and self-hosting.">
          <DocsLink target="_blank" className="btn btn--sm">
            Open
            <SquareArrowRightUpIcon size={13} />
          </DocsLink>
        </SetRow>
        <SetRow label="Details for a support request" hint="Version, edition, organisation and browser, ready to paste.">
          <Button size="sm" icon={CopyIcon} onClick={() => void copyText(diagnostics, "details")}>
            Copy
          </Button>
        </SetRow>
      </SetGroup>
    </>
  );
}
