import { redirect } from 'next/navigation';
import { currentUser } from './security';
export async function pageUser() {
  const user = await currentUser();
  if (!user) redirect('/dang-nhap');
  return user;
}
