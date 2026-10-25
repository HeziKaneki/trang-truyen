'use client';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ApiForm } from './forms';
import { useI18n } from './providers';
export function Preferences({
  language,
  theme,
  allowMature,
  emailDigest,
}: {
  language: string;
  theme: string;
  allowMature: boolean;
  emailDigest: boolean;
}) {
  const t = useI18n();
  const router = useRouter();
  const { setTheme } = useTheme();
  return (
    <ApiForm
      endpoint="account"
      base={{ action: 'preferences' }}
      fields={[
        {
          name: 'language',
          label: 'language',
          type: 'select',
          required: true,
          value: language,
          options: [
            { value: 'vi', label: 'Tiếng Việt' },
            { value: 'en', label: 'English' },
          ],
        },
        {
          name: 'theme',
          label: 'theme',
          type: 'select',
          required: true,
          value: theme,
          options: (['light', 'dark', 'system'] as const).map((v) => ({ value: v, label: t[v] })),
        },
        { name: 'allowMature', label: 'allowMature', type: 'checkbox', value: allowMature },
        { name: 'emailDigest', label: 'emailDigest', type: 'checkbox', value: emailDigest },
      ]}
      onSuccess={() => {
        const lang = (document.getElementById('account-language') as HTMLSelectElement).value;
        const mode = (document.getElementById('account-theme') as HTMLSelectElement).value;
        document.cookie = `language=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`;
        setTheme(mode);
        router.refresh();
      }}
    />
  );
}
