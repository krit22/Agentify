import { prisma } from '@repo/db'
import { StorageService } from './storage.js'
import { QueueService } from './queue.js'
import crypto from 'crypto'

export interface HarvestTicketParams {
  orgId: string
  ticketId: string
  publish: boolean
  question: string
  answer: string
}

export class TicketService {
  /**
   * Resolves a support ticket, logs harvested Q&A, and triggers layout ingestion if publish is enabled.
   */
  public static async harvestTicket(params: HarvestTicketParams) {
    const { orgId, ticketId, publish, question, answer } = params

    // 1. Verify that the ticket exists and belongs to the requested organization
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        orgId,
      },
    })

    if (!ticket) {
      throw new Error(`Ticket with ID ${ticketId} not found or does not belong to this organization.`)
    }

    const now = new Date()

    // 2. Perform ticket updates and document creations within a prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // Resolve ticket status and log harvester fields
      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
          harvestedQ: question,
          harvestedA: answer,
          harvestedAt: now,
        },
      })

      let documentInfo = null

      if (publish) {
        // Construct synthetic markdown layout text block
        const markdownText = `# ${question}\n\n${answer}`
        const documentId = crypto.randomUUID()
        const title = `synthetic_qa_${ticketId}.md`

        // Construct standard File representation in Node
        const file = new File([markdownText], title, { type: 'text/markdown' })

        // Save synthetic file to storage
        const uploadResult = await StorageService.saveFile(file, documentId)

        // Create document record in database in QUEUED state
        const document = await tx.document.create({
          data: {
            id: documentId,
            orgId,
            title,
            sourceUrl: uploadResult.fileUrl,
            status: 'QUEUED',
            fileSize: uploadResult.fileSize,
            version: 1,
          },
        })

        documentInfo = {
          id: document.id,
          title: document.title,
          status: document.status,
          sourceUrl: document.sourceUrl,
        }
      }

      return {
        ticket: updatedTicket,
        document: documentInfo,
      }
    })

    // 3. Enqueue background ingestion processing job in BullMQ (outside the db transaction)
    if (publish && result.document && result.document.sourceUrl) {
      await QueueService.enqueueIngestion({
        documentId: result.document.id,
        orgId,
        fileUrl: result.document.sourceUrl,
        fileName: result.document.title,
      })
    }

    return {
      ticketId: result.ticket.id,
      status: result.ticket.status,
      published: publish,
      documentId: result.document?.id || null,
      documentStatus: result.document?.status || null,
    }
  }
}
