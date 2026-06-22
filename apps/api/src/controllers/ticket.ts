import type { Context } from 'hono'
import { TicketService } from '../services/ticket.js'
import type { TicketHarvestInput, TicketQueryInput, TicketReplyInput } from '@repo/schemas'

/**
 * Ticket & Inbox Operations Controller
 * Manages ticket state changes, support responses, and knowledge harvesting workflows.
 */
export class TicketController {
  /**
   * List paginated tickets for the organization.
   */
  public static async list(c: Context) {
    try {
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      const query = c.req.valid('query' as never) as TicketQueryInput
      const { status, page, limit } = query

      const result = await TicketService.listTickets({
        orgId,
        status,
        page,
        limit,
      })

      c.status(200)
      return c.json(result)
    } catch (err) {
      console.error('List tickets controller error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * Get detail for a single ticket.
   */
  public static async detail(c: Context) {
    try {
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      const ticketId = c.req.param('ticketId')
      if (!ticketId) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing ticket identification parameter.' })
      }

      const result = await TicketService.getTicketDetail(orgId, ticketId)

      c.status(200)
      return c.json(result)
    } catch (err) {
      console.error('Detail ticket controller error:', err)
      const error = err as Error

      if (error.message.includes('not found')) {
        c.status(404)
        return c.json({ error: error.message })
      }

      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * Sends a support reply to the user.
   */
  public static async reply(c: Context) {
    try {
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      const ticketId = c.req.param('ticketId')
      if (!ticketId) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing ticket identification parameter.' })
      }

      const body = c.req.valid('json' as never) as TicketReplyInput
      const { message } = body

      const result = await TicketService.replyTicket(orgId, ticketId, message)

      c.status(200)
      return c.json(result)
    } catch (err) {
      console.error('Reply ticket controller error:', err)
      const error = err as Error

      if (error.message.includes('not found')) {
        c.status(404)
        return c.json({ error: error.message })
      }

      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * Request suggested resolution summary for a ticket.
   */
  public static async resolve(c: Context) {
    try {
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      const ticketId = c.req.param('ticketId')
      if (!ticketId) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing ticket identification parameter.' })
      }

      const result = await TicketService.suggestResolution(orgId, ticketId)

      c.status(200)
      return c.json(result)
    } catch (err) {
      console.error('Resolve ticket controller error:', err)
      const error = err as Error

      if (error.message.includes('not found')) {
        c.status(404)
        return c.json({ error: error.message })
      }

      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * Harvests ticket resolved information and optionally triggers closed-loop layout ingestion.
   */
  public static async harvest(c: Context) {
    try {
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      const ticketId = c.req.param('ticketId')
      if (!ticketId) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing ticket identification parameter.' })
      }

      const body = c.req.valid('json' as never) as TicketHarvestInput
      const { publish, question, answer } = body

      const result = await TicketService.harvestTicket({
        orgId,
        ticketId,
        publish,
        question,
        answer,
      })

      c.status(200)
      return c.json(result)
    } catch (err) {
      console.error('Harvest ticket controller error:', err)
      const error = err as Error

      if (error.message.includes('not found') || error.message.includes('does not belong')) {
        c.status(404)
        return c.json({ error: error.message })
      }

      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred during harvesting.' })
    }
  }
}
