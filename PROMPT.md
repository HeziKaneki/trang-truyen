# ROLE
You are a senior full-stack engineer. Build a complete, working web application for publishing and reading stories (a Wattpad-like platform) from scratch, in one continuous run. Do not stop to ask questions: when something is ambiguous, choose the most conventional option, write the assumption in `docs/ASSUMPTIONS.md`, and keep going. Do not leave TODOs, stubs, or mock data in place of real features.

# PROJECT CONTEXT
- Web only (responsive, mobile-first UI). No native apps.
- Experimental deployment: ONE server, small scale (hundreds of users), but ALL features below must be fully implemented.
- Default UI language: Vietnamese. Structure all UI strings in a single i18n dictionary (`vi` default, `en` secondary) so language can be extended.
- Primary audience is Vietnamese: search must work with and without diacritics.

# TECH STACK (fixed, do not substitute)
- Language: TypeScript everywhere (strict mode).
- Framework: Next.js 14+ (App Router) full-stack. Server Components + SSR/ISR for public pages (SEO). Route Handlers or Server Actions for APIs.
- UI: Tailwind CSS + shadcn/ui. Support dark/light mode.
- Database: PostgreSQL 16 with Prisma ORM and migrations. Enable `unaccent` and `pg_trgm` extensions.
- Cache, counters, rate limiting, job queue: Redis 7 (+ BullMQ for background jobs).
- Auth: Auth.js (NextAuth v5): email+password (Argon2id) and Google OAuth. Email verification and password reset via SMTP (Nodemailer); use Mailpit in development.
- Rich-text editor: TipTap (store content as sanitized HTML plus plain-text for search/word count).
- Validation: Zod on every input. Sanitization: DOMPurify (isomorphic) / sanitize-html with a strict allowlist.
- File uploads (avatars, covers): stored on local disk volume behind a `StorageService` interface (so S3 can be swapped in later); validate MIME and size, re-encode images with `sharp`, generate thumbnails.
- Background worker: a separate Node process (same repo) running BullMQ workers.
- Tests: Vitest (unit/integration) + Playwright (a few critical E2E flows).
- Tooling: ESLint, Prettier, Husky optional, pnpm.
- Deployment: Docker Compose with services: `web` (Next.js standalone build), `worker`, `postgres`, `redis`, `caddy` (reverse proxy with automatic HTTPS and gzip/brotli), plus `mailpit` in the dev profile only. Include healthchecks, restart policies, named volumes (db, uploads, caddy).

# FEATURES (all required)

## 1. Accounts
- Register, login, logout, email verification, forgot/reset password, Google login.
- Profile page: avatar, display name, bio, list of published stories, followers/following counts, follow button.
- Settings: edit profile, change password, change email, language, theme, mature-content preference, delete account.
- Roles: USER, MODERATOR, ADMIN. Seed one admin from env vars.
- Age gate: users declare birth date at registration; mature (18+) stories are hidden from users under 18 and from guests unless they confirm age.

## 2. Writing (author side)
- "My stories" dashboard with stats (reads, votes, comments, followers per story).
- Create/edit story: title, description, cover image, language, category, up to 10 tags (autocomplete), status (ongoing/completed/hiatus), mature flag, copyright setting.
- Chapter management: create, edit, delete, drag-and-drop reorder, draft/published/scheduled (publish at a future time via worker job).
- TipTap editor: headings, bold/italic/underline, lists, quotes, horizontal rule, images in chapters (uploaded), undo/redo, word count, **autosave** every few seconds (debounced PATCH) with "saved/saving/error" indicator and protection against losing data on tab close or offline (local fallback in memory + retry).
- Version history per chapter (keep last 30 versions, restore any).
- Unpublish and delete story/chapter (soft delete with 30-day recovery).

