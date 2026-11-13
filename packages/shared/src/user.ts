import { z } from 'zod';
import { dateTimeSchema, idSchema } from './common.ts';
import { onboardingSteps, themes } from './enums.ts';

export const meSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string(),
  image: z.url().nullable(),
  timezone: z.string(),
  theme: z.enum(themes),
  pausedAt: dateTimeSchema.nullable(),
  onboardingStep: z.enum(onboardingSteps),
  onboardingCompletedAt: dateTimeSchema.nullable(),
});
export type Me = z.infer<typeof meSchema>;

export const updateSettingsInputSchema = z.object({
  theme: z.enum(themes).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;
