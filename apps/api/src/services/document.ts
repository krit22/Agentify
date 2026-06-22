import { prisma } from '@repo/db'
import type { IngestionStatus } from '@repo/db'
import crypto from 'crypto'
import { StorageService } from './storage.js'
import { QueueService } from './queue.js'

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

  /**
   * Registers a new document upload: saves to Supabase, writes to PostgreSQL, and enqueues BullMQ processing.
   */
  public static async createDocument(params: {
    orgId: string
    file: File
  }): Promise<{ id: string; title: string; status: string }> {
    const { orgId, file } = params

    // 1. Generate unique document ID
    const documentId = crypto.randomUUID()

    // 2. Upload file to Supabase Storage and obtain signed retrieve URL
    const uploadResult = await StorageService.saveFile(file, documentId)

    // 3. Register document details in PostgreSQL database with status QUEUED
    const document = await prisma.document.create({
      data: {
        id: documentId,
        orgId,
        title: file.name,
        sourceUrl: uploadResult.fileUrl,
        status: 'QUEUED',
        fileSize: uploadResult.fileSize,
        version: 1,
      },
    })

    // 4. Enqueue background layout extraction and indexing job in BullMQ Redis Queue
    await QueueService.enqueueIngestion({
      documentId: document.id,
      orgId,
      fileUrl: uploadResult.fileUrl,
      fileName: file.name,
    })

    return {
      id: document.id,
      title: document.title,
      status: document.status,
    }
  }
}

