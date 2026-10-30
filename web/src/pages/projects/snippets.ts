import type { ProjectLinks } from "../../lib/types";

/** Install snippets, generated from the server's real URLs. */
export const widgetSnippet = (projectId: string, links: ProjectLinks) => `<script
  src="${links.widgetUrl}"
  data-project="${projectId}"
  defer
></script>`;

export const curlSnippet = (links: ProjectLinks) => `curl -X POST ${links.endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Login button does not work",
    "description": "Clicking login does nothing.",
    "severity": "medium",
    "environment": "production",
    "page_url": "https://example.com/login",
    "metadata": { "user_id": "user_123" }
  }'`;

export const serverSnippet = (links: ProjectLinks) => `curl -X POST ${links.endpoint} \\
  -H "Authorization: Bearer $ISSUEIT_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "Payment webhook timed out", "severity": "high", "source": "backend" }'`;
