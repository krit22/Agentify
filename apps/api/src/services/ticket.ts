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
   * Retrieves paginated database records matching orgId, ordered by creation times.
   */
  public static async listTickets(params: {
    orgId: string
    status?: 'OPEN' | 'PENDING_CUSTOMER' | 'RESOLVED'
    page: number
    limit: number
  }) {
    const { orgId, status, page, limit } = params
    const skip = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { orgId }
    if (status) {
      where.status = status
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          conversation: true,
        },
      }),
      prisma.ticket.count({ where }),
    ])

    return {
      tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * Retrieves a single ticket with transcript.
   */
  public static async getTicketDetail(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        orgId,
      },
      include: {
        conversation: true,
      },
    })

    if (!ticket) {
      throw new Error(`Ticket with ID ${ticketId} not found or does not belong to this organization.`)
    }

    return ticket
  }

  /**
   * Appends support rep response, flips status to PENDING_CUSTOMER, and emails client via Resend.
   */
  public static async replyTicket(orgId: string, ticketId: string, message: string) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        orgId,
      },
      include: {
        conversation: true,
      },
    })

    if (!ticket) {
      throw new Error(`Ticket with ID ${ticketId} not found or does not belong to this organization.`)
    }

    const conversation = ticket.conversation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let transcript: any[] = []
    if (conversation.transcript && typeof conversation.transcript === 'object') {
      if (Array.isArray(conversation.transcript)) {
        transcript = [...conversation.transcript]
      }
    } else if (typeof conversation.transcript === 'string') {
      try {
        transcript = JSON.parse(conversation.transcript)
      } catch {
        transcript = []
      }
    }

    transcript.push({ role: 'assistant', content: message })

    // Update ticket status to PENDING_CUSTOMER and conversation transcript
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'PENDING_CUSTOMER',
        conversation: {
          update: {
            transcript: transcript,
          },
        },
      },
      include: {
        conversation: true,
      },
    })

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Aegis Support <support@inbound.aegis.ai>',
            to: ticket.userContact,
            subject: `Re: [Aegis Support] ${ticket.userSummary.slice(0, 50)}...`,
            text: message,
            reply_to: `${ticket.id}@inbound.aegis.ai`,
          }),
        })
        if (!emailResponse.ok) {
          const errorText = await emailResponse.text()
          console.error('Failed to send email via Resend API:', errorText)
        }
      } catch (e) {
        console.error('Failed to send email via Resend API due to connection error:', e)
      }
    } else {
      console.warn('RESEND_API_KEY is not configured. Email notification skipped.')
    }

    return updatedTicket
  }

  /**
   * Evaluates ticket dialog transcript via OpenRouter and suggests a resolved Q&A layout.
   */
  public static async suggestResolution(orgId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        orgId,
      },
      include: {
        conversation: true,
      },
    })

    if (!ticket) {
      throw new Error(`Ticket with ID ${ticketId} not found or does not belong to this organization.`)
    }

    const conversation = ticket.conversation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let transcript: any[] = []
    if (conversation.transcript && typeof conversation.transcript === 'object') {
      if (Array.isArray(conversation.transcript)) {
        transcript = conversation.transcript
      }
    } else if (typeof conversation.transcript === 'string') {
      try {
        transcript = JSON.parse(conversation.transcript)
      } catch {
        transcript = []
      }
    }

    // Default fallback values
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUserMsg = transcript.filter((m: any) => m.role === 'user').pop()?.content || ticket.userSummary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAssistantMsg = transcript.filter((m: any) => m.role === 'assistant').pop()?.content || ''
    
    let suggestedQuestion = lastUserMsg
    let suggestedAnswer = lastAssistantMsg

    const apiKey = process.env.OPENROUTER_API_KEY
    const isE2e = process.env.IS_E2E_TEST === 'true'
    if (apiKey && !isE2e) {
      try {
        const transcriptText = transcript
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((m: any) => `${m.role === 'user' ? 'Client' : 'Support Rep'}: ${m.content}`)
          .join('\n')

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://aegis.ai',
            'X-Title': 'Aegis AI',
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
              {
                role: 'system',
                content: `Identify the user's main resolved question and compile the responder's approved solution. Return STRICTLY as a JSON object matching this schema: { "suggestedQuestion": string, "suggestedAnswer": string }`
              },
              {
                role: 'user',
                content: `Conversation transcript:\n${transcriptText}\n\nTicket Summary: ${ticket.userSummary}`
              }
            ],
            response_format: { type: 'json_object' }
          }),
        })

        if (response.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resBody: any = await response.json()
          const text = resBody.choices?.[0]?.message?.content
          if (text) {
            const parsed = JSON.parse(text)
            if (parsed.suggestedQuestion && parsed.suggestedAnswer) {
              suggestedQuestion = parsed.suggestedQuestion
              suggestedAnswer = parsed.suggestedAnswer
            }
          }
        } else {
          console.error('OpenRouter suggest resolution request failed:', await response.text())
        }
      } catch (e) {
        console.error('Error calling OpenRouter for suggestion:', e)
      }
    } else {
      console.warn('OPENROUTER_API_KEY is not defined. Using conversation fallback for suggested Q&A.')
    }

    return {
      ticketId,
      suggestedQuestion,
      suggestedAnswer,
    }
  }

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
