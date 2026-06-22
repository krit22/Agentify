import { Context } from 'hono'
import { AuthService } from '../services/auth.js'

/**
 * Authentication & Tenant Synchronization Controller
 * Orchestrates sign-up/sign-in syncing and serializes database configurations.
 */
export class AuthController {
  public static async sync(c: Context) {
    try {
      // 1. Get validated payload and extracted context parameters
      const orgId = c.get('orgId')
      const userId = c.get('userId')
      
      const body = c.req.valid('json' as never) as { orgName?: string }
      const orgName = body.orgName || 'My Organization'

      if (!orgId || !userId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant credentials.' })
      }

      // 2. Trigger the tenant sync in the database
      const result = await AuthService.syncTenant(orgId, orgName)

      // 3. Serialize BigInt properties safely before outputting JSON (to prevent serialization errors)
      const serializedOrg = {
        ...result.organization,
        billingUsage: result.organization.billingUsage
          ? {
              ...result.organization.billingUsage,
              storageBytes: result.organization.billingUsage.storageBytes.toString(),
              tokensConsumed: result.organization.billingUsage.tokensConsumed.toString(),
            }
          : null,
      }

      c.status(result.isNew ? 201 : 200) // 201 Created for new tenant, 200 OK for existing
      return c.json({
        message: result.isNew ? 'Tenant initialized successfully.' : 'Tenant is synchronized.',
        isNew: result.isNew,
        organization: serializedOrg,
      })
    } catch (error) {
      console.error('Auth sync controller failure:', error)
      c.status(500)
      return c.json({ error: 'Failed to synchronize organization credentials.' })
    }
  }
}
