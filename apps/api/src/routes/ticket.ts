import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ticketHarvestSchema, ticketQuerySchema, ticketReplySchema } from '@repo/schemas'
import { TicketController } from '../controllers/ticket.js'
import { clerkAuthMiddleware } from '../middlewares/auth.js'
import type { AppEnv } from '../types/index.js'

const ticketRouter = new Hono<AppEnv>()

// GET /api/orgs/tickets
// List paginated tickets for the organization
ticketRouter.get(
  '/',
  clerkAuthMiddleware(),
  zValidator('query', ticketQuerySchema),
  TicketController.list
)

// GET /api/orgs/tickets/:ticketId
// Retrieve details and conversation transcript for a ticket
ticketRouter.get(
  '/:ticketId',
  clerkAuthMiddleware(),
  TicketController.detail
)

// POST /api/orgs/tickets/:ticketId/reply
// Sends a support reply to the user via Resend and appends to transcript
ticketRouter.post(
  '/:ticketId/reply',
  clerkAuthMiddleware(),
  zValidator('json', ticketReplySchema),
  TicketController.reply
)

// POST /api/orgs/tickets/:ticketId/resolve
// Request suggested resolution summary (Q&A) generated from transcript
ticketRouter.post(
  '/:ticketId/resolve',
  clerkAuthMiddleware(),
  TicketController.resolve
)

// POST /api/orgs/tickets/:ticketId/harvest
// Closes ticket, logs Q&A, and optionally pushes synthetic QA document to ingestion pipeline
ticketRouter.post(
  '/:ticketId/harvest',
  clerkAuthMiddleware(),
  zValidator('json', ticketHarvestSchema),
  TicketController.harvest
)

export default ticketRouter
