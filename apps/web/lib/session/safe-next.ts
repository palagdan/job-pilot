/** Request header set by proxy.ts with the current path + query (layouts cannot read the URL). */
export const pathnameHeader = 'x-jp-pathname';

/** Default page after sign-in. */
export const defaultAfterLogin = '/today';

/**
 * `?next=` target after sign-in, limited to same-site paths (no open redirects):
 * must start with a single "/", no "//" or "/\" (protocol-relative), no control characters.
 */
export const safeNext = (value: string | null | undefined): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return defaultAfterLogin;
  // oxlint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(value)) return defaultAfterLogin;
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return defaultAfterLogin;
  return value;
};

export const loginUrl = (next?: string) =>
  next && safeNext(next) !== defaultAfterLogin ? `/login?next=${encodeURIComponent(safeNext(next))}` : '/login';
