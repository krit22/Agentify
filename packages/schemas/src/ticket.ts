import { z } from 'zod'

/**
 * --- TICKET & INBOX MANAGEMENT SCHEMAS ---
 * Purpose: Validates ticket statuses, support team replies, inbox query filtering parameters, 
 * widget manual escalations, and Q&A harvest submissions.
 */

// Ticket status levels
export const ticketStatusSchema = z.enum(['OPEN', 'PENDING_CUSTOMER', 'RESOLVED'])

// Public widget ticket manual escalation schema
export const ticketEscalationSchema = z.object({
  orgId: z.string().min(1, 'Organization ID is required'),
  sessionId: z.string().uuid('Session ID must be a valid UUID'),
  userEmail: z.string().email('Please enter a valid email address'),
  userSummary: z.string().min(10, 'Please describe your request in at least 10 characters').max(1000),
})
export type TicketEscalationInput = z.infer<typeof ticketEscalationSchema>

// Inbox filter query parameter validator
export const ticketQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type TicketQueryInput = z.infer<typeof ticketQuerySchema>

// Reply message validation schema (sent via Resend)
export const ticketReplySchema = z.object({
  message: z.string().min(1, 'Reply message cannot be empty').max(5000),
})
export type TicketReplyInput = z.infer<typeof ticketReplySchema>

// Knowledge harvest schema (closed-loop flywheel)
export const ticketHarvestSchema = z.object({
  publish: z.boolean().default(true),
  question: z.string().min(10, 'Harvested question must be at least 10 characters long'),
  answer: z.string().min(10, 'Harvested answer must be at least 10 characters long'),
})
export type TicketHarvestInput = z.infer<typeof ticketHarvestSchema>
