import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { documentQuerySchema } from '@repo/schemas'
import { DocumentController } from '../controllers/document.js'
import { clerkAuthMiddleware } from '../middlewares/auth.js'
import type { AppEnv } from '../types/index.js'

const documentRouter = new Hono<AppEnv>()

// GET /api/orgs/documents
// Enforces JWT validation or development BFF mocks, parses query strings, and routes to controller
documentRouter.get(
  '/',
  clerkAuthMiddleware(),
  zValidator('query', documentQuerySchema),
  DocumentController.list
)

// POST /api/orgs/documents
// Enforces JWT validation and uploads file to Supabase Storage and enqueues BullMQ layout parsing
documentRouter.post(
  '/',
  clerkAuthMiddleware(),
  DocumentController.upload
)

// DELETE /api/orgs/documents/:docId
// Enforces JWT validation and enqueues a background deletion job
documentRouter.delete(
  '/:docId',
  clerkAuthMiddleware(),
  DocumentController.delete
)

export default documentRouter
