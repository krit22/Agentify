import { Hono } from 'hono'
import { WebhookController } from '../controllers/webhook.js'
import type { AppEnv } from '../types/index.js'

const webhookRouter = new Hono<AppEnv>()

// POST /api/webhooks/inbound-email
// Public endpoint for Resend inbound email webhook parser updates
webhookRouter.post('/inbound-email', WebhookController.inboundEmail)

export default webhookRouter
