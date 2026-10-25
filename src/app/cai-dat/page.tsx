import { pageUser } from '@/server/page-auth';
import { db } from '@/server/db';
import { getDictionary } from '@/lib/locale';
import { ApiForm, ActionButton } from '@/components/forms';
import { Preferences } from '@/components/settings';
export default async function SettingsPage() {
  const user = await pageUser();
  const t = await getDictionary();
  const prefs = await db.notificationPreference.findMany({ where: { userId: user.id } });
  return (
    <div className="container-page py-12">
      <h1 className="page-heading">{t.settings}</h1>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className="panel">
          <h2 className="section-title mb-6">{t.profile}</h2>
          <ApiForm
            endpoint="account"
            base={{ action: 'profile' }}
            fields={[
              { name: 'name', label: 'name', value: user.name, required: true },
              { name: 'bio', label: 'bio', type: 'textarea', value: user.bio },
              { name: 'image', label: 'avatar', type: 'upload', value: user.image },
              ...(!user.birthDate
                ? [
                    {
                      name: 'birthDate',
                      label: 'birthDate' as const,
                      type: 'date' as const,
                      required: true,
                    },
                  ]
                : []),
            ]}
          />
          <p className="muted mt-4">{t.birthLocked}</p>
          {!user.emailVerified && (
            <div className="mt-5">
              <p className="muted mb-3">{t.verifyNotice}</p>
              <ActionButton
                endpoint="resend-verification"
                body={{ email: user.email }}
                label="resend"
              />
            </div>
          )}
        </section>
        <section className="panel">
          <h2 className="section-title mb-6">{t.preferences}</h2>
          <Preferences
            language={user.language}
            theme={user.theme}
            allowMature={user.allowMature}
            emailDigest={user.emailDigest}
          />
        </section>
        {user.passwordHash && (
          <>
            <section className="panel">
              <h2 className="section-title mb-6">{t.changePassword}</h2>
              <ApiForm
                endpoint="account"
                base={{ action: 'password' }}
                redirect="/dang-nhap"
                fields={[
                  {
                    name: 'currentPassword',
                    label: 'currentPassword',
                    type: 'password',
                    required: true,
                  },
                  { name: 'password', label: 'newPassword', type: 'password', required: true },
                ]}
              />
            </section>
            <section className="panel">
              <h2 className="section-title mb-6">{t.changeEmail}</h2>
              <ApiForm
                endpoint="account"
                base={{ action: 'email' }}
                fields={[
                  { name: 'email', label: 'email', type: 'email', required: true },
                  {
                    name: 'currentPassword',
                    label: 'currentPassword',
                    type: 'password',
                    required: true,
                  },
                ]}
              />
            </section>
          </>
        )}
        <section className="panel">
          <h2 className="section-title mb-6">{t.notifications}</h2>
          {(['CHAPTER', 'REPLY', 'FOLLOW', 'MILESTONE', 'MODERATION'] as const).map((type) => {
            const enabled = prefs.find((p) => p.type === type)?.enabled !== false;
            return (
              <div className="flex items-center justify-between border-t py-4 text-sm" key={type}>
                <span>{t[type]}</span>
                <ActionButton
                  endpoint="account"
                  body={{ action: 'notification', type, enabled: !enabled }}
                  label={enabled ? 'disabled' : 'enabled'}
                />
              </div>
            );
          })}
        </section>
        <section className="panel border-red-500/20">
          <h2 className="section-title mb-6 text-red-600">{t.deleteAccount}</h2>
          <ApiForm
            endpoint="account"
            base={{ action: 'delete' }}
            submit="deleteAccount"
            redirect="/"
            fields={[
              { name: 'confirmation', label: 'deleteConfirm', required: true },
              ...(user.passwordHash
                ? [
                    {
                      name: 'currentPassword',
                      label: 'currentPassword' as const,
                      type: 'password' as const,
                      required: true,
                    },
                  ]
                : []),
            ]}
          />
        </section>
      </div>
    </div>
  );
}
