'use client';
import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useError, useI18n } from './providers';
import { Button } from './ui/button';
export function AuthForm({
  mode,
  token,
  google,
}: {
  mode: 'login' | 'register' | 'forgot' | 'reset' | 'verify';
  token?: string;
  google: boolean;
}) {
  const t = useI18n();
  const showError = useError();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          const body = Object.fromEntries(f);
          if (mode === 'login') {
            const result = await signIn('credentials', {
              email: body.email,
              password: body.password,
              redirect: false,
            });
            if (result?.error) throw new Error('login');
            router.push('/');
            router.refresh();
          } else {
            await api(mode, {
              ...body,
              ...(mode === 'register' ? { terms: f.get('terms') === 'on' } : {}),
              token,
            });
            setDone(true);
          }
        } catch (error) {
          showError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {done ? (
        <div className="rounded-xl bg-primary/10 p-5 text-sm leading-6 text-primary">
          {['verify', 'reset'].includes(mode) ? t.verified : t.sentEmail}
          <Link href="/dang-nhap" className="mt-4 block underline">
            {t.login}
          </Link>
        </div>
      ) : (
        <>
          {mode === 'register' && (
            <>
              <label className="label">
                {t.name}
                <input name="name" className="field mt-2" minLength={2} maxLength={80} required />
              </label>
              <label className="label">
                {t.username}
                <input
                  name="username"
                  className="field mt-2"
                  pattern="[a-z0-9_]{3,30}"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="label">
                {t.birthDate}
                <input type="date" name="birthDate" className="field mt-2" required />
              </label>
            </>
          )}
          {!['verify', 'reset'].includes(mode) && (
            <label className="label">
              {t.email}
              <input
                name="email"
                type="email"
                autoComplete="email"
                className="field mt-2"
                required
              />
            </label>
          )}
          {['login', 'register', 'reset'].includes(mode) && (
            <label className="label">
              {mode === 'login' ? t.password : t.newPassword}
              <input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? 1 : 12}
                maxLength={128}
                className="field mt-2"
                required
              />
            </label>
          )}
          {mode === 'register' && (
            <label className="flex items-start gap-3 text-xs leading-5">
              <input type="checkbox" name="terms" required className="mt-1 accent-primary" />
              {t.termsAgree}
            </label>
          )}
          <Button disabled={busy} className="w-full" type="submit">
            {busy
              ? t.loading
              : mode === 'login'
                ? t.login
                : mode === 'register'
                  ? t.register
                  : mode === 'verify'
                    ? t.verifyTitle
                    : t.submit}
          </Button>
        </>
      )}
      {mode === 'login' && (
        <>
          <Link className="block text-center text-xs text-primary" href="/quen-mat-khau">
            {t.forgot}
          </Link>
          {google && (
            <Button
              className="w-full"
              variant="outline"
              type="button"
              onClick={() => void signIn('google', { callbackUrl: '/cai-dat' })}
            >
              {t.google}
            </Button>
          )}
          <p className="muted text-center">
            {t.noAccount}{' '}
            <Link className="text-primary" href="/dang-ky">
              {t.register}
            </Link>
          </p>
        </>
      )}
      {mode === 'register' && (
        <p className="muted text-center">
          {t.haveAccount}{' '}
          <Link className="text-primary" href="/dang-nhap">
            {t.login}
          </Link>
        </p>
      )}
    </form>
  );
}
