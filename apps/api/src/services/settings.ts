import { prisma, pinecone } from '@repo/db'
import { StorageService } from './storage.js'
import path from 'path'

export interface UpdateSettingsParams {
  settings?: {
    vectorScoreThreshold?: number
    defaultTicketUrgency?: 'low' | 'med' | 'high'
    escalationSLAHours?: number
  }
  widgetConfig?: {
    brandColor?: string
    logoUrl?: string | null
    widgetPosition?: 'left' | 'right'
    greetingMessage?: string
    allowedDomains?: string[]
  }
}

export class SettingsService {
  /**
   * Retrieves styling configuration and tenant SLA settings.
   */
  public static async getSettings(orgId: string) {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        settings: true,
        widgetConfig: true,
      },
    })

    if (!organization) {
      throw new Error(`Organization tenant ${orgId} not found in database.`)
    }

    return {
      orgId,
      settings: organization.settings,
      widgetConfig: organization.widgetConfig,
    }
  }

  /**
   * Updates organization settings and widget configurations atomically in a transaction.
   */
  public static async updateSettings(orgId: string, params: UpdateSettingsParams) {
    const { settings, widgetConfig } = params

    // Confirm that the organization exists first
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!organization) {
      throw new Error(`Organization tenant ${orgId} not found in database.`)
    }

    await prisma.$transaction(async (tx) => {
      if (settings && Object.keys(settings).length > 0) {
        await tx.orgSettings.update({
          where: { orgId },
          data: settings,
        })
      }

      if (widgetConfig && Object.keys(widgetConfig).length > 0) {
        await tx.widgetConfig.update({
          where: { orgId },
          data: widgetConfig,
        })
      }
    })

    return this.getSettings(orgId)
  }

  /**
   * Clears the entire knowledge base for the tenant organization:
   * 1. Fetches all documents to resolve filenames.
   * 2. Deletes raw document assets from Supabase Storage.
   * 3. Purges all vector embeddings from the Pinecone namespace.
   * 4. Deletes Document records in PostgreSQL (cascade deletes chunks).
   */
  public static async clearKnowledgeBase(orgId: string): Promise<{ remainingDbDocs: number; remainingVectors: number }> {
    // 1. Fetch documents under the organization
    const documents = await prisma.document.findMany({
      where: { orgId },
      select: { id: true, title: true }
    })

    if (documents.length > 0) {
      // 2. Resolve filenames and delete from Supabase storage
      const fileNames = documents.map((doc) => {
        const ext = path.extname(doc.title).toLowerCase()
        return `${doc.id}${ext}`
      })
      await StorageService.deleteFiles(fileNames)
    }

    // 3. Purge Pinecone vector namespace
    const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
    const index = pinecone.Index(indexName)
    try {
      await index.namespace(orgId).deleteAll()
    } catch (pineconeError: any) {
      console.error('[SETTINGS SERVICE WARNING] Pinecone namespace delete failed:', pineconeError.message)
    }

    // 4. Delete PostgreSQL Document records (cascade drops DocumentChunk rows)
    await prisma.document.deleteMany({
      where: { orgId }
    })

    // 5. Query remaining counts
    const remainingDbDocs = await prisma.document.count({
      where: { orgId }
    })

    let remainingVectors = 0
    try {
      const stats = await index.describeIndexStats()
      remainingVectors = stats.namespaces?.[orgId]?.recordCount || 0
    } catch (err: any) {
      console.error('[SETTINGS SERVICE WARNING] Failed to retrieve index stats:', err.message)
    }

    return {
      remainingDbDocs,
      remainingVectors
    }
  }
}
