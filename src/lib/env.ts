import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(3),
  UPLOAD_DIR: z.string().default('./uploads'),
  LOG_LEVEL: z.string().default('info'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  SEED_DEMO: z.string().default('false'),
  SEED_PASSWORD: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});
export function validateEnv(source: NodeJS.ProcessEnv = process.env) {
  return schema.parse(source);
}
let cached: z.infer<typeof schema> | undefined;
export const env = new Proxy({} as z.infer<typeof schema>, {
  get: (_, key) => {
    cached ??= validateEnv();
    return cached[key as keyof typeof cached];
  },
});
