import { notFound } from 'next/navigation';
import { getDictionary } from '@/lib/locale';
import { AuthForm } from '@/components/auth-form';
import { ApiForm } from '@/components/forms';
const modes = {
  'dang-nhap': 'login',
  'dang-ky': 'register',
  'quen-mat-khau': 'forgot',
  'dat-lai-mat-khau': 'reset',
  'xac-minh': 'verify',
} as const;
export default async function StaticPage({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { page } = await params;
  const t = await getDictionary();
  const mode = modes[page as keyof typeof modes];
  if (mode) {
    const titles = {
      login: t.welcomeBack,
      register: t.registerTitle,
      forgot: t.forgotTitle,
      reset: t.resetTitle,
      verify: t.verifyTitle,
    };
    return (
      <div className="mx-auto max-w-md px-5 py-14">
        <p className="mb-3 text-xs uppercase tracking-widest text-primary">{t.brand}</p>
        <h1 className="mb-8 font-serif text-3xl">{titles[mode]}</h1>
        <div className="panel">
          <AuthForm
            mode={mode}
            token={(await searchParams).token}
            google={!!process.env.AUTH_GOOGLE_ID}
          />
        </div>
      </div>
    );
  }
  const legal = {
    'dieu-khoan': [t.terms, t.termsBody],
    'rieng-tu': [t.privacy, t.privacyBody],
    'nguyen-tac': [t.guidelines, t.guidelinesBody],
  };
  const item = legal[page as keyof typeof legal];
  if (item)
    return (
      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="page-heading">{item[0]}</h1>
        <p className="mb-6 rounded-xl bg-muted p-4 text-sm">{t.legalPlaceholder}</p>
        <p className="leading-8">{item[1]}</p>
      </article>
    );
  if (page === 'ban-quyen')
    return (
      <div className="mx-auto max-w-xl px-5 py-14">
        <h1 className="page-heading">{t.takedown}</h1>
        <ApiForm
          endpoint="takedown"
          submit="submit"
          base={{ reason: 'COPYRIGHT' }}
          fields={[
            { name: 'contactEmail', label: 'contactEmail', type: 'email', required: true },
            {
              name: 'targetType',
              label: 'targetType',
              type: 'select',
              required: true,
              options: [
                { value: 'STORY', label: t.STORY },
                { value: 'CHAPTER', label: t.CHAPTER_TARGET },
                { value: 'COMMENT', label: t.COMMENT },
                { value: 'USER', label: t.USER_TARGET },
              ],
            },
            { name: 'targetId', label: 'targetId', required: true },
            { name: 'note', label: 'note', type: 'textarea', required: true, max: 5000 },
          ]}
        />
      </div>
    );
  notFound();
}
