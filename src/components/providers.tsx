'use client';
import { createContext, useContext } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster, toast } from 'sonner';
import { dictionaries, type Dictionary, type MessageKey } from '@/lib/i18n';
import { ApiError } from '@/lib/api';
const I18n = createContext<Dictionary>(dictionaries.vi);
export function Providers({
  children,
  locale,
  nonce,
}: {
  children: React.ReactNode;
  locale: 'vi' | 'en';
  nonce?: string;
}) {
  return (
    <I18n.Provider value={dictionaries[locale]}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
        {children}
        <Toaster richColors closeButton position="bottom-right" />
      </ThemeProvider>
    </I18n.Provider>
  );
}
export function useI18n() {
  return useContext(I18n);
}
export function useError() {
  const t = useI18n();
  return (error: unknown) => {
    const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
    toast.error(t[code as MessageKey] || t.error);
  };
}
