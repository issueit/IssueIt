import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/index.css";
import "./lib/theme";
import { App } from "./App";
import { ApiError } from "./lib/api";

// A page's files can fail to load, most often in a tab left open across a
// deploy, whose old file names no longer exist. Reload once to pick up the
// new ones rather than leave the page blank; the flag stops a reload loop.
window.addEventListener("vite:preloadError", (event) => {
  if (sessionStorage.getItem("issueit.reloaded")) return;
  sessionStorage.setItem("issueit.reloaded", "1");
  event.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => setTimeout(() => sessionStorage.removeItem("issueit.reloaded"), 10_000));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Live updates arrive as events; refetching on focus is enough of a safety net.
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
