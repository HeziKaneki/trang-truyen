import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
if (!existsSync('.env')) {
  const dbPassword = randomBytes(18).toString('hex');
  const adminPassword = randomBytes(12).toString('hex');
  writeFileSync(
    '.env',
    readFileSync('.env.example', 'utf8')
      .replace('AUTH_SECRET=\n', `AUTH_SECRET=${randomBytes(32).toString('hex')}\n`)
      .replace('POSTGRES_PASSWORD=\n', `POSTGRES_PASSWORD=${dbPassword}\n`)
      .replace('CHANGE_ME', dbPassword)
      .replace('ADMIN_PASSWORD=\n', `ADMIN_PASSWORD=${adminPassword}\n`)
      .replace('SEED_PASSWORD=\n', `SEED_PASSWORD=${randomBytes(12).toString('hex')}\n`),
  );
  console.log('Created .env with random credentials. Read ADMIN_EMAIL / ADMIN_PASSWORD locally.');
}
config();
const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
};
run('docker', [
  'compose',
  '-f',
  'compose.yaml',
  '-f',
  'compose.dev.yaml',
  '--profile',
  'dev',
  'up',
  '-d',
  '--wait',
  'postgres',
  'redis',
  'mailpit',
]);
for (const script of ['db:generate', 'db:migrate', 'db:seed']) run('pnpm', [script]);
const children = ['worker', 'dev'].map((script) =>
  spawn('pnpm', [script], { stdio: 'inherit', shell: process.platform === 'win32' }),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    children.forEach((child) => child.kill());
    process.exit(0);
  });
