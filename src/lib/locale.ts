import { cookies } from 'next/headers';
import { dictionaries } from './i18n';
export async function getLocale() {
  return (await cookies()).get('language')?.value === 'en' ? ('en' as const) : ('vi' as const);
}
export async function getDictionary() {
  return dictionaries[await getLocale()];
}
