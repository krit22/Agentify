import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { widgetChatRequestSchema, ticketEscalationSchema } from '@repo/schemas'
import { WidgetController } from '../controllers/widget.js'
import type { AppEnv } from '../types/index.js'

const widgetRouter = new Hono<AppEnv>()

// POST /api/widget/chat
// Public chat interface endpoint executing similarity gates, embeddings, and SSE streaming responses
widgetRouter.post(
  '/chat',
  zValidator('json', widgetChatRequestSchema),
  WidgetController.chat
)

// POST /api/widget/escalate
// Public chat escalation interface converting live conversation context into an open ticket
widgetRouter.post(
  '/escalate',
  zValidator('json', ticketEscalationSchema),
  WidgetController.escalate
)

export default widgetRouter
