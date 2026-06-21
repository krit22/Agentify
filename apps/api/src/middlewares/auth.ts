import type { MiddlewareHandler } from 'hono'
import { getAuth } from '@clerk/hono'
import type { AppEnv } from '../types/index.js'

/**
 * Clerk Authentication Middleware
 * Validates request authentication, extracts Clerk organization ID, user ID, and roles,
 * and binds them to the Hono request context.
 */
export const clerkAuthMiddleware = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    // 1. Development Bypass (BFF Mocking for Postman testing)
    // ONLY allowed when NODE_ENV is not production.
    if (process.env.NODE_ENV !== 'production') {
      const mockOrgId = c.req.header('x-mock-org-id')
      const mockUserId = c.req.header('x-mock-user-id')
      const mockRole = c.req.header('x-mock-role') || 'ADMIN'

      if (mockOrgId && mockUserId) {
        console.warn(
          `[SECURITY WARNING] Bypassing Clerk validation using x-mock-org-id headers. Org: ${mockOrgId}, User: ${mockUserId}`
        )
        c.set('orgId', mockOrgId)
        c.set('userId', mockUserId)
        c.set('role', mockRole)
        await next()
        return
      }
    }

    // 2. Production Clerk validation checking
    const secretKey = process.env.CLERK_SECRET_KEY
    const isClerkConfigured = secretKey && !secretKey.startsWith('sk_test_...')

    if (!isClerkConfigured) {
      if (process.env.NODE_ENV === 'production') {
        c.status(500)
        return c.json({ error: 'Clerk configuration is missing. Authentication failed close.' })
      } else {
        c.status(401)
        return c.json({
          error: 'Authentication required. Please configure CLERK_SECRET_KEY in your env or pass x-mock-org-id and x-mock-user-id headers in Postman.',
        })
      }
    }

    // Retrieve active auth object injected by Clerk Middleware
    const auth = getAuth(c)
    if (!auth || !auth.userId) {
      c.status(401)
      return c.json({ error: 'Unauthorized: Missing or invalid credentials.' })
    }

    const orgId = auth.orgId
    if (!orgId) {
      c.status(403)
      return c.json({
        error: 'Forbidden: Active organization context is required. Please set organization context in Clerk.',
      })
    }

    c.set('orgId', orgId)
    c.set('userId', auth.userId)
    c.set('role', (auth.orgRole as string) || 'SUPPORT_REPRESENTATIVE')

    await next()
  }
}
