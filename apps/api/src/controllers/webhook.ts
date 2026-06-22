import type { Context } from 'hono'
import { WebhookService } from '../services/webhook.js'

export class WebhookController {
  /**
   * Public callback endpoint processing inbound email parser updates from Resend.
   */
  public static async inboundEmail(c: Context) {
    try {
      const body = await c.req.json()
      
      const { from, to, subject, text, html } = body
      if (!from || !to || !subject) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing required webhook fields (from, to, subject).' })
      }

      const result = await WebhookService.processInboundEmail({
        from,
        to,
        subject,
        text,
        html,
      })

      if (!result.success) {
        c.status(202)
        return c.json({ error: result.reason })
      }

      c.status(200)
      return c.json({ message: 'Inbound email parsed and appended to ticket successfully.', ticketId: result.ticketId })
    } catch (err) {
      console.error('Webhook inbound email controller error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }
}
