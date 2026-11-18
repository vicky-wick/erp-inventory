// Tiny typed API client. All errors surface as ApiError with a friendly message.
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = "evolv.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch itself failed: server unreachable, DNS, CORS, etc.
    throw new ApiError(0, "network", "Couldn't reach the server. Check your connection.");
  }

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    // Response arrived but wasn't JSON — e.g. a proxy error page while the
    // API is restarting, or an HTML fallback route.
    throw new ApiError(
      res.status || 502,
      "network",
      res.status >= 500
        ? "The server is starting up. Please try again in a few seconds."
        : "Unexpected server response. Please refresh the page and try again."
    );
  }

  if (!envelope || !envelope.ok) {
    const err = envelope && "error" in envelope ? envelope.error : { code: "unknown", message: "Something went wrong" };
    throw new ApiError(res.status, err.code, err.message);
  }
  return envelope.data;
}

export const get = <T,>(path: string) => api<T>("GET", path);
export const post = <T,>(path: string, body?: unknown) => api<T>("POST", path, body);
export const patch = <T,>(path: string, body?: unknown) => api<T>("PATCH", path, body);
export const del = <T,>(path: string) => api<T>("DELETE", path);
