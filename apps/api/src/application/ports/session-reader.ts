/** The signed-in user as far as the http layer needs to know. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

/** Resolves the current user from request headers (session cookie). Implemented by the auth adapter. */
export interface SessionReader {
  read(headers: Headers): Promise<SessionUser | null>;
}
