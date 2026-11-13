import { AppError } from '@job-pilot/shared/errors';
import {
  type Targets,
  type TargetsPatch,
  targetsDefaults,
  targetsSchema,
} from '@job-pilot/shared/targets';
import { advancePast, assertStepReached, loadUser } from '../onboarding/onboarding-rules.ts';
import type { TargetsRepository } from '../ports/targets-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';
import { fieldErrors } from '../shared/zod-errors.ts';

type Deps = { targets: TargetsRepository; users: UserRepository };

const defaults = (): Targets => ({
  ...targetsDefaults,
  workFormats: [...targetsDefaults.workFormats],
});

/** GET /v1/targets — spec defaults until saved (Remote + Hybrid, Jobs and Events on). */
export async function getTargets(deps: Deps, userId: string): Promise<Targets> {
  return (await deps.targets.get(userId)) ?? defaults();
}

/** PUT /v1/targets — onboarding step 3 "Set targets": saves, moves to step 4. */
export async function putTargets(deps: Deps, userId: string, input: Targets): Promise<Targets> {
  const user = await loadUser(deps.users, userId);
  assertStepReached(user, 'set_targets');
  const saved = await deps.targets.save(userId, input);
  await advancePast(deps.users, user, 'set_targets');
  return saved;
}

/**
 * PATCH /v1/targets — one section at a time; the merged result is validated as a whole
 * (e.g. switching off the last of Jobs/Events → "Keep at least one type switched on.").
 */
export async function patchTargets(
  deps: Deps,
  userId: string,
  patch: TargetsPatch,
): Promise<Targets> {
  const user = await loadUser(deps.users, userId);
  assertStepReached(user, 'set_targets');
  const merged = {
    ...(await getTargets(deps, userId)),
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  };
  const result = targetsSchema.safeParse(merged);
  if (!result.success)
    throw new AppError(
      'validation_failed',
      'Check the highlighted fields.',
      fieldErrors(result.error),
    );
  return deps.targets.save(userId, result.data);
}
