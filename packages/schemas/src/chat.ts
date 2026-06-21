import { z } from 'zod'

/**
 * --- CHAT & CONVERSATION SCHEMAS ---
 * Purpose: Validates chat payloads originating from the public-facing Preact widget, 
 * session token boundaries, and structured LLM chat histories (transcripts).
 */

// Schema representing a single message within the conversation history
export const coreMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content cannot be empty'),
})
export type CoreMessage = z.infer<typeof coreMessageSchema>

// Schema representing the array of messages representing a full session transcript
export const conversationTranscriptSchema = z.array(coreMessageSchema)
export type ConversationTranscript = z.infer<typeof conversationTranscriptSchema>

// Incoming widget chat request schema
export const widgetChatRequestSchema = z.object({
  orgId: z.string().uuid('Organization ID must be a valid UUID'),
  sessionId: z.string().uuid('Session ID must be a valid UUID'),
  message: z.string().min(1, 'Message query cannot be empty').max(2000),
})
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>
