export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal; query?: Record<string, string | number | boolean | undefined | null> };

// All requests go to the same origin; Next rewrites /api to the API server.
export async function api<T>(path: string, { method = "GET", body, signal, query }: Options = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const url = `/api${path}${params.size ? `?${params}` : ""}`;
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (proxy error page); handled below.
  }
  const envelope = json as { ok?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown }; message?: string } | null;
  if (!response.ok || envelope?.ok === false) {
    const error = envelope?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? envelope?.message ?? `Request failed (${response.status})`,
      error?.details,
    );
  }
  return (envelope && "data" in envelope ? envelope.data : envelope) as T;
}

// Two decimals, or three when the amount has sub-cent precision ($0.024), so small costs are not rounded away.
export const usd = (value: number | null | undefined, digits = 2) => {
  if (value == null) return "—";
  // Tenths of a cent matter for per-call prices ($0.003), not for larger sums.
  const subCent = Math.abs(value) < 1 && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6;
  return `$${value.toFixed(subCent ? Math.max(digits, 3) : digits)}`;
};

export const num = (value: number | null | undefined) => (value == null ? "—" : new Intl.NumberFormat("en-US").format(value));

export const compact = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const dateTime = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export const dateOnly = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
