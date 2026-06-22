import type { Context } from 'hono'
import { DocumentService } from '../services/document.js'
import type { DocumentQueryInput } from '@repo/schemas'

/**
 * Document & Knowledge Ingestion Controller
 * Coordinates API requests, extracts validated payload details, and executes ingestion management.
 */
export class DocumentController {
  public static async list(c: Context) {
    try {
      // 1. Resolve tenant context from Clerk JWT verification or development mocks
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      // 2. Retrieve validated query parameters from Hono Zod Validator middleware
      const query = (c.req as any).valid('query') as DocumentQueryInput
      const { status, page, limit } = query

      // 3. Delegate business logic query execution to service layer
      const result = await DocumentService.listDocuments({
        orgId,
        status,
        page,
        limit,
      })

      // 4. Return serialized pagination details
      c.status(200)
      return c.json(result)
    } catch (error) {
      console.error('List documents controller error:', error)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }
}
