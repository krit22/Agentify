import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { syncTenantRequestSchema } from '@repo/schemas'
import { AuthController } from '../controllers/auth.js'
import { clerkAuthMiddleware } from '../middlewares/auth.js'
import type { AppEnv } from '../types/index.js'

const authRouter = new Hono<AppEnv>()

// Mount POST /api/auth/sync
authRouter.post(
  '/sync',
  clerkAuthMiddleware(),
  zValidator('json', syncTenantRequestSchema),
  AuthController.sync
)

export default authRouter
