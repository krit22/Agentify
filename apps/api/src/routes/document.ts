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

export default documentRouter
