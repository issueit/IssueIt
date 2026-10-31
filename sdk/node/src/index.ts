/**
 * Issueit from a Node server.
 *
 *   const issueit = new Issueit({ project: "prj_…", key: process.env.ISSUEIT_SECRET_KEY });
 *   app.use(issueit.express());
 *
 * Two promises this keeps, because an error reporter that breaks the thing
 * it is watching is worse than no reporter at all:
 *
 *   - It never throws into your code. A failure to report is logged, not raised.
 *   - It never blocks a response. Reports go out after the reply.
 */

export type IssueitOptions = {
  /** The project id, prj_…. */
  project: string;
  /** A project secret key. Without one, the project must accept anonymous reports. */
  key?: string;
  /** Where Issueit lives. Defaults to the hosted service, or ISSUEIT_URL. */
  url?: string;
  /** The build this is, so stacks can be mapped back. Defaults to ISSUEIT_RELEASE. */
  release?: string;
  /** production, staging, … Defaults to NODE_ENV. */
  environment?: string;
  /** What to call these reports. Defaults to "backend". */
  source?: string;
  /** Called when a report can't be sent. Defaults to console.warn. */
  onError?: (error: Error) => void;
  /** Return false to drop a report, or change it before it goes. */
  beforeSend?: (report: Report) => Report | null | false;
  /** Seconds to wait for Issueit before giving up. */
  timeoutSeconds?: number;
};

export type Report = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  environment?: string;
  release?: string;
  page_url?: string;
  source?: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
  email?: string;
  name?: string;
  idempotency_key?: string;
};

const HOSTED = "https://drop.issueit.app";

export class Issueit {
  private readonly url: string;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(private readonly options: IssueitOptions) {
    if (!options.project) throw new Error("Issueit needs a project id.");
    this.url = (options.url ?? process.env.ISSUEIT_URL ?? HOSTED).replace(/\/+$/, "");
  }

  /** Sends a report. Resolves when it has been accepted, or when it has given up. */
  async report(report: Report): Promise<{ ok: boolean; id?: string }> {
    const body: Report = {
      source: this.options.source ?? "backend",
      environment: this.options.environment ?? process.env.NODE_ENV,
      release: this.options.release ?? process.env.ISSUEIT_RELEASE,
      ...report,
    };
    const final = this.options.beforeSend ? this.options.beforeSend(body) : body;
    if (!final) return { ok: false };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (this.options.timeoutSeconds ?? 10) * 1000);
    try {
      const res = await fetch(`${this.url}/v1/${encodeURIComponent(this.options.project)}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.options.key ? { authorization: `Bearer ${this.options.key}` } : {}) },
        body: JSON.stringify(final),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as { report_id?: string; error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? `Issueit replied ${res.status}`);
      return { ok: true, id: data?.report_id };
    } catch (err) {
      this.fail(err as Error);
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Reports an exception, with a fingerprint from its name and top frame, so
   * a thousand of the same fault become one bug rather than a thousand.
   */
  captureError(error: unknown, extra: Partial<Report> = {}): Promise<{ ok: boolean; id?: string }> {
    const err = error instanceof Error ? error : new Error(String(error));
    return this.report({
      title: `${err.name}: ${err.message}`.slice(0, 200),
      description: err.stack ?? String(err),
      priority: "high",
      fingerprint: fingerprint(err),
      ...extra,
      metadata: { ...(extra.metadata ?? {}), ...(err.cause ? { cause: String(err.cause) } : {}) },
    });
  }

  /** Sends without waiting, and keeps a handle so `flush` can wait for it. */
  captureErrorLater(error: unknown, extra: Partial<Report> = {}): void {
    const promise = this.captureError(error, extra).finally(() => this.inFlight.delete(promise));
    this.inFlight.add(promise);
  }

  /** Waits for everything sent in the background. Call it before exiting. */
  async flush(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  /* ------------------------------------------------------- frameworks */

  /** Express and Connect: `app.use(issueit.express())` after your routes. */
  express() {
    return (error: unknown, req: IncomingLike, _res: unknown, next: (err?: unknown) => void) => {
      this.captureErrorLater(error, requestDetails(req));
      next(error);
    };
  }

  /** Hono: `app.onError(issueit.hono())`. Re-throws, so your own handler still runs. */
  hono() {
    return (error: Error, c: { req: { method: string; url: string; header(name: string): string | undefined } }) => {
      this.captureErrorLater(error, {
        page_url: c.req.url,
        metadata: { method: c.req.method, userAgent: c.req.header("user-agent") },
      });
      throw error;
    };
  }

  /** Fastify: `fastify.setErrorHandler(issueit.fastify())`. */
  fastify() {
    return (error: Error, request: IncomingLike, reply: { send(err: unknown): unknown }) => {
      this.captureErrorLater(error, requestDetails(request));
      reply.send(error);
    };
  }

  /**
   * Catches what nothing else did. Reports, flushes, then lets the process
   * do what it was going to do, because swallowing a crash hides it twice.
   */
  catchAll(options: { exitOnUncaught?: boolean } = {}) {
    const handle = async (error: unknown, kind: string) => {
      await this.captureError(error, { title: `${kind}: ${describe(error)}`.slice(0, 200), priority: "critical", metadata: { kind } });
      if (kind === "uncaughtException" && options.exitOnUncaught !== false) process.exit(1);
    };
    process.on("uncaughtException", (e) => void handle(e, "uncaughtException"));
    process.on("unhandledRejection", (e) => void handle(e, "unhandledRejection"));
    return this;
  }

  private fail(error: Error) {
    if (this.options.onError) this.options.onError(error);
    else console.warn(`[issueit] couldn't send a report: ${error.message}`);
  }
}

/* --------------------------------------------------------------- helpers */

type IncomingLike = { method?: string; originalUrl?: string; url?: string; headers?: Record<string, unknown> } | undefined;

function requestDetails(req: IncomingLike): Partial<Report> {
  if (!req) return {};
  const host = typeof req.headers?.host === "string" ? req.headers.host : "";
  const path = req.originalUrl ?? req.url ?? "";
  return {
    page_url: host && path ? `http://${host}${path}` : undefined,
    metadata: { method: req.method, path, userAgent: req.headers?.["user-agent"] },
  };
}

/**
 * The error's name and the first frame of its own code. Line numbers are
 * left out on purpose: the same fault shouldn't become a new bug because
 * someone added an import above it.
 */
export function fingerprint(error: Error): string {
  const frame = (error.stack ?? "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ") && !l.includes("node_modules") && !l.includes("node:internal"));
  const where = frame?.replace(/:\d+:\d+\)?$/, "").replace(/^at\s+/, "") ?? "";
  return `${error.name}|${where}`.slice(0, 200);
}

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export default Issueit;
