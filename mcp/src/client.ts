/**
 * Talks to one Issueit install. Everything an agent can do goes through the
 * same management API the dashboard uses, with an account token in place of
 * a session cookie, so a token can never reach further than a person could.
 */

export class IssueitError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Whoami = {
  user: { id: string; name: string; email: string };
  organisation: { id: string; name: string; role: "owner" | "member" };
  auth: { via: string; scopes: string[] | "all"; projects: string[] | "all" };
  projects: Array<{ id: string; name: string }>;
  urls: { app: string; drop: string; docs: string };
};

export type ClientOptions = {
  /** Where Issueit lives, e.g. https://dash.issueit.app or a self-hosted address. */
  baseUrl: string;
  token: string;
  /** A project secret key, needed only to file reports into a project that refuses public submissions. */
  ingestKey?: string;
  /**
   * How requests are sent. Issueit's own server passes a function that
   * dispatches straight into its router, so the remote endpoint doesn't make
   * HTTP calls to itself.
   */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
};

export class IssueitClient {
  private cached: Whoami | null = null;
  private readonly send: (url: string, init: RequestInit) => Promise<Response>;

  constructor(private readonly options: ClientOptions) {
    this.send = options.fetch ?? ((url, init) => fetch(url, init));
  }

  /** The management API, below /api/orgs/current. */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.options.baseUrl}/api/orgs/current${path}`;
    let res: Response;
    try {
      res = await this.send(url, {
        method,
        headers: {
          authorization: `Bearer ${this.options.token}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new IssueitError(0, "unreachable", `Couldn't reach Issueit at ${this.options.baseUrl}: ${(err as Error).message}`);
    }
    const text = await res.text();
    const data = text ? safeParse(text) : null;
    if (!res.ok) {
      const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new IssueitError(res.status, error?.code ?? "error", error?.message ?? `Issueit replied ${res.status}.`);
    }
    return data as T;
  }

  get<T>(path: string) {
    return this.call<T>("GET", path);
  }

  /** Sends a body that isn't JSON, such as a source map. */
  async putText<T>(path: string, text: string, contentType = "application/json"): Promise<T> {
    const res = await this.send(`${this.options.baseUrl}/api/orgs/current${path}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${this.options.token}`, "content-type": contentType, accept: "application/json" },
      body: text,
    });
    const raw = await res.text();
    const data = raw ? safeParse(raw) : null;
    if (!res.ok) {
      const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
      throw new IssueitError(res.status, error?.code ?? "error", error?.message ?? `Issueit replied ${res.status}.`);
    }
    return data as T;
  }

  /**
   * Opens a long-lived response, for the server-sent event stream. Separate
   * from `call` because nothing here is JSON and nothing is buffered.
   */
  openStream(path: string, signal: AbortSignal): Promise<Response> {
    return this.send(`${this.options.baseUrl}/api/orgs/current${path}`, {
      headers: { authorization: `Bearer ${this.options.token}`, accept: "text/event-stream" },
      signal,
    });
  }

  /** Who the token belongs to, and the install's addresses. Read once and kept. */
  async whoami(refresh = false): Promise<Whoami> {
    if (!this.cached || refresh) this.cached = await this.get<Whoami>("/whoami");
    return this.cached;
  }

  /**
   * Files a report through the public intake, so it is fingerprinted,
   * grouped and delivered exactly like one from the widget.
   */
  async submit(projectId: string, payload: Record<string, unknown>, key?: string, options: { dryRun?: boolean } = {}) {
    const { urls } = await this.whoami();
    const query = options.dryRun ? "?dry_run=1" : "";
    const secret = key ?? this.options.ingestKey;
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(payload),
    };
    // Reports go to the address the install advertises for intake, which on a
    // split deployment is a different host. When that host can't be reached —
    // an internal address, or a development server — fall back to the one we
    // are already talking to rather than failing in a way nobody can act on.
    let res: Response;
    try {
      res = await this.send(`${urls.drop}/v1/${projectId}/reports${query}`, init);
    } catch (err) {
      if (urls.drop === this.options.baseUrl) throw new IssueitError(0, "unreachable", `Couldn't reach ${urls.drop}: ${(err as Error).message}`);
      res = await this.send(`${this.options.baseUrl}/v1/${projectId}/reports${query}`, init);
    }
    const data = safeParse(await res.text()) as { success?: boolean; report_id?: string; error?: { code: string; message: string } } | null;
    if (!res.ok || !data?.success) {
      const error = data?.error;
      // Projects that refuse anonymous intake need a project secret key, which
      // is a different credential from the account token.
      const hint =
        error?.code === "public_disabled" || error?.code === "origin_not_allowed"
          ? " Pass a project secret key as `key`, or set ISSUEIT_INGEST_KEY."
          : "";
      throw new IssueitError(res.status, error?.code ?? "error", `${error?.message ?? `Issueit replied ${res.status}.`}${hint}`);
    }
    return data;
  }

  /** Resolves a project by id or by name, so an agent can say "the web app". */
  async project(idOrName: string): Promise<{ id: string; name: string }> {
    const { projects } = await this.whoami();
    const exact = projects.find((p) => p.id === idOrName);
    if (exact) return exact;
    const wanted = idOrName.trim().toLowerCase();
    const byName = projects.filter((p) => p.name.toLowerCase() === wanted);
    if (byName.length === 1) return byName[0];
    const partial = projects.filter((p) => p.name.toLowerCase().includes(wanted));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) throw new IssueitError(400, "ambiguous", `"${idOrName}" matches ${partial.map((p) => p.name).join(", ")}. Use the project id.`);
    throw new IssueitError(404, "not_found", `No project called "${idOrName}". This token can see: ${projects.map((p) => `${p.name} (${p.id})`).join(", ") || "none"}.`);
  }

  /** Resolves "14", "#14" or a report id to a report id, within a project when given. */
  async reportId(reference: string, project?: string): Promise<string> {
    const ref = reference.trim();
    if (/^rep_/.test(ref)) return ref;
    const number = /^#?(\d+)$/.exec(ref)?.[1];
    if (!number) return ref;
    if (!project) throw new IssueitError(400, "needs_project", `Report #${number} needs a project, because numbers start again in each one.`);
    const { id } = await this.project(project);
    const { reports } = await this.get<{ reports: Array<{ id: string }> }>(`/reports?project=${encodeURIComponent(id)}&number=${number}&status=all`);
    if (!reports.length) throw new IssueitError(404, "not_found", `There is no report #${number} in that project.`);
    return reports[0].id;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
