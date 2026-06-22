import { prisma } from '@repo/db'
import { ParserService } from './parser.js'
import { ChunkerService } from './chunker.js'
import { VectorService } from './vector.js'
import { createClient } from '@supabase/supabase-js'
import path from 'path'

let supabaseClient: any = null

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Supabase Storage is not configured in worker environment. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  })
  return supabaseClient
}

export class IngestionService {
  /**
   * Processes a document ingestion queue task end-to-end.
   */
  public static async processJob(data: {
    documentId: string
    orgId: string
    fileUrl: string
    fileName: string
  }): Promise<void> {
    const { documentId, orgId, fileUrl, fileName } = data

    console.log(`[INGESTION] Starting layout parsing pipeline for document: ${documentId}`)

    // 1. Fetch document metadata and verify its existence
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    })

    if (!document) {
      console.warn(`[INGESTION] Aborting: Document ${documentId} not found in database.`)
      return
    }

    try {
      // 2. Transition status to EXTRACTING (Fetching layouts from Unstructured.io)
      console.log('[INGESTION] State transition: QUEUED -> EXTRACTING')
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'EXTRACTING' },
      })

      const elements = await ParserService.partitionFile(fileUrl, fileName)

      // 3. Transition status to EMBEDDING (Chunking and Vectorizing via OpenRouter)
      console.log('[INGESTION] State transition: EXTRACTING -> EMBEDDING')
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'EMBEDDING' },
      })

      const chunks = ChunkerService.chunkElements(elements)
      console.log(`[INGESTION] Generated ${chunks.length} chunks from document layouts.`)

      const indexedChunks = await VectorService.upsertChunks(orgId, documentId, chunks)

      // 4. Save chunk records and transition state to READY in a database transaction
      console.log('[INGESTION] Saving chunks to PostgreSQL and setting state to READY...')
      await prisma.$transaction(async (tx) => {
        if (indexedChunks.length > 0) {
          await tx.documentChunk.createMany({
            data: indexedChunks.map((chunk) => ({
              id: chunk.id,
              documentId: documentId,
              pageNumber: chunk.pageNumber,
              sectionHeader: chunk.sectionHeader,
              rawContent: chunk.rawContent,
              vectorId: chunk.vectorId,
            })),
          })
        }

        await tx.document.update({
          where: { id: documentId },
          data: { status: 'READY' },
        })
      })

      console.log(`[INGESTION] Document ${documentId} ingestion completed successfully.`)
    } catch (error: any) {
      console.error(`[INGESTION ERROR] Ingestion failed for document ${documentId}:`, error)

      // Transition document state to FAILED and record error details
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          errorMessage: error.message || String(error),
        },
      }).catch((dbErr) => {
        console.error('[INGESTION ERROR] Failed to update document failure state:', dbErr)
      })

      // Rethrow to let BullMQ trigger attempt retries
      throw error
    }
  }

  /**
   * Processes a document deletion and vector purge queue task.
   */
  public static async processDeletion(data: {
    documentId: string
    orgId: string
  }): Promise<void> {
    const { documentId, orgId } = data
    const indexName = process.env.PINECONE_INDEX || 'aegis-ai'

    console.log(`[INGESTION] Starting deletion & cleanup pipeline for document: ${documentId}`)

    try {
      // 1. Fetch chunks from DB to get vector IDs
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId },
        select: { vectorId: true },
      })

      if (chunks.length > 0) {
        const vectorIds = chunks.map((c) => c.vectorId)
        console.log(`[INGESTION] Purging ${vectorIds.length} Pinecone vectors (namespace: ${orgId})`)
        const pinecone = (await import('@repo/db')).pinecone
        const index = pinecone.Index(indexName)
        await index.namespace(orgId).deleteMany(vectorIds)
      } else {
        console.log('[INGESTION] No document chunks found in database. Skipping Pinecone vector deletion.')
      }

      // 2. Fetch document to resolve its secure filename
      const document = await prisma.document.findUnique({
        where: { id: documentId },
      })

      if (document && document.sourceUrl) {
        // Resolve secure filename uploaded to Supabase Storage (e.g. {documentId}.{ext})
        const urlParts = document.sourceUrl.split('/')
        // Supabase signed URLs usually have a query parameter or path format.
        // Let's resolve the filename from the URL path.
        // In apps/api/src/services/storage.ts, path is: `${documentId}${ext}`
        const ext = path.extname(document.title).toLowerCase()
        const secureFilename = `${documentId}${ext}`

        console.log(`[INGESTION] Deleting raw file from Supabase Storage: ${secureFilename}`)
        const client = getSupabaseClient()
        const supabaseBucket = process.env.SUPABASE_BUCKET || 'files'
        const { error } = await client.storage.from(supabaseBucket).remove([secureFilename])

        if (error) {
          console.error(`[INGESTION WARNING] Failed to delete file from Supabase storage: ${error.message}`)
        }
      }

      // 3. Hard delete document record in PostgreSQL (Prisma onDelete: Cascade drops DocumentChunks)
      console.log('[INGESTION] Deleting Document record from PostgreSQL...')
      await prisma.document.delete({
        where: { id: documentId },
      })

      console.log(`[INGESTION] Document ${documentId} cleanup completed successfully.`)
    } catch (error) {
      console.error(`[INGESTION ERROR] Cleanup failed for document ${documentId}:`, error)
      throw error
    }
  }
}
