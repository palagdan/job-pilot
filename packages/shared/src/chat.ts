import { z } from 'zod';
import { dateTimeSchema, idSchema } from './common.ts';
import { chatRoles, chatScreens } from './enums.ts';
import { limits, messages } from './limits.ts';

export const chatContextSchema = z.object({
  screen: z.enum(chatScreens),
  opportunityId: idSchema.optional(),
  pipelineItemId: idSchema.optional(),
  draftId: idSchema.optional(),
  cvId: idSchema.optional(),
});
export type ChatContext = z.infer<typeof chatContextSchema>;

export const sendChatMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(limits.chatMessage.max, messages.chatTooLong),
  context: chatContextSchema,
});

/** A structured change made by chat, shown in the form with Undo. */
export const chatAppliedChangeSchema = z.object({
  activityId: idSchema,
  /** '"adtech" added to exclusions' */
  summary: z.string(),
  undone: z.boolean(),
});

export const chatMessageSchema = z.object({
  id: idSchema,
  role: z.enum(chatRoles).exclude(['tool']),
  content: z.string(),
  appliedChanges: z.array(chatAppliedChangeSchema),
  createdAt: dateTimeSchema,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatThreadSchema = z.object({
  messages: z.array(chatMessageSchema),
  suggestions: z.array(z.string()),
});
