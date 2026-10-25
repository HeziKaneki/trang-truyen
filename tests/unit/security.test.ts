import { describe, expect, it, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { authorize, assertActive, canMature, checkCsrf } from '@/server/security';
import type { Actor } from '@/server/security';
import { content, sanitize } from '@/server/sanitize';
import { normalize, slugify, isAdult, trendingScore } from '@/lib/utils';
import { registerInput } from '@/server/services/accounts';
import { dictionaries } from '@/lib/i18n';
const actor = {
  id: 'owner',
  role: 'USER',
  deletedAt: null,
  bannedAt: null,
  suspendedUntil: null,
} as Actor;
describe('authorization', () => {
  it('requires ownership, even for an admin using author endpoints', () => {
    expect(() => authorize(actor, { ownerId: 'other' })).toThrow('FORBIDDEN');
    expect(() => authorize({ ...actor, role: 'ADMIN' }, { ownerId: 'other' })).toThrow('FORBIDDEN');
    expect(() => authorize(actor, { ownerId: 'owner' })).not.toThrow();
  });
  it('separates moderator and admin privileges', () => {
    expect(() => authorize(actor, { role: 'MODERATOR' })).toThrow();
    expect(() => authorize({ ...actor, role: 'MODERATOR' }, { role: 'ADMIN' })).toThrow();
    expect(() => authorize({ ...actor, role: 'ADMIN' }, { role: 'MODERATOR' })).not.toThrow();
  });
  it('blocks banned, deleted and actively suspended users', () => {
    expect(() => assertActive({ ...actor, bannedAt: new Date() })).toThrow();
    expect(() => assertActive({ ...actor, deletedAt: new Date() })).toThrow();
    expect(() =>
      assertActive({ ...actor, suspendedUntil: new Date(Date.now() + 10000) }),
    ).toThrow();
  });
});
describe('age gate', () => {
  it('uses calendar birthdays and explicit preferences', () => {
    expect(isAdult(new Date('2008-10-25'), new Date('2026-10-24'))).toBe(false);
    expect(isAdult(new Date('2008-10-24'), new Date('2026-10-24'))).toBe(true);
    expect(canMature(null)).toBe(false);
    expect(canMature(null, true)).toBe(true);
    expect(canMature({ birthDate: new Date('2015-01-01'), allowMature: true }, true)).toBe(false);
    expect(canMature({ birthDate: null, allowMature: true })).toBe(false);
  });
});
describe('HTML security', () => {
  it('removes executable markup, event handlers and external tracking images', () => {
    const result = sanitize(
      '<script>alert(1)</script><p onclick="alert(1)">Hello</p><img src="https://evil.test/x"><img src="javascript:alert(1)"><iframe src="https://evil.test"></iframe>',
    );
    expect(result).toBe('<p>Hello</p>');
  });
  it('preserves supported formatting and local re-encoded images', () => {
    const result = sanitize(
      '<h2>A</h2><p><strong>B</strong><em>C</em></p><img src="/uploads/ab12-cd34.webp" onerror="alert(1)">',
    );
    expect(result).toContain('<strong>B</strong>');
    expect(result).toContain('/uploads/ab12-cd34.webp');
    expect(result).not.toContain('onerror');
  });
  it('is idempotent and separates paragraphs when counting words', () => {
    const input = '<p>Hà Nội</p><p>mùa thu</p>';
    expect(sanitize(sanitize(input))).toBe(sanitize(input));
    expect(content(input).wordCount).toBe(4);
  });
});
describe('CSRF', () => {
  const token = 'a'.repeat(64);
  const make = (origin: string, value: string) =>
    new Request('http://localhost:3000/api/v1/stories', {
      method: 'POST',
      headers: { origin, cookie: `novel-csrf=${token}`, 'x-csrf-token': value },
    });
  it('requires matching origin and double-submit token', () => {
    expect(() => checkCsrf(make('http://localhost:3000', token))).not.toThrow();
    expect(() => checkCsrf(make('https://evil.test', token))).toThrow('CSRF');
    expect(() => checkCsrf(make('http://localhost:3000', 'b'.repeat(64)))).toThrow('CSRF');
    expect(() => checkCsrf(make('http://localhost:3000', ''))).toThrow();
  });
});
describe('input and ranking', () => {
  it('normalizes Vietnamese including đ', () => {
    expect(normalize('Đặng Thùy Trâm')).toBe('dang thuy tram');
    expect(slugify('Mùa Hạ ở Hà Nội!')).toBe('mua-ha-o-ha-noi');
  });
  it('requires strong registration input and terms', () => {
    const valid = {
      email: 'User@example.com',
      password: 'a-long-password',
      name: 'Minh Anh',
      username: 'minhanh',
      birthDate: '2000-01-01',
      terms: true,
    };
    expect(registerInput.parse(valid).email).toBe('user@example.com');
    expect(registerInput.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerInput.safeParse({ ...valid, terms: false }).success).toBe(false);
  });
  it('decays rankings over time and weights votes', () => {
    expect(trendingScore(100, 10, 2, 1)).toBeGreaterThan(trendingScore(100, 10, 2, 48));
    expect(trendingScore(0, 1, 0, 1)).toBeGreaterThan(trendingScore(1, 0, 0, 1));
    expect(trendingScore(0, 0, 0, 0)).toBe(0);
  });
  it('has both dictionaries with all keys', () =>
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.vi).sort()));
});
