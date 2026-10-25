import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '@/lib/env';
import { db } from '../db';
import { AppError } from '../errors';
import { authorize, type Actor } from '../security';
export interface StorageService {
  put(name: string, bytes: Buffer): Promise<string>;
  remove(name: string): Promise<void>;
}
export class LocalStorageService implements StorageService {
  async put(name: string, bytes: Buffer) {
    await mkdir(env.UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(env.UPLOAD_DIR, path.basename(name)), bytes, { flag: 'wx' });
    return `/uploads/${name}`;
  }
  async remove(name: string) {
    await unlink(path.join(env.UPLOAD_DIR, path.basename(name))).catch(() => undefined);
  }
}
export async function upload(user: Actor, file: File) {
  authorize(user);
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 6 * 1024 * 1024 ||
    file.size < 16
  )
    throw new AppError('INVALID_UPLOAD');
  const input = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(input, { limitInputPixels: 36_000_000 }).metadata();
  if (
    !meta.width ||
    !meta.height ||
    meta.width < 32 ||
    meta.height < 32 ||
    meta.width > 10000 ||
    meta.height > 10000 ||
    !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
    (meta.pages ?? 1) > 1
  )
    throw new AppError('INVALID_UPLOAD');
  const id = randomUUID();
  const processed = await sharp(input)
    .rotate()
    .resize({ width: 1800, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(processed.data).resize({ width: 360 }).webp({ quality: 80 }).toBuffer();
  const storage = new LocalStorageService();
  const url = await storage.put(`${id}.webp`, processed.data);
  const thumbnailUrl = await storage.put(`${id}-thumb.webp`, thumb);
  return db.uploadedFile.create({
    data: {
      userId: user.id,
      url,
      thumbnailUrl,
      mime: 'image/webp',
      size: processed.data.length,
      width: processed.info.width,
      height: processed.info.height,
    },
  });
}
