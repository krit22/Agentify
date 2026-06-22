import { prisma } from '@repo/db'
import type { IngestionStatus } from '@repo/db'

export interface ListDocumentsParams {
  orgId: string
  status?: IngestionStatus
  page: number
  limit: number
}

export interface ListDocumentsResult {
  documents: Array<{
    id: string
    title: string
    sourceUrl: string | null
    status: IngestionStatus
    fileSize: number
    version: number
    createdAt: Date
    updatedAt: Date
  }>
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
  }
}

/**
 * Document Ingestion & Storage Management Service
 * Manages database states and orchestrates file uploads & Pinecone deletion tasks.
 */
export class DocumentService {
  public static async listDocuments(params: ListDocumentsParams): Promise<ListDocumentsResult> {
    const { orgId, status, page, limit } = params

    // 1. Calculate query pagination bounds
    const skip = (page - 1) * limit
    const take = limit

    // 2. Query documents matching target tenant organization and criteria under transaction boundaries
    const [documents, totalCount] = await prisma.$transaction([
      prisma.document.findMany({
        where: {
          orgId,
          status: status || undefined,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      prisma.document.count({
        where: {
          orgId,
          status: status || undefined,
        },
      }),
    ])

    // 3. Compute structural details
    const totalPages = Math.ceil(totalCount / limit)

    return {
      documents,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    }
  }
}
