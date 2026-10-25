import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { currentUser, canMature } from '@/server/security';
import { publicWhere } from '@/server/services/stories';
import { storyInclude } from '@/server/services/discovery';
import { getDictionary } from '@/lib/locale';
import { StoryGrid } from '@/components/story-card';
import { Toggle, Report } from '@/components/social-actions';
export default async function Profile({ params }: { params: Promise<{ username: string }> }) {
  const [user, t, { username }] = await Promise.all([currentUser(), getDictionary(), params]);
  const author = await db.user.findFirst({
    where: { username, deletedAt: null, bannedAt: null },
    select: {
      id: true,
      name: true,
      username: true,
      bio: true,
      image: true,
      _count: { select: { followers: true, following: true } },
      stories: { where: publicWhere(canMature(user)), include: storyInclude },
      followers: { take: 100, include: { follower: { select: { username: true, name: true } } } },
      following: { take: 100, include: { following: { select: { username: true, name: true } } } },
    },
  });
  if (!author) notFound();
  const following = user
    ? !!(await db.follow.findUnique({
        where: { followerId_followingId: { followerId: user.id, followingId: author.id } },
      }))
    : false;
  return (
    <div className="container-page py-12">
      <header className="mb-12 rounded-3xl bg-muted p-8">
        <div className="flex flex-wrap items-center gap-6">
          {author.image ? (
            <img
              src={author.image}
              className="h-24 w-24 rounded-full object-cover"
              alt={author.name || author.username}
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 font-serif text-4xl text-primary">
              {author.name?.[0] || author.username[0]}
            </div>
          )}
          <div>
            <h1 className="font-serif text-3xl">{author.name}</h1>
            <p className="muted mt-2">@{author.username}</p>
            <p className="mt-4 text-xs">
              {author._count.followers} {t.followers} · {author._count.following} {t.following}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            {user?.id !== author.id && (
              <Toggle kind="follow" endpoint={`follows/${author.id}`} initial={following} />
            )}
            <Report targetType="USER" targetId={author.id} />
          </div>
        </div>
        <p className="mt-6 max-w-2xl whitespace-pre-wrap text-sm leading-7">{author.bio}</p>
      </header>
      <h2 className="section-title mb-6">{t.stories}</h2>
      <StoryGrid stories={author.stories} t={t} />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {[
          { label: t.followers, users: author.followers.map((v) => v.follower) },
          { label: t.following, users: author.following.map((v) => v.following) },
        ].map((group) => (
          <details key={group.label} className="panel">
            <summary className="cursor-pointer">{group.label}</summary>
            <div className="mt-4 flex flex-wrap gap-3">
              {group.users.map((v) => (
                <Link key={v.username} className="chip" href={`/tac-gia/${v.username}`}>
                  {v.name || v.username}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
