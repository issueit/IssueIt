import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api, describeError } from "../lib/api";
import { ButtonLink } from "../components/ui/Button";
import { Callout } from "../components/ui/feedback";
import { AuthFrame } from "./auth/Auth";

/** Trello returns the token in the URL fragment, which never reaches the server; finish here. */
export function TrelloReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const state = params.get("state");
    history.replaceState(null, "", window.location.pathname);
    if (!token || !state) {
      setError("Trello didn't send a token. The connection may have been cancelled.");
      return;
    }
    api<{ returnTo: string }>("/oauth/trello/complete", { body: { state, token } })
      .then((res) => navigate(res.returnTo, { replace: true }))
      .catch((err) => setError(describeError(err, "Couldn't finish connecting Trello.")));
  }, [params, navigate]);

  return (
    <AuthFrame title={error ? "Trello isn't connected" : "Connecting Trello…"}>
      {error && (
        <div className="flex flex-col gap-3">
          <Callout tone="danger">{error}</Callout>
          <ButtonLink to="/projects">Back to projects</ButtonLink>
        </div>
      )}
    </AuthFrame>
  );
}
