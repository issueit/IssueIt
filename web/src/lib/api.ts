/** Thin fetch wrapper. Errors carry the server's human message, never a raw stack. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", "Couldn't reach Issueit. Check your connection.");
  }
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const error = data?.error;
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("issueit:signed-out"));
    throw new ApiError(res.status, error?.code ?? "error", error?.message ?? "", error?.details?.fields);
  }
  return data as T;
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The person-facing message for an error. The fallback starts "Couldn't…" and names the thing. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  return fallback;
}

/** Field-level message for forms, e.g. "title" from "title: Add a short title." */
export function fieldError(err: unknown, field: string): string | undefined {
  if (err instanceof ApiError && err.fields?.[field]) return err.fields[field];
  return undefined;
}
