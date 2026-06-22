import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { orgSettingsUpdateSchema, widgetConfigUpdateSchema } from '@repo/schemas'
import { SettingsController } from '../controllers/settings.js'
import { clerkAuthMiddleware } from '../middlewares/auth.js'
import type { AppEnv } from '../types/index.js'

export const settingsUpdateSchema = z.object({
  settings: orgSettingsUpdateSchema.partial().optional(),
  widgetConfig: widgetConfigUpdateSchema.partial().optional(),
})

const settingsRouter = new Hono<AppEnv>()

// GET /api/orgs/settings
// Retrieve active settings and widget configuration profiles for tenant organization.
settingsRouter.get(
  '/', 
  clerkAuthMiddleware(), 
  SettingsController.get
)

// PATCH /api/orgs/settings
// Atomically update specific organization settings or widget configuration attributes.
settingsRouter.patch(
  '/', 
  clerkAuthMiddleware(), 
  zValidator('json', settingsUpdateSchema), 
  SettingsController.update
)

export default settingsRouter
