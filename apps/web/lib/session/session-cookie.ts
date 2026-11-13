/**
 * Better Auth session cookie names (the `__Secure-` prefix is used on https).
 * Only for the optimistic check in proxy.ts — presence does not mean the session is valid.
 */
export const sessionCookieNames = ['better-auth.session_token', '__Secure-better-auth.session_token'] as const;

export const hasSessionCookie = (cookies: { has(name: string): boolean }) => sessionCookieNames.some((n) => cookies.has(n));
