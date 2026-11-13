import type { NextConfig } from 'next';

/** Server-side only: where the Hono api runs. */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactCompiler: true,
  /**
   * The browser talks only to the web origin; Next proxies auth and api calls.
   * Session cookies stay first-party and no CORS is needed. Google redirect URI:
   * `${WEB_URL}/api/auth/callback/google`.
   */
  rewrites: async () => [
    { source: '/api/auth/:path*', destination: `${apiUrl}/api/auth/:path*` },
    { source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` },
  ],
};

export default nextConfig;
