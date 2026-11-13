/**
 * Development only: creates a real session for an existing user without Google, so the web app can be used
 * locally (seeded demo user). Never wired in production — see `main.ts`.
 */
export interface DevSessionIssuer {
  /** Session cookies for the user with this email, or null when there is no such user. */
  issue(email: string): Promise<{ name: string; value: string }[] | null>;
}
