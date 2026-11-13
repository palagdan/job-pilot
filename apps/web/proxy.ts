import { type NextRequest, NextResponse } from 'next/server';
import { loginUrl, pathnameHeader } from './lib/session/safe-next.ts';
import { hasSessionCookie } from './lib/session/session-cookie.ts';

/** Pages anyone may open. Everything else needs a session cookie. */
const publicPaths = ['/login', '/design-system'];

/**
 * Optimistic auth check (Next 16 "proxy", formerly middleware): only looks for the session cookie, never calls
 * the api — it runs on every navigation and prefetch. The real check is `requireUser()` in server pages, and
 * the api itself rejects requests without a valid session.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic || hasSessionCookie(request.cookies)) {
    // Layouts cannot read the URL; pass it on so `requireUser` can build `/login?next=…`.
    const headers = new Headers(request.headers);
    headers.set(pathnameHeader, `${pathname}${search}`);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.redirect(new URL(loginUrl(`${pathname}${search}`), request.url));
}

export const config = {
  matcher: [
    // Skip api proxies (/api, /v1), Next internals and static files (icons, brand assets, anything with an extension).
    '/((?!api/|v1/|_next/|brand/|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};
