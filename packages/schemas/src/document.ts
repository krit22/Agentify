import { z } from 'zod'

/**
 * --- KNOWLEDGE INGESTION SCHEMAS ---
 * Purpose: Validates document uploads, ingestion statuses, parsing parameters, 
 * and custom metadata queries for text embedding.
 */

// Ingestion pipeline states
export const ingestionStatusSchema = z.enum(['QUEUED', 'EXTRACTING', 'EMBEDDING', 'READY', 'FAILED'])

// Document metadata upload schema (e.g. for post/patch validations)
export const documentUploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  sourceUrl: z.string().url('Source URL must be a valid S3/R2 storage link').nullable().optional(),
  fileSize: z.number().int().min(0, 'File size cannot be negative').default(0),
  version: z.number().int().min(1).default(1),
})
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>

// Paginated documents search query
export const documentQuerySchema = z.object({
  status: ingestionStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type DocumentQueryInput = z.infer<typeof documentQuerySchema>
