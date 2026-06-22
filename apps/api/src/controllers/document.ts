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

  public static async upload(c: Context) {
    try {
      // 1. Resolve tenant context from Clerk JWT verification or development mocks
      const orgId = c.get('orgId')
      if (!orgId) {
        c.status(401)
        return c.json({ error: 'Unauthorized: Missing tenant context.' })
      }

      // 2. Parse Hono multipart form-data body
      const body = await c.req.parseBody()
      const file = body['file']

      if (!file || !(file instanceof File)) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing or invalid file upload payload.' })
      }

      // 3. Delegate file parsing, DB registry, and queue enqueueing to DocumentService
      const result = await DocumentService.createDocument({
        orgId,
        file,
      })

      // 4. Return 202 Accepted status for background tasks processing
      c.status(202)
      return c.json({
        documentId: result.id,
        status: result.status,
      })
    } catch (error: any) {
      console.error('Upload document controller error:', error)
      
      // Handle known validation errors from saveFile or service
      if (
        error.message.includes('exceeds') ||
        error.message.includes('Unsupported') ||
        error.message.includes('traversal')
      ) {
        c.status(400)
        return c.json({ error: error.message })
      }

      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred during upload.' })
    }
  }
}

