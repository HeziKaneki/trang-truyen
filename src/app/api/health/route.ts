import { db } from '@/server/db';
import { redis } from '@/server/redis';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await Promise.all([db.$queryRaw`SELECT 1`, redis().ping()]);
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
