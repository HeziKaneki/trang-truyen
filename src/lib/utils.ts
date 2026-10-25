import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
export function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
export function slugify(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
export function isAdult(birthDate: Date | null, now = new Date()) {
  if (!birthDate) return false;
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() - 18);
  return birthDate <= limit;
}
export function trendingScore(reads: number, votes: number, comments: number, ageHours: number) {
  return (reads + votes * 8 + comments * 5) / Math.pow(Math.max(0, ageHours) + 2, 1.35);
}
