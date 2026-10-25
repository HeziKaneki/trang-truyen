export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { validateEnv } = await import('./lib/env');
    validateEnv();
  }
}
export async function onRequestError(error: unknown) {
  const { logger } = await import('./server/logger');
  logger.error({ err: error }, 'Unhandled server error');
  const raw = process.env.SENTRY_DSN;
  if (!raw) return;
  try {
    const dsn = new URL(raw);
    const project = dsn.pathname.split('/').pop();
    const endpoint = `${dsn.protocol}//${dsn.host}/api/${project}/store/?sentry_key=${dsn.username}&sentry_version=7`;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ''),
        timestamp: Date.now() / 1000,
        platform: 'node',
        level: 'error',
        message: error instanceof Error ? error.name : 'Unhandled error',
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* Error reporting must not affect responses. */
  }
}
