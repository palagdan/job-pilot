import { z } from 'zod';
import { tagListSchema } from './common.ts';
import { workFormats } from './enums.ts';
import { limits, messages } from './limits.ts';

export const targetsSchema = z
  .object({
    roles: tagListSchema(limits.roles, 'roles', messages.rolesRequired),
    locations: tagListSchema(limits.locations, 'locations', messages.locationsRequired),
    workFormats: z.array(z.enum(workFormats)).min(1, messages.workFormatRequired),
    exclusions: tagListSchema(limits.exclusions, 'exclusions'),
    findJobs: z.boolean(),
    findEvents: z.boolean(),
  })
  .refine((t) => t.findJobs || t.findEvents, {
    path: ['findJobs'],
    message: messages.lookForRequired,
  });
export type Targets = z.infer<typeof targetsSchema>;

export const targetsDefaults = {
  roles: [],
  locations: [],
  workFormats: ['remote', 'hybrid'],
  exclusions: [],
  findJobs: true,
  findEvents: true,
} as const satisfies z.input<typeof targetsSchema>;

/** Per-section save on "Profile and targets". The api re-validates the merged result with `targetsSchema`. */
export const targetsPatchSchema = z.object({
  roles: targetsSchema.shape.roles.optional(),
  locations: targetsSchema.shape.locations.optional(),
  workFormats: targetsSchema.shape.workFormats.optional(),
  exclusions: targetsSchema.shape.exclusions.optional(),
  findJobs: z.boolean().optional(),
  findEvents: z.boolean().optional(),
});
export type TargetsPatch = z.infer<typeof targetsPatchSchema>;

export const suggestionKinds = ['roles', 'locations', 'skills'] as const;
export const suggestionsQuerySchema = z.object({
  kind: z.enum(suggestionKinds),
  q: z.string().trim().max(limits.tag.max).default(''),
});
export const suggestionsSchema = z.object({ items: z.array(z.string()) });
