export class ApiError extends Error {
  constructor(
    public code: string,
    public fields?: Record<string, string[]>,
  ) {
    super(code);
  }
}
let csrf: Promise<string> | null = null;
async function csrfToken() {
  return (csrf ??= fetch('/api/csrf', { cache: 'no-store' })
    .then((r) => r.json())
    .then((r) => r.token as string));
}
export async function api<T = unknown>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? 'GET' : method,
    headers:
      body === undefined
        ? {}
        : {
            'x-csrf-token': await csrfToken(),
            ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok) {
    if (payload.error?.code === 'CSRF') csrf = null;
    throw new ApiError(payload.error?.code || 'INTERNAL_ERROR', payload.error?.fields);
  }
  return payload.data as T;
}
