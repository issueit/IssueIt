/**
 * The code that puts Issueit into an app, built from the install's real
 * addresses rather than a guessed one. Kept apart from the tool table so
 * the command line can use it without pulling in a schema library.
 */

export const snippetLanguage = (framework: string) => (framework === "curl" ? "sh" : framework === "html" ? "html" : framework === "node" ? "js" : "jsx");

export function installSnippet(framework: string, projectId: string, links: Record<string, string>): string {
  const script = `<script src="${links.widgetUrl}" data-project="${projectId}" defer></script>`;
  switch (framework) {
    case "react":
      return `// Load the widget once, wherever your app mounts.
import { useEffect } from "react";

export function BugReporter() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "${links.widgetUrl}";
    s.dataset.project = "${projectId}";
    s.defer = true;
    document.body.appendChild(s);
    return () => s.remove();
  }, []);
  return null;
}`;
    case "next":
      return `// app/layout.tsx — Next.js loads it after the page is interactive.
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Script src="${links.widgetUrl}" data-project="${projectId}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`;
    case "vue":
      return `<!-- App.vue -->
<script setup>
import { onMounted } from "vue";
onMounted(() => {
  const s = document.createElement("script");
  s.src = "${links.widgetUrl}";
  s.dataset.project = "${projectId}";
  s.defer = true;
  document.body.appendChild(s);
});
</script>`;
    case "svelte":
      return `<!-- +layout.svelte -->
<svelte:head>
  ${script}
</svelte:head>`;
    case "node":
      return `// Report a bug from your server. Keep the secret key out of the browser.
await fetch("${links.endpoint}", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: \`Bearer \${process.env.ISSUEIT_SECRET_KEY}\` },
  body: JSON.stringify({
    title: "Payment webhook timed out",
    description: err.stack,
    severity: "high",
    source: "backend",
    environment: process.env.NODE_ENV,
    fingerprint: "payment-webhook-timeout",
  }),
});`;
    case "curl":
      return `curl -X POST ${links.endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Login button does nothing", "description": "Clicking login does nothing.", "severity": "medium"}'`;
    default:
      return `<!-- Put this just before </body>. The project id is public; it can only create reports. -->
${script}`;
  }
}
