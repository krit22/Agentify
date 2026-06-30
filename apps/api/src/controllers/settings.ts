import type { Context } from 'hono'
import { SettingsService } from '../services/settings.js'

/**
 * Tenant Customization & Configuration Controller
 * Coordinates retrieving and modifying organization settings and widget branding.
 */
export class SettingsController {
  public static async get(c: Context) {
    try {
      // 1. Resolve tenant context from Clerk JWT verification or development mocks
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      // 2. Delegate retrieval query execution to SettingsService
      const result = await SettingsService.getSettings(orgId)

      c.status(200)
      return c.json(result)
    } catch (error) {
      console.error('Get settings controller error:', error)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  public static async update(c: Context) {
    try {
      // 1. Resolve tenant context from Clerk JWT verification or development mocks
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      // 2. Extract validated settings update options
      const body = c.req.valid('json' as never)

      // 3. Delegate transaction updates execution to SettingsService
      const result = await SettingsService.updateSettings(orgId, body)

      c.status(200)
      return c.json(result)
    } catch (error) {
      console.error('Update settings controller error:', error)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred during customization updates.' })
    }
  }

  public static async clearKnowledgeBase(c: Context) {
    try {
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      const stats = await SettingsService.clearKnowledgeBase(orgId)

      c.status(200)
      return c.json({
        message: 'Knowledge base cleared successfully.',
        remainingDbDocs: stats.remainingDbDocs,
        remainingVectors: stats.remainingVectors
      })
    } catch (error) {
      console.error('Clear knowledge base controller error:', error)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred while clearing the knowledge base.' })
    }
  }
}
