import type { Context } from 'hono'
import { TicketService } from '../services/ticket.js'
import type { TicketHarvestInput } from '@repo/schemas'

/**
 * Ticket & Inbox Operations Controller
 * Manages ticket state changes, support responses, and knowledge harvesting workflows.
 */
export class TicketController {
  public static async harvest(c: Context) {
    try {
      // 1. Resolve tenant context from Clerk JWT verification or development mocks
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      // 2. Extract route path parameters
      const ticketId = c.req.param('ticketId')
      if (!ticketId) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing ticket identification parameter.' })
      }

      // 3. Retrieve validated payload fields from Hono Zod Validator middleware
      const body = c.req.valid('json') as TicketHarvestInput
      const { publish, question, answer } = body

      // 4. Delegate database resolution and queue integration to TicketService
      const result = await TicketService.harvestTicket({
        orgId,
        ticketId,
        publish,
        question,
        answer,
      })

      c.status(200)
      return c.json(result)
    } catch (error) {
      console.error('Harvest ticket controller error:', error)

      if (error.message.includes('not found') || error.message.includes('does not belong')) {
        c.status(404)
        return c.json({ error: error.message })
      }

      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred during harvesting.' })
    }
  }
}
