import type { NextConfig } from 'next';
const config: NextConfig = {
  // Linux containers use standalone. Windows local builds avoid privileged symlinks.
  output: process.platform === 'win32' ? undefined : 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['argon2', 'pino', 'bullmq'],
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};
export default config;
