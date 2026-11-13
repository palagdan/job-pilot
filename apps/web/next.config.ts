import type { NextConfig } from 'next';

/** Server-side only: where the Hono api runs. */
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactCompiler: true,
  /** Workspace packages are raw TypeScript. */
  transpilePackages: ['@job-pilot/shared'],
  /** Google profile pictures (Better Auth stores the Google `picture` URL as `user.image`). */
  images: { remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }] },
  /**
   * The browser talks only to the web origin; Next proxies auth and api calls.
   * Session cookies stay first-party and no CORS is needed. Google redirect URI:
   * `${WEB_URL}/api/auth/callback/google`.
   */
  rewrites: async () => [
    { source: '/api/auth/:path*', destination: `${apiUrl}/api/auth/:path*` },
    { source: '/v1/:path*', destination: `${apiUrl}/v1/:path*` },
    // Development-only api route (not mounted by the api in production).
    { source: '/api/dev/:path*', destination: `${apiUrl}/api/dev/:path*` },
  ],
};

export default nextConfig;