## 3. Reading
- Home: featured/trending, new updates, by category, continue reading (for logged-in users).
- Story page (SSR, SEO meta, OpenGraph, JSON-LD): cover, description, tags, stats, chapter list, author, follow/add-to-library, vote, share.
- Chapter reader: clean typography, font size/family, line height, width, light/dark/sepia themes (persisted per user or in localStorage for guests), previous/next chapter, chapter list drawer, reading progress bar.
- Save and resume reading position (scroll position + chapter) for logged-in users; localStorage for guests.
- Library: user's saved stories with "new chapters" indicator; custom reading lists (create/rename/delete, add stories).
- Paragraph-level inline comments are NOT required; chapter-level comments are.

## 4. Social
- Vote (like) per chapter and per story (unique per user, toggle).
- Comments per chapter: nested replies (1 level deep is enough), edit/delete own, author can pin/delete on own chapters, cursor pagination, optimistic UI, basic spam protection.
- Follow/unfollow authors; followers list.
- Notifications (in-app, with unread badge, mark as read/all, preferences per type): new chapter from followed author or saved story, reply to comment, new follower, vote milestones, moderation outcomes. Real-time via Server-Sent Events, with polling fallback.
- Optional email digest for new chapters (user can opt in/out), sent by the worker.

## 5. Discovery
- Browse by category and tag, filter (status, language, mature, word-count range, last updated), sort (trending, newest, most read, most voted, recently updated).
- Search stories, authors, and tags using PostgreSQL full-text search + `unaccent` + trigram fuzzy matching; search suggestions/autocomplete; correct ranking (title > tags > description).
- Rankings/trending: worker computes scores every 10 minutes from reads, votes, comments, with time decay; cache results in Redis sorted sets; ranking pages: today, this week, this month, all time.
- Related stories ("you may also like") by shared tags/category/author (simple heuristic is fine).

## 6. Counters and analytics
- Read counts: Redis `INCR` with dedupe per (user or IP-hash, chapter) within a time window; worker flushes to Postgres every minute. Never write to the DB per page view.
- Author analytics page: reads/votes/comments over time (daily chart for last 30 days), top chapters, follower growth.

## 7. Moderation and admin
- Report button on stories, chapters, comments, users (with reason + note).
- Moderator queue: review reports, hide/remove content, warn/suspend/ban users, restore content, audit log of every moderation action.
- Automated checks on publish: banned-word list (configurable in admin), link/spam heuristic, duplicate-content heuristic; flagged content goes to review.
- Admin panel: user management, category/tag management (merge tags), banned words, featured stories (homepage curation), site settings, basic dashboard (new users, stories, chapters, reports per day).
- Copyright takedown form (public) creating a report with type COPYRIGHT.
- Terms of service, privacy policy, and content guidelines static pages (placeholder Vietnamese text acceptable).

## 8. SEO and misc
- `sitemap.xml`, `robots.txt`, canonical URLs, OpenGraph/Twitter cards, RSS feed per story/author, friendly slugs (`/truyen/[slug]`, `/truyen/[slug]/chuong-[n]`), 404/500 pages, loading skeletons, empty states, toast notifications, accessibility (keyboard nav, labels, contrast).

# DATA MODEL
Design a normalized Prisma schema covering at least: User, Account, Session/VerificationToken, Profile fields, Story, Chapter, ChapterVersion, Category, Tag, StoryTag, LibraryItem, ReadingList, ReadingListItem, ReadingProgress, Follow, StoryVote, ChapterVote, Comment, Notification, NotificationPreference, Report, ModerationAction (audit log), BannedWord, FeaturedStory, ChapterReadStat/StoryDailyStat (daily aggregates), UploadedFile. Add proper indexes (slug, foreign keys, tsvector GIN index for search, trigram index for titles, composite indexes for feeds and rankings), unique constraints (votes, follows, library), soft-delete fields, and timestamps. Provide a seed script with: admin user, sample categories/tags, ~20 sample users, ~30 stories with chapters and comments (realistic Vietnamese sample content), so the app looks populated on first run.

