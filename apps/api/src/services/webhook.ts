import { prisma } from '@repo/db'

export class WebhookService {
  /**
   * Processes inbound email webhook from Resend, reopens the ticket, and appends the reply message to conversation transcript.
   */
  public static async processInboundEmail(payload: {
    from: string
    to: string
    subject: string
    text?: string
    html?: string
  }) {
    const { from, to, subject, text, html } = payload

    console.log(`[WEBHOOK] Processing inbound email. To: ${to}, From: ${from}, Subject: ${subject}`)

    // 1. Extract ticketId (UUIDv4) from the "to" field
    const match = to.match(/([a-fA-F0-9-]{36})@inbound\.aegis\.ai/)
    if (!match) {
      console.warn(`[WEBHOOK] Inbound email destination '${to}' did not match ticket UUID pattern. Skipping.`)
      return { success: false, reason: 'Destination email did not match ticket UUID pattern.' }
    }

    const ticketId = match[1]

    // 2. Retrieve ticket and conversation
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { conversation: true },
    })

    if (!ticket) {
      console.warn(`[WEBHOOK] Ticket with ID ${ticketId} not found. Skipping.`)
      return { success: false, reason: `Ticket with ID ${ticketId} not found.` }
    }

    // 3. Append reply to conversation transcript
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

    // Prefer text content, fall back to html, then default message
    const parsedText = text || html || '(Empty message body)'

    transcript.push({
      role: 'user',
      content: parsedText,
    })

    // 4. Update conversation transcript and reopen ticket
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        conversation: {
          update: {
            transcript: transcript,
          },
        },
      },
    })

    console.log(`[WEBHOOK] Successfully appended email reply to ticket ${ticketId} and marked status as OPEN.`)
    return { success: true, ticketId }
  }
}
