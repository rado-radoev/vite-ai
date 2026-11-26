import { z } from 'zod';

export const MAX_MESSAGES = 31;
export const MAX_MESSAGE_LENGTH = 8_000;
export const MAX_REQUEST_BYTES = 128 * 1024;

export const chatMessageSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH).refine((text) => text.trim().length > 0, 'Content must not be blank'),
});

export const chatRequestSchema = z.strictObject({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  sessionId: z.uuid().min(36),
}).superRefine(({ messages }, ctx) => {
  if (messages.length % 2 !== 1 || messages.some((message, index) => message.role !== (index % 2 === 0 ? 'user' : 'assistant'))) {
    ctx.addIssue({ code: 'custom', path: ['messages'], message: 'History must alternate roles, starting and ending with user' });
  }
});

export const chatResponseSchema = z.object({
  reply: z.string().min(1).refine((text) => text.trim().length > 0, 'Reply must not be blank'),
});

export const chatErrorSchema = z.object({ error: z.string().min(1) });

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatError = z.infer<typeof chatErrorSchema>;
