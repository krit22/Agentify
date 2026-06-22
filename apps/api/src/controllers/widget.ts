import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { prisma } from '@repo/db'
import { WidgetService } from '../services/widget.js'
import type { WidgetChatRequest, TicketEscalationInput } from '@repo/schemas'

export class WidgetController {
  /**
   * SSE Stream powering live AI support responses with Score-based Doubt Gate checking.
   */
  public static async chat(c: Context) {
    try {
      const body = c.req.valid('json' as never) as WidgetChatRequest
      const { orgId, sessionId, message } = body

      // 1. Verify Origin
      const origin = c.req.header('Origin')
      const referer = c.req.header('Referer')
      const originOk = await WidgetService.verifyOrigin(orgId, origin, referer)
      if (!originOk) {
        c.status(403)
        return c.json({ error: 'Forbidden: Origin is not permitted.' })
      }

      // 2. Redis Rate Limiting
      const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
      const rateLimitOk = await WidgetService.checkRateLimit(ip)
      if (!rateLimitOk) {
        c.status(429)
        return c.json({ error: 'Too Many Requests: Rate limit exceeded.' })
      }

      // 3. Settings vector threshold query
      const settings = await prisma.orgSettings.findUnique({
        where: { orgId }
      })
      const threshold = settings?.vectorScoreThreshold ?? 0.74

      // 4. Retrieve conversation transcript history
      let conversation = await prisma.conversation.findFirst({
        where: { orgId, sessionId }
      })
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { orgId, sessionId, transcript: [] }
        })
      }

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

      // 5. Query Pinecone
      const matches = await WidgetService.queryPinecone(orgId, message)
      const topScore = matches[0]?.score || 0
      const escalateForced = topScore < threshold

      // Compile system instructions & messages list
      const systemPrompt = `You are Aegis AI, the automated support agent for this organization.
Use the provided knowledge base context to answer the user query accurately and concisely.

${escalateForced 
  ? "CRITICAL: The knowledge base match score is too low. You DO NOT have enough trusted information to answer this request. You MUST politely state that you don't know the answer or can't find it in the knowledge base, and politely ask if they would like to escalate the conversation to a human support agent." 
  : "If the provided context does not contain the answer, or if you are unsure, politely explain that you do not have that information and ask the user if they would like to escalate the conversation to a human support agent."
}

Context Chunks:
${matches.length > 0 
  ? matches.map((m, i) => `[Chunk ${i+1}] (Score: ${m.score.toFixed(3)}, Header: ${m.sectionHeader || 'General'}):\n${m.content}`).join('\n\n')
  : 'No context matches found.'
}`

      const messages = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...transcript.map((t: any) => ({ role: t.role, content: t.content })),
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]

      const apiKey = process.env.OPENROUTER_API_KEY

      // Pre-save user message to transcript (outside transaction)
      const updatedUserTranscript = [...transcript, { role: 'user', content: message }]
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { transcript: updatedUserTranscript }
      })

      // Return SSE response stream
      return streamSSE(c, async (stream) => {
        let fullReply = ''

        if (!apiKey) {
          // Stream a mock response if API Key is not configured
          const mockText = `[MOCK REPLY] Top score: ${topScore.toFixed(3)} (threshold: ${threshold}). Forced escalation: ${escalateForced ? 'YES' : 'NO'}. Matches found: ${matches.length}.`
          const words = mockText.split(' ')
          for (const word of words) {
            fullReply += word + ' '
            await stream.writeSSE({
              data: JSON.stringify({ text: word + ' ' }),
              event: 'message',
            })
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
        } else {
          try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://aegis.ai',
                'X-Title': 'Aegis AI',
              },
              body: JSON.stringify({
                model: 'meta-llama/llama-3-8b-instruct:free',
                messages,
                stream: true,
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              console.error('OpenRouter stream request failed:', errText)
              await stream.writeSSE({
                data: JSON.stringify({ error: 'Failed to retrieve response from AI backend.' }),
                event: 'error',
              })
            } else {
              const reader = response.body?.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              if (reader) {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break

                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split('\n')
                  buffer = lines.pop() || ''

                  for (const line of lines) {
                    const cleanLine = line.trim()
                    if (!cleanLine) continue
                    if (cleanLine === 'data: [DONE]') break

                    if (cleanLine.startsWith('data: ')) {
                      try {
                        const parsed = JSON.parse(cleanLine.slice(6))
                        const content = parsed.choices?.[0]?.delta?.content || ''
                        if (content) {
                          fullReply += content
                          await stream.writeSSE({
                            data: JSON.stringify({ text: content }),
                            event: 'message',
                          })
                        }
                      } catch {
                        // ignore malformed SSE lines
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('SSE streaming error:', e)
            await stream.writeSSE({
              data: JSON.stringify({ error: 'SSE stream connection lost.' }),
              event: 'error',
            })
          }
        }

        // Finalize transcript recording
        if (fullReply) {
          const finalTranscript = [...updatedUserTranscript, { role: 'assistant', content: fullReply }]
          await prisma.conversation.update({
            where: { id: conversation!.id },
            data: { transcript: finalTranscript }
          })
        }
      })
    } catch (err) {
      console.error('Widget chat endpoint error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * Public widget escalation endpoint converting low-score conversations to open rep support tickets.
   */
  public static async escalate(c: Context) {
    try {
      const body = c.req.valid('json' as never) as TicketEscalationInput
      const { orgId, sessionId, userEmail, userSummary } = body

      // 1. Verify Origin
      const origin = c.req.header('Origin')
      const referer = c.req.header('Referer')
      const originOk = await WidgetService.verifyOrigin(orgId, origin, referer)
      if (!originOk) {
        c.status(403)
        return c.json({ error: 'Forbidden: Origin is not permitted.' })
      }

      // 2. Perform escalation database transactions
      const ticket = await WidgetService.escalateConversation({
        orgId,
        sessionId,
        userEmail,
        userSummary,
      })

      c.status(201)
      return c.json({
        message: 'Support ticket escalated and logged successfully.',
        ticketId: ticket.id,
        status: ticket.status,
      })
    } catch (err) {
      console.error('Widget escalate endpoint error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred during escalation.' })
    }
  }
}
