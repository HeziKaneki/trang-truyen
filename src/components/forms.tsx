'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useError, useI18n } from './providers';
import type { MessageKey } from '@/lib/i18n';
import { Button } from './ui/button';
export type Field = {
  name: string;
  label: MessageKey;
  type?:
    | 'text'
    | 'email'
    | 'password'
    | 'date'
    | 'datetime-local'
    | 'number'
    | 'checkbox'
    | 'textarea'
    | 'select'
    | 'upload'
    | 'tags';
  value?: string | number | boolean | null;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  readOnly?: boolean;
};
export function ApiForm({
  endpoint,
  fields,
  base = {},
  method = 'POST',
  submit = 'save',
  redirect,
  className = '',
  onSuccess,
}: {
  endpoint: string;
  fields: Field[];
  base?: Record<string, unknown>;
  method?: string;
  submit?: MessageKey;
  redirect?: string;
  className?: string;
  onSuccess?: (value: unknown) => void;
}) {
  const t = useI18n();
  const showError = useError();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  async function uploadFile(name: string, file: File) {
    setBusy(true);
    try {
      const data = new FormData();
      data.set('file', file);
      const result = await api<{ url: string }>('uploads', data);
      setUploaded((v) => ({ ...v, [name]: result.url }));
      toast.success(t.success);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`space-y-5 ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setErrors([]);
        const body = { ...base };
        for (const field of fields) {
          const value = form.get(field.name);
          if (field.type === 'checkbox') body[field.name] = value === 'on';
          else if (field.type === 'number') {
            if (value !== '') body[field.name] = Number(value);
          } else if (field.type === 'tags')
            body[field.name] = String(value || '')
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean);
          else if (field.type === 'upload')
            body[field.name] = uploaded[field.name] || field.value || null;
          else if (value !== '' && value !== null)
            body[field.name] =
              field.type === 'datetime-local' ? new Date(String(value)).toISOString() : value;
          else if (field.type === 'textarea') body[field.name] = '';
        }
        try {
          const result = await api<{ id?: string }>(endpoint, body, method);
          toast.success(t.success);
          onSuccess?.(result);
          if (redirect) router.push(redirect.replace(':id', result.id || ''));
          router.refresh();
        } catch (error) {
          if (error instanceof ApiError && error.fields) setErrors(Object.keys(error.fields));
          showError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((field) => {
        const id = `${endpoint}-${field.name}`;
        return (
          <div key={field.name}>
            <label
              htmlFor={id}
              className={field.type === 'checkbox' ? 'flex items-center gap-3 text-sm' : 'label'}
            >
              {field.type === 'checkbox' && (
                <input
                  id={id}
                  name={field.name}
                  type="checkbox"
                  defaultChecked={!!field.value}
                  required={field.required}
                  className="h-4 w-4 accent-primary"
                />
              )}
              {t[field.label]}
            </label>
            {field.type === 'checkbox' ? null : field.type === 'select' ? (
              <select
                id={id}
                name={field.name}
                required={field.required}
                defaultValue={String(field.value ?? '')}
                className="field"
              >
                {!field.required && <option value="">—</option>}
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={id}
                name={field.name}
                defaultValue={String(field.value ?? '')}
                required={field.required}
                rows={4}
                maxLength={field.max}
                className="field"
              />
            ) : field.type === 'upload' ? (
              <div className="flex items-center gap-4">
                {(uploaded[field.name] || field.value) && (
                  <img
                    className="h-20 w-16 rounded-lg object-cover"
                    src={String(uploaded[field.name] || field.value)}
                    alt={t[field.label]}
                  />
                )}
                <input
                  id={id}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(field.name, file);
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-4 file:py-2"
                />
              </div>
            ) : (
              <>
                <input
                  id={id}
                  name={field.name}
                  type={field.type === 'tags' ? 'text' : field.type || 'text'}
                  list={field.type === 'tags' ? `${id}-tags` : undefined}
                  defaultValue={String(field.value ?? '')}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  readOnly={field.readOnly}
                  autoComplete={
                    field.type === 'password'
                      ? field.name === 'currentPassword'
                        ? 'current-password'
                        : 'new-password'
                      : undefined
                  }
                  className="field"
                  onChange={
                    field.type === 'tags'
                      ? (e) => {
                          const q = e.target.value.split(',').at(-1)?.trim() || '';
                          if (q.length >= 2)
                            void api<{ tags: { name: string }[] }>(
                              `search?q=${encodeURIComponent(q)}`,
                            )
                              .then((r) => setTagOptions(r.tags.map((v) => v.name)))
                              .catch(() => {});
                        }
                      : undefined
                  }
                />
                {field.type === 'tags' && (
                  <datalist id={`${id}-tags`}>
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                )}
              </>
            )}
            {errors.includes(field.name) && (
              <p className="mt-1 text-xs text-red-600">{t.INVALID_INPUT}</p>
            )}
          </div>
        );
      })}
      <Button disabled={busy} type="submit">
        {busy ? t.saving : t[submit]}
      </Button>
    </form>
  );
}
export function ActionButton({
  endpoint,
  body,
  label,
  variant = 'outline',
  method = 'POST',
  refresh = true,
  confirm = false,
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: MessageKey;
  variant?: 'outline' | 'default' | 'destructive' | 'ghost';
  method?: string;
  refresh?: boolean;
  confirm?: boolean;
}) {
  const t = useI18n();
  const showError = useError();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={busy}
      onClick={async () => {
        if (confirm && !window.confirm(t.confirmDelete)) return;
        setBusy(true);
        try {
          await api(endpoint, body, method);
          toast.success(t.success);
          if (refresh) router.refresh();
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? t.saving : t[label]}
    </Button>
  );
}
