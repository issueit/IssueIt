import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useMe } from "../../lib/session";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { AuthFrame } from "./Auth";

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const invite = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<{ organisation: string; email: string; role: string }>(`/invitations/${token}`),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (invite.isPending) {
    return (
      <AuthFrame title="Invitation">
        <Skeleton h={14} w="70%" />
      </AuthFrame>
    );
  }
  if (invite.isError) {
    return (
      <AuthFrame title="Invitation not found" subtitle="This link has expired or has already been used. Ask for a new invitation.">
        <ButtonLink to="/login">Go to sign in</ButtonLink>
      </AuthFrame>
    );
  }
  const { organisation, email, role } = invite.data;
  const signedIn = !!me.data;

  return (
    <AuthFrame
      title={`Join ${organisation}`}
      subtitle={
        <>
          You've been invited to join as {role === "owner" ? "an owner" : "a member"}. The invitation was sent to <span className="text-text">{email}</span>.
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't accept the invitation.")}</Callout> : null}
      {signedIn ? (
        <div className="flex flex-col gap-3 mt-3">
          <p className="text-sm text-text-3">Signed in as {me.data!.user.email}.</p>
          <Button
            variant="primary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { orgId } = await api<{ orgId: string }>(`/invitations/${token}/accept`, { body: {} });
                localStorage.setItem("issueit.org", orgId);
                await qc.invalidateQueries({ queryKey: ["me"] });
                navigate("/inbox", { replace: true });
              } catch (err) {
                setError(err);
                setBusy(false);
              }
            }}
          >
            Join {organisation}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <ButtonLink to={`/signup?invite=${token}&email=${encodeURIComponent(email)}`} variant="primary">
            Create account
          </ButtonLink>
          <ButtonLink to={`/login?next=/invite/${token}`}>Sign in</ButtonLink>
        </div>
      )}
    </AuthFrame>
  );
}
