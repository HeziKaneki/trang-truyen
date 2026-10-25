import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/viet/',
        '/quan-tri',
        '/kiem-duyet',
        '/cai-dat',
        '/thu-vien',
        '/thong-bao',
        '/thong-ke',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
