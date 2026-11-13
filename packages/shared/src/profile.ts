import { z } from 'zod';
import { idSchema, tagListSchema, tagSchema } from './common.ts';
import { experienceBands, languageLevels, noticePeriods, salaryPeriods } from './enums.ts';
import { limits, messages } from './limits.ts';

export const linkedinUrlSchema = z
  .url(messages.linkedinUrl)
  .max(limits.url.max)
  .refine(
    (u) => /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/]+\/?$/i.test(u),
    messages.linkedinUrl,
  );

export const portfolioUrlSchema = z.url(messages.portfolioUrl).max(limits.url.max);

export const salarySchema = z
  .object({
    min: z.number().int().positive(),
    max: z.number().int().positive().nullable(),
    /** ISO 4217, e.g. "CZK", "EUR". */
    currency: z.string().length(3).toUpperCase(),
    period: z.enum(salaryPeriods),
  })
  .refine((s) => s.max === null || s.max >= s.min, {
    path: ['max'],
    message: 'Max must be at least min.',
  });

export const languageSchema = z.object({
  language: tagSchema,
  level: z.enum(languageLevels),
});

export const proofItemSchema = z.object({
  id: idSchema.optional(),
  text: z.string().trim().min(1).max(limits.proofItems.textMax),
});

/** Confirm profile (onboarding 2) and Profile section of "Profile and targets". */
export const profileInputSchema = z.object({
  fullName: z.string().trim().min(1, messages.fullNameRequired).max(limits.fullName.max),
  currentTitle: z.string().trim().min(1, messages.titleRequired).max(limits.title.max),
  experience: z.enum(experienceBands, messages.experienceRequired),
  location: z.string().trim().min(1, messages.locationRequired).max(limits.location.max),
  linkedinUrl: linkedinUrlSchema.nullable(),
  portfolioUrl: portfolioUrlSchema.nullable(),
  skills: tagListSchema(limits.skills, 'skills'),
  salary: salarySchema.nullable(),
  noticePeriod: z.enum(noticePeriods).nullable(),
  languages: z.array(languageSchema).max(limits.languages.max),
  proof: z.array(proofItemSchema).max(limits.proofItems.max),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Per-field / per-section save on "Profile and targets". */
export const profilePatchSchema = profileInputSchema.partial();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/** Profile as returned by the api. Fields can be empty before the user confirms the parsed draft. */
export const profileSchema = z.object({
  fullName: z.string().nullable(),
  currentTitle: z.string().nullable(),
  experience: z.enum(experienceBands).nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  skills: z.array(z.string()),
  salary: salarySchema.nullable(),
  noticePeriod: z.enum(noticePeriods).nullable(),
  languages: z.array(languageSchema),
  proof: z.array(proofItemSchema.required({ id: true })),
});
export type Profile = z.infer<typeof profileSchema>;

/** Onboarding 1: links entered next to the CV dropzone. */
export const onboardingLinksInputSchema = z.object({
  linkedinUrl: linkedinUrlSchema.nullable(),
  portfolioUrl: portfolioUrlSchema.nullable(),
});
