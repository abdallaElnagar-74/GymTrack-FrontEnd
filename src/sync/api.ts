export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function normalizeUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

/** JSON request to the backend with a timeout and readable errors. */
export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(normalizeUrl(baseUrl) + path, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check the server address and your connection.');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const fieldErrors = data?.details?.fieldErrors as Record<string, string[]> | undefined;
    const first = fieldErrors && Object.values(fieldErrors).flat()[0];
    throw new ApiError(res.status, first || data?.error || `Server error (${res.status})`);
  }
  return data as T;
}
