import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import {
  checkCsrf,
  currentUser,
  requireUser,
  requestIdentity,
  rateLimit,
  authorize,
} from '@/server/security';
import { AppError, errorResponse } from '@/server/errors';
import {
  register,
  registerInput,
  requestToken,
  emailInput,
  consumeToken,
  tokenInput,
  accountInput,
  updateAccount,
} from '@/server/services/accounts';
import {
  saveStory,
  storyInput,
  createChapter,
  saveChapter,
  chapterInput,
  publicationInput,
  setPublication,
  restoreVersion,
  reorderChapters,
  lifecycle,
  ownStory,
  ownChapter,
  readableChapter,
} from '@/server/services/stories';
import {
  vote,
  follow,
  library,
  readingProgress,
  progressInput,
  readingList,
  listInput,
  comments,
  createComment,
  commentInput,
  editComment,
  toggleInput,
} from '@/server/services/social';
import {
  createReport,
  reportInput,
  moderate,
  moderationInput,
  administer,
  adminInput,
} from '@/server/services/moderation';
import { suggestions } from '@/server/services/discovery';
import { countRead } from '@/server/services/counters';
import { upload } from '@/server/services/storage';
import { analytics } from '@/server/services/analytics';
type Context = { params: Promise<{ path: string[] }> };
const idSchema = z.string().cuid();
const lifecycleInput = z.object({ action: z.enum(['delete', 'restore', 'unpublish']) });
async function json(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > 600_000)
    throw new AppError('PAYLOAD_TOO_LARGE', 413);
  const text = await request.text();
  if (text.length > 600_000) throw new AppError('PAYLOAD_TOO_LARGE', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('INVALID_JSON');
  }
}
async function dispatch(request: Request, context: Context) {
  const [resource, rawId, sub, rawSubId] = (await context.params).path;
  const id = rawId ? idSchema.parse(rawId) : undefined;
  const subId = rawSubId ? idSchema.parse(rawSubId) : undefined;
  const url = new URL(request.url);
  const identity = await requestIdentity();
  const guest = (await cookies()).get('age-confirmed')?.value === 'true';
  if (request.method === 'GET') {
    if (resource === 'search') {
      await rateLimit(`search:${identity}`, 60);
      const q = z
        .string()
        .max(100)
        .parse(url.searchParams.get('q') || '');
      return suggestions(q, await currentUser(), guest);
    }
    if (resource === 'categories') return db.category.findMany({ orderBy: { name: 'asc' } });
    if (resource === 'comments' && id)
      return comments(
        id,
        await currentUser(),
        guest,
        z
          .string()
          .cuid()
          .optional()
          .parse(url.searchParams.get('cursor') || undefined),
      );
    if (resource === 'followers' && id) {
      const following = url.searchParams.get('direction') === 'following';
      return db.follow.findMany({
        where: following ? { followerId: id } : { followingId: id },
        include: {
          follower: { select: { id: true, name: true, username: true } },
          following: { select: { id: true, name: true, username: true } },
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
    }
    const user = await requireUser(false);
    if (resource === 'notifications')
      return {
        items: await db.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        unread: await db.notification.count({ where: { userId: user.id, readAt: null } }),
      };
    if (resource === 'stories' && id) {
      await ownStory(user, id);
      return db.story.findUnique({
        where: { id },
        include: { tags: { include: { tag: true } }, chapters: { orderBy: { number: 'asc' } } },
      });
    }
    if (resource === 'chapters' && id) {
      const chapter = await ownChapter(user, id);
      if (sub === 'versions')
        return db.chapterVersion.findMany({
          where: { chapterId: id },
          orderBy: { revision: 'desc' },
        });
      return chapter;
    }
    if (resource === 'analytics') return analytics(user);
    if (resource === 'moderation') {
      authorize(user, { role: 'MODERATOR' });
      return {
        reports: await db.report.findMany({
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 100,
        }),
        audit: await db.moderationAction.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      };
    }
    throw new AppError('NOT_FOUND', 404);
  }
  checkCsrf(request);
  await rateLimit(`api:${identity}`, 240);
  if (resource === 'uploads') {
    const user = await requireUser();
    authorize(user);
    await rateLimit(`upload:${user.id}`, 20, 3600);
    if (Number(request.headers.get('content-length')) > 7 * 1024 * 1024)
      throw new AppError('PAYLOAD_TOO_LARGE', 413);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError('INVALID_UPLOAD');
    return upload(user, file);
  }
  const body = await json(request);
  if (resource === 'register') {
    await rateLimit(`register:${identity}`, 5, 3600);
    if (
      (await db.siteSetting.findUnique({ where: { key: 'registrationOpen' } }))?.value === 'false'
    )
      throw new AppError('REGISTRATION_CLOSED', 403);
    return register(registerInput.parse(body));
  }
  if (resource === 'forgot' || resource === 'resend-verification') {
    await rateLimit(`reset:${identity}`, 5, 3600);
    return requestToken(emailInput.parse(body).email, resource === 'forgot' ? 'RESET' : 'VERIFY');
  }
  if (resource === 'verify' || resource === 'reset') {
    await rateLimit(`token:${identity}`, 10, 3600);
    return consumeToken(tokenInput.parse(body), resource === 'reset');
  }
  if (resource === 'takedown') {
    await rateLimit(`report:${identity}`, 3, 3600);
    return createReport(null, reportInput.extend({ reason: z.literal('COPYRIGHT') }).parse(body));
  }
  if (resource === 'reads' && id) {
    await rateLimit(`read:${identity}`, 60);
    const user = await currentUser();
    const chapter = await readableChapter(id, user, guest);
    return { counted: await countRead(user?.id || identity, id, chapter.storyId) };
  }
  const user = await requireUser(resource !== 'account' && resource !== 'notifications');
  authorize(user);
  if (resource === 'account') return updateAccount(user, accountInput.parse(body));
  if (resource === 'stories') {
    if (!id) return saveStory(user, storyInput.parse(body));
    if (sub === 'chapters')
      return createChapter(
        user,
        id,
        z.object({ title: z.string().min(1).max(180) }).parse(body).title,
      );
    if (sub === 'reorder')
      return reorderChapters(
        user,
        id,
        z.object({ ids: z.array(idSchema).max(1000) }).parse(body).ids,
      );
    if (sub === 'lifecycle') return lifecycle(user, 'story', id, lifecycleInput.parse(body).action);
    return saveStory(user, storyInput.parse(body), id);
  }
  if (resource === 'chapters' && id) {
    if (sub === 'publication') return setPublication(user, id, publicationInput.parse(body));
    if (sub === 'versions' && subId) return restoreVersion(user, id, subId);
    if (sub === 'lifecycle')
      return lifecycle(user, 'chapter', id, lifecycleInput.parse(body).action);
    return saveChapter(user, id, chapterInput.parse(body));
  }
  if ((resource === 'story-votes' || resource === 'chapter-votes') && id) {
    await rateLimit(`vote:${user.id}`, 60);
    return vote(
      user,
      resource === 'story-votes' ? 'story' : 'chapter',
      id,
      toggleInput.parse(body).enabled,
    );
  }
  if (resource === 'follows' && id) {
    await rateLimit(`follow:${user.id}`, 30);
    return follow(user, id, toggleInput.parse(body).enabled);
  }
  if (resource === 'library' && id) return library(user, id, toggleInput.parse(body).enabled);
  if (resource === 'lists') return readingList(user, listInput.parse(body));
  if (resource === 'progress') return readingProgress(user, progressInput.parse(body));
  if (resource === 'comments' && id) {
    await rateLimit(`comment:${user.id}`, 10);
    if (request.method === 'POST') return createComment(user, id, commentInput.parse(body));
    return editComment(
      user,
      id,
      z
        .discriminatedUnion('action', [
          z.object({ action: z.literal('edit'), body: commentInput.shape.body }),
          z.object({ action: z.literal('delete') }),
          z.object({ action: z.literal('pin'), pinned: z.boolean() }),
        ])
        .parse(body),
    );
  }
  if (resource === 'notifications') {
    const input = z.object({ id: idSchema.optional(), all: z.boolean().optional() }).parse(body);
    if (!input.id && !input.all) throw new AppError('INVALID_INPUT');
    await db.notification.updateMany({
      where: { userId: user.id, ...(input.all ? {} : { id: input.id }) },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
  if (resource === 'reports') {
    await rateLimit(`report:${user.id}`, 5, 3600);
    return createReport(user, reportInput.parse(body));
  }
  if (resource === 'moderation') return moderate(user, moderationInput.parse(body));
  if (resource === 'admin') return administer(user, adminInput.parse(body));
  throw new AppError('NOT_FOUND', 404);
}
async function handler(request: Request, context: Context) {
  try {
    return Response.json(
      { data: await dispatch(request, context) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
