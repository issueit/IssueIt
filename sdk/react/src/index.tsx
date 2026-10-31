import { Component, createContext, useCallback, useContext, useEffect, useMemo, type ErrorInfo, type ReactNode } from "react";

/**
 * Issueit for React.
 *
 *   <IssueitProvider project="prj_…">
 *     <ErrorBoundary fallback={<Sorry />}>{children}</ErrorBoundary>
 *   </IssueitProvider>
 *
 * The boundary files the bug with the component stack attached, so you find
 * out about a white screen even when nobody fills in a form. The widget it
 * loads is the same one the dashboard configures, so the questions it asks
 * are changed there, not here.
 */

export type IssueitConfig = {
  project: string;
  /** Where Issueit lives. Defaults to the hosted service. */
  url?: string;
  /** The build this is, so minified stacks can be mapped back. */
  release?: string;
  environment?: string;
  /** Load the report widget. Off if you only want the error boundary. */
  widget?: boolean;
  /** Log what would be sent instead of sending it. */
  debug?: boolean;
};

type Api = {
  config: IssueitConfig;
  /** Files a report. Resolves false if it couldn't be sent. */
  report(input: { title: string; description?: string; priority?: string; fingerprint?: string; metadata?: Record<string, unknown> }): Promise<boolean>;
  /** Opens the widget's form, if the widget is loaded. */
  open(): void;
};

const Ctx = createContext<Api | null>(null);

const HOSTED = "https://drop.issueit.app";

declare global {
  interface Window {
    Issueit?: { open(): void; mount(options: Record<string, unknown>): unknown };
  }
}

export function IssueitProvider({ children, ...config }: IssueitConfig & { children: ReactNode }) {
  const base = (config.url ?? HOSTED).replace(/\/+$/, "");

  useEffect(() => {
    if (config.widget === false) return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-issueit]");
    if (existing) return;
    const script = document.createElement("script");
    script.src = `${base}/widget.js`;
    script.dataset.project = config.project;
    script.dataset.issueit = "";
    if (config.debug) script.dataset.debug = "true";
    script.defer = true;
    document.body.appendChild(script);
    return () => script.remove();
  }, [base, config.project, config.widget, config.debug]);

  const api = useMemo<Api>(
    () => ({
      config,
      async report(input) {
        try {
          const res = await fetch(`${base}/v1/${encodeURIComponent(config.project)}/reports`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...input,
              source: "react",
              release: config.release,
              environment: config.environment,
              page_url: typeof location === "undefined" ? undefined : location.href,
            }),
          });
          return res.ok;
        } catch {
          // A reporter that breaks the page it is watching is worse than none.
          return false;
        }
      },
      open() {
        window.Issueit?.open();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, config.project, config.release, config.environment],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useIssueit(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useIssueit needs an <IssueitProvider> above it.");
  return api;
}

/** Reports a bug from your own code: a failed save, a rejected upload. */
export function useReportBug() {
  const { report } = useIssueit();
  return useCallback(report, [report]);
}

type BoundaryProps = {
  children: ReactNode;
  /** What to show instead of the crashed tree. Given the error and a way to try again. */
  fallback?: ReactNode | ((state: { error: Error; retry: () => void }) => ReactNode);
  /** Called as well as reporting, for your own logging. */
  onError?: (error: Error, info: ErrorInfo) => void;
};

/**
 * Files the error, with the component stack, then shows the fallback.
 * Written as a class because React still has no other way to catch a
 * render error.
 */
export class ErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  static contextType = Ctx;
  declare context: Api | null;
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    void this.context?.report({
      title: `${error.name}: ${error.message}`.slice(0, 200),
      description: [error.stack, info.componentStack && `Component stack:${info.componentStack}`].filter(Boolean).join("\n\n"),
      priority: "high",
      // The top frame of the stack, so the same crash stays one bug.
      fingerprint: `${error.name}|${(error.stack ?? "").split("\n")[1]?.trim().replace(/:\d+:\d+\)?$/, "") ?? ""}`.slice(0, 200),
      metadata: { caughtBy: "react-error-boundary" },
    });
  }

  retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (typeof this.props.fallback === "function") return this.props.fallback({ error, retry: this.retry });
    return this.props.fallback ?? null;
  }
}
