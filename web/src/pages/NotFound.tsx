import { ButtonLink } from "../components/ui/Button";
import { EmptyState } from "../components/ui/feedback";
import { MagnifierIcon } from "../components/ui/icons";

export function NotFound() {
  return (
    <div className="page-body">
      <EmptyState icon={MagnifierIcon} title="Page not found" action={<ButtonLink to="/inbox">Go to the inbox</ButtonLink>}>
        The link may be out of date, or the page has moved.
      </EmptyState>
    </div>
  );
}
