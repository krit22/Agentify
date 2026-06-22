import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ticketHarvestSchema } from '@repo/schemas'
import { TicketController } from '../controllers/ticket.js'
import { clerkAuthMiddleware } from '../middlewares/auth.js'
import type { AppEnv } from '../types/index.js'

const ticketRouter = new Hono<AppEnv>()

// POST /api/orgs/tickets/:ticketId/harvest
// Authenticates reps/admins, validates request payload, and executes closed-loop knowledge ingestion.
ticketRouter.post(
  '/:ticketId/harvest',
  clerkAuthMiddleware(),
  zValidator('json', ticketHarvestSchema),
  TicketController.harvest
)

export default ticketRouter
