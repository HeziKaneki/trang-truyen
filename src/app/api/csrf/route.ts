import { randomToken } from '@/server/security';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
export async function GET() {
  const token = randomToken();
  const response = NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set('novel-csrf', token, {
    httpOnly: true,
    secure: env.APP_URL.startsWith('https:'),
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  });
  return response;
}
