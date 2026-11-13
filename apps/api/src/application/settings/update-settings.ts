import type { Theme } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import type { Me } from '@job-pilot/shared/user';
import { getMe } from '../me/get-me.ts';
import type { UserRepository } from '../ports/user-repository.ts';

/** PATCH /v1/me/settings — spec "Theme": stored per user (the web also keeps it in a cookie for the first paint). */
export async function updateSettings(
  deps: { users: UserRepository },
  userId: string,
  input: { theme?: Theme },
): Promise<Me> {
  if (input.theme) await deps.users.setTheme(userId, input.theme);
  const me = await getMe(deps, userId);
  if (!me) throw new AppError('unauthorized', 'Sign in to continue.');
  return me;
}