# ARCHITECTURE RULES
- Single repo, clear structure: `src/app` (routes), `src/server` (services, repositories, jobs, auth), `src/components`, `src/lib`, `prisma`, `docker`, `docs`, `tests`.
- Keep business logic in service modules, not in route handlers/components. Handlers: validate → authorize → call service → respond.
- Centralized authorization helper (role + ownership checks) used by every mutation.
- Centralized error handling and a consistent API error format. Structured logging (pino).
- Env vars validated at startup with Zod; provide `.env.example` with every variable documented.
- Public read pages use caching (ISR/`revalidateTag`) and invalidate on edit/publish; add HTTP cache headers for static uploads; Caddy serves `/uploads` directly with long cache.
- Postgres connection pooling configured sensibly for a small single server.

# SECURITY (mandatory)
- Argon2id password hashing; secure, httpOnly, sameSite cookies; CSRF protection for non-Auth.js mutations.
- Rate limiting (Redis) on login, register, password reset, comments, votes, reports, search, uploads.
- Sanitize all user HTML on write AND render; strict CSP header; security headers (HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors).
- Verify ownership on every story/chapter/comment mutation; no IDOR.
- Upload validation (type, size, dimensions), random filenames, no executable content, images re-encoded.
- No secrets in the repo; never log passwords/tokens.
- Account lockout/backoff after repeated failed logins.

# OPERATIONS
- `docker compose up -d` must bring up the whole system on a fresh Ubuntu server with just `.env` filled in. Run Prisma migrations automatically on `web` start.
- Scripts: nightly `pg_dump` backup (cron container or script) with 7-day retention and a documented restore procedure; uploads backup instructions.
- Health endpoint `/api/health` (DB + Redis check).
- Minimal observability: structured logs, optional Sentry via env var.
- `docs/DEPLOY.md`: step-by-step for a single VPS (DNS, firewall, Docker install, env setup, first run, updates, backup/restore, troubleshooting).

# DOCUMENTATION DELIVERABLES
- `README.md`: overview, features, stack, local dev setup (one command), scripts, project structure.
- `docs/ARCHITECTURE.md`: diagram (Mermaid), module overview, data flow for reading, publishing, counters, notifications, trending.
- `docs/API.md`: list of routes/actions with inputs/outputs.
- `docs/ASSUMPTIONS.md`: every decision you made where the spec was ambiguous.

# WORKFLOW (follow in this order, but finish everything in this single run)
1. Scaffold the project, tooling, Docker Compose, env validation, Prisma schema + migration + seed.
2. Auth and user/profile/settings.
3. Story and chapter CRUD, editor with autosave and versions, uploads, scheduling.
4. Public pages: home, story, reader, categories, tags, library, reading progress.
5. Social: votes, comments, follows, notifications (SSE), email digest.
6. Search, rankings, counters, analytics, worker jobs.
7. Moderation, admin panel, reports, takedown, static pages.
8. SEO, caching, security headers, rate limiting.
9. Tests, deployment docs, backup scripts, final polish.

After each step: run type-check, lint, and relevant tests; fix all failures before moving on. At the end, run the full production build and `docker compose build`, run the Playwright E2E suite, and fix any issue found.

# TESTS (minimum)
- Unit/integration: auth flows, authorization (ownership/roles), chapter publish + scheduling, counter dedupe + flush, vote uniqueness, search ranking with/without diacritics, sanitization, rate limiting, trending computation.
- E2E (Playwright): register → create story → write chapter with autosave → publish → read as another user → vote/comment → follow → receive notification → search finds the story; report content → moderator hides it.

# DEFINITION OF DONE
- Every feature above works end-to-end in the UI (no dead buttons or fake data).
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` all pass.
- `docker compose up -d` on a clean machine yields a working site with seeded data and a working admin login.
- Docs are complete and accurate.
- Finish with a final report: what was built, how to run it, default credentials from seed, known limitations, and recommended next steps.